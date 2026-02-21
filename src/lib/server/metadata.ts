/**
 * Metadata service for embedding tags and cover art into audio files
 * Supports FLAC and M4A (AAC) formats using ffmpeg
 */

import { spawn } from 'child_process';
import { unlink, rename, access, constants } from 'fs/promises';
import path from 'path';
import type { Track } from './hifi-client';

// Get ffmpeg path - use system ffmpeg in Docker, ffmpeg-static in dev
let ffmpegPath: string;
try {
	// Try to use ffmpeg-static (for local dev)
	// @ts-expect-error - ffmpeg-static doesn't have types
	ffmpegPath = (await import('ffmpeg-static')).default;
} catch {
	// Fall back to system ffmpeg (for Docker)
	ffmpegPath = 'ffmpeg';
}

export interface TrackMetadata {
	title: string;
	artist: string;
	albumArtist?: string;
	album: string;
	trackNumber: number;
	totalTracks?: number;
	discNumber?: number;
	totalDiscs?: number;
	year?: string;
	genre?: string;
	coverArtPath?: string;
}

/**
 * Extract metadata from a Track object
 */
export function extractMetadata(track: Track, totalTracks?: number): TrackMetadata {
	const artistName = track.artists?.map((a) => a.name).join(', ') || track.artist?.name || 'Unknown Artist';
	const albumArtist = track.album?.artist?.name || track.artist?.name || artistName;
	const year = track.album?.releaseDate?.split('-')[0];

	return {
		title: track.title,
		artist: artistName,
		albumArtist,
		album: track.album?.title || 'Unknown Album',
		trackNumber: track.trackNumber || 1,
		totalTracks,
		discNumber: track.volumeNumber || 1,
		year
	};
}

/**
 * Embed metadata and cover art into an audio file using ffmpeg
 * Supports FLAC and M4A formats
 */
export async function embedMetadata(
	filePath: string,
	metadata: TrackMetadata
): Promise<void> {
	const ext = path.extname(filePath).toLowerCase();
	const tempPath = `${filePath}.temp${ext}`;
	const isM4a = ext === '.m4a';
	const isFlac = ext === '.flac';

	// Build ffmpeg arguments
	const args: string[] = [
		'-i', filePath,
		'-y', // Overwrite output
	];

	// Add cover art if provided
	let hasCoverArt = false;
	if (metadata.coverArtPath) {
		try {
			await access(metadata.coverArtPath, constants.F_OK);
			args.push('-i', metadata.coverArtPath);
			hasCoverArt = true;
		} catch {
			// Cover art file doesn't exist, skip it
		}
	}

	// Map streams - handling differs between FLAC and M4A
	args.push('-map', '0:a'); // Audio from first input
	
	if (hasCoverArt) {
		args.push('-map', '1:v'); // Video (cover) from second input
		if (isM4a) {
			// M4A needs the image re-encoded as MJPEG for compatibility
			args.push('-c:v', 'mjpeg');
			args.push('-q:v', '2'); // High quality
			args.push('-disposition:v', 'attached_pic');
		} else if (isFlac) {
			// FLAC: copy image and set as attached picture with proper metadata
			args.push('-c:v', 'png'); // Re-encode as PNG for FLAC compatibility
			args.push('-disposition:v', 'attached_pic');
			args.push('-metadata:s:v', 'comment=Cover (front)');
		}
	}

	// Copy audio codec (no re-encoding)
	args.push('-c:a', 'copy');

	// Add metadata tags
	if (isFlac) {
		// FLAC uses Vorbis comments (uppercase by convention)
		args.push('-metadata', `TITLE=${metadata.title}`);
		args.push('-metadata', `ARTIST=${metadata.artist}`);
		args.push('-metadata', `ALBUM=${metadata.album}`);
		args.push('-metadata', `TRACKNUMBER=${metadata.trackNumber}`);
		if (metadata.totalTracks) {
			args.push('-metadata', `TRACKTOTAL=${metadata.totalTracks}`);
		}
		if (metadata.discNumber) {
			args.push('-metadata', `DISCNUMBER=${metadata.discNumber}`);
		}
		if (metadata.totalDiscs) {
			args.push('-metadata', `DISCTOTAL=${metadata.totalDiscs}`);
		}
		if (metadata.albumArtist) {
			args.push('-metadata', `ALBUMARTIST=${metadata.albumArtist}`);
		}
		if (metadata.year) {
			args.push('-metadata', `DATE=${metadata.year}`);
		}
		if (metadata.genre) {
			args.push('-metadata', `GENRE=${metadata.genre}`);
		}
	} else {
		// M4A uses iTunes-style tags (lowercase)
		args.push('-metadata', `title=${metadata.title}`);
		args.push('-metadata', `artist=${metadata.artist}`);
		args.push('-metadata', `album=${metadata.album}`);
		args.push('-metadata', `track=${metadata.trackNumber}${metadata.totalTracks ? `/${metadata.totalTracks}` : ''}`);
		if (metadata.discNumber) {
			args.push('-metadata', `disc=${metadata.discNumber}${metadata.totalDiscs ? `/${metadata.totalDiscs}` : ''}`);
		}
		if (metadata.albumArtist) {
			args.push('-metadata', `album_artist=${metadata.albumArtist}`);
		}
		if (metadata.year) {
			args.push('-metadata', `date=${metadata.year}`);
		}
		if (metadata.genre) {
			args.push('-metadata', `genre=${metadata.genre}`);
		}
	}

	// Output file
	args.push(tempPath);

	// Run ffmpeg
	await new Promise<void>((resolve, reject) => {
		const proc = spawn(ffmpegPath, args, {
			stdio: ['ignore', 'pipe', 'pipe']
		});

		let stderr = '';
		proc.stderr?.on('data', (data) => {
			stderr += data.toString();
		});

		proc.on('close', (code) => {
			if (code === 0) {
				resolve();
			} else {
				reject(new Error(`ffmpeg exited with code ${code}: ${stderr}`));
			}
		});

		proc.on('error', (err) => {
			reject(new Error(`Failed to spawn ffmpeg: ${err.message}`));
		});
	});

	// Replace original with tagged version
	await unlink(filePath);
	await rename(tempPath, filePath);
}

/**
 * Check if ffmpeg is available
 */
export async function checkFfmpeg(): Promise<boolean> {
	return new Promise((resolve) => {
		const proc = spawn(ffmpegPath, ['-version'], {
			stdio: ['ignore', 'ignore', 'ignore']
		});

		proc.on('close', (code) => {
			resolve(code === 0);
		});

		proc.on('error', () => {
			resolve(false);
		});
	});
}
