/**
 * Metadata service for embedding tags and cover art into audio files
 * Supports FLAC and M4A (AAC) formats using ffmpeg
 */

import { spawn } from 'child_process';
import { unlink, rename, access, constants, writeFile, readFile } from 'fs/promises';
import path from 'path';
import type { Track } from './hifi-client';
import type { EnrichedMetadata } from './musicbrainz-client';

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

	// Extended metadata from MusicBrainz
	isrc?: string;
	barcode?: string;
	label?: string;
	catalogNumber?: string;
	originalDate?: string;
	releaseDate?: string;
	releaseCountry?: string;
	composer?: string;
	lyricist?: string;
	producer?: string;
	engineer?: string;
	genres?: string[];

	// MusicBrainz IDs
	mbid_recording?: string;
	mbid_release?: string;
	mbid_artist?: string;

	// Enrichment metadata
	enrichedAt?: string;
	enrichedFrom?: 'musicbrainz';
	matchConfidence?: number;
}

/**
 * Extract metadata from a Track object
 */
export function extractMetadata(track: Track, totalTracks?: number): TrackMetadata {
	const artistName =
		track.artists?.map((a) => a.name).join(', ') || track.artist?.name || 'Unknown Artist';
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
export async function embedMetadata(filePath: string, metadata: TrackMetadata): Promise<void> {
	const ext = path.extname(filePath).toLowerCase();
	const tempPath = `${filePath}.temp${ext}`;
	const isM4a = ext === '.m4a';
	const isFlac = ext === '.flac';

	// Build ffmpeg arguments
	const args: string[] = [
		'-i',
		filePath,
		'-y' // Overwrite output
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

		// Extended metadata fields
		if (metadata.isrc) {
			args.push('-metadata', `ISRC=${metadata.isrc}`);
		}
		if (metadata.barcode) {
			args.push('-metadata', `BARCODE=${metadata.barcode}`);
		}
		if (metadata.label) {
			args.push('-metadata', `LABEL=${metadata.label}`);
		}
		if (metadata.catalogNumber) {
			args.push('-metadata', `CATALOGNUMBER=${metadata.catalogNumber}`);
		}
		if (metadata.originalDate) {
			args.push('-metadata', `ORIGINALDATE=${metadata.originalDate}`);
		}
		if (metadata.releaseDate) {
			args.push('-metadata', `RELEASEDATE=${metadata.releaseDate}`);
		}
		if (metadata.releaseCountry) {
			args.push('-metadata', `RELEASECOUNTRY=${metadata.releaseCountry}`);
		}
		if (metadata.composer) {
			args.push('-metadata', `COMPOSER=${metadata.composer}`);
		}
		if (metadata.lyricist) {
			args.push('-metadata', `LYRICIST=${metadata.lyricist}`);
		}
		if (metadata.producer) {
			args.push('-metadata', `PRODUCER=${metadata.producer}`);
		}
		if (metadata.engineer) {
			args.push('-metadata', `ENGINEER=${metadata.engineer}`);
		}

		// Genres - add both old single genre and new multi-genre
		if (metadata.genre) {
			args.push('-metadata', `GENRE=${metadata.genre}`);
		}
		if (metadata.genres && metadata.genres.length > 0) {
			// Add each genre as a separate tag (Vorbis comments support multiple values)
			for (const genre of metadata.genres) {
				args.push('-metadata', `GENRE=${genre}`);
			}
		}

		// MusicBrainz IDs
		if (metadata.mbid_recording) {
			args.push('-metadata', `MUSICBRAINZ_TRACKID=${metadata.mbid_recording}`);
		}
		if (metadata.mbid_release) {
			args.push('-metadata', `MUSICBRAINZ_ALBUMID=${metadata.mbid_release}`);
		}
		if (metadata.mbid_artist) {
			args.push('-metadata', `MUSICBRAINZ_ARTISTID=${metadata.mbid_artist}`);
		}
	} else {
		// M4A uses iTunes-style tags (lowercase)
		args.push('-metadata', `title=${metadata.title}`);
		args.push('-metadata', `artist=${metadata.artist}`);
		args.push('-metadata', `album=${metadata.album}`);
		args.push(
			'-metadata',
			`track=${metadata.trackNumber}${metadata.totalTracks ? `/${metadata.totalTracks}` : ''}`
		);
		if (metadata.discNumber) {
			args.push(
				'-metadata',
				`disc=${metadata.discNumber}${metadata.totalDiscs ? `/${metadata.totalDiscs}` : ''}`
			);
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
 * Save metadata to sidecar JSON file
 */
export async function saveMetadataJSON(
	audioFilePath: string,
	metadata: TrackMetadata
): Promise<void> {
	const jsonPath = audioFilePath.replace(/\.\w+$/, '.metadata.json');

	// Filter out coverArtPath since it's not needed in sidecar
	const { coverArtPath, ...metadataToSave } = metadata;

	await writeFile(jsonPath, JSON.stringify(metadataToSave, null, 2), 'utf-8');
}

/**
 * Load metadata from sidecar JSON file
 */
export async function loadMetadataJSON(audioFilePath: string): Promise<TrackMetadata | null> {
	const jsonPath = audioFilePath.replace(/\.\w+$/, '.metadata.json');

	try {
		const content = await readFile(jsonPath, 'utf-8');
		return JSON.parse(content);
	} catch {
		return null;
	}
}

/**
 * Merge enriched metadata with basic metadata
 */
export function mergeMetadata(
	basic: TrackMetadata,
	enriched: EnrichedMetadata | null
): TrackMetadata {
	if (!enriched) {
		return basic;
	}

	return {
		...basic,
		...enriched,
		// Don't override basic fields with undefined from enriched
		title: basic.title,
		artist: basic.artist,
		album: basic.album,
		trackNumber: basic.trackNumber
	};
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
