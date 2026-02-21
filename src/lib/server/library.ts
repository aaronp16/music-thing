/**
 * Library scanner - scans the music directory and returns folder structure
 */

import { readdir, stat } from 'fs/promises';
import { join } from 'path';
import { env } from './env';
import { parseFile } from 'music-metadata';

// =============================================================================
// Types
// =============================================================================

export interface LibraryTrack {
	name: string;
	path: string;
	format: string; // 'flac', 'm4a', etc.
	quality: string; // 'LOSSLESS', 'HI_RES', 'HIGH', 'LOW', or custom like '320kbps'
}

export interface LibraryAlbum {
	name: string;
	path: string;
	tracks: LibraryTrack[];
	hasCover: boolean;
}

export interface LibraryArtist {
	name: string;
	path: string;
	albums: LibraryAlbum[];
}

export interface Library {
	artists: LibraryArtist[];
	totalArtists: number;
	totalAlbums: number;
	totalTracks: number;
}

// =============================================================================
// Quality Detection
// =============================================================================

/**
 * Determine quality label from audio metadata
 */
async function getTrackQuality(filePath: string): Promise<{ format: string; quality: string }> {
	const ext = filePath.split('.').pop()?.toLowerCase() || '';
	
	try {
		const metadata = await parseFile(filePath, { duration: false, skipCovers: true });
		const { sampleRate, bitsPerSample, bitrate, codec } = metadata.format;
		
		if (ext === 'flac') {
			// FLAC: Check sample rate and bit depth
			// HI_RES: typically 96kHz/24-bit or higher
			// LOSSLESS: typically 44.1kHz/16-bit
			if (sampleRate && bitsPerSample) {
				if (sampleRate > 48000 || bitsPerSample > 16) {
					return { format: 'FLAC', quality: `${bitsPerSample}bit/${Math.round(sampleRate / 1000)}kHz` };
				}
				return { format: 'FLAC', quality: `${bitsPerSample}bit/${(sampleRate / 1000).toFixed(1)}kHz` };
			}
			return { format: 'FLAC', quality: 'Lossless' };
		}
		
		if (ext === 'm4a' || codec?.toLowerCase().includes('aac')) {
			// M4A/AAC: Check bitrate
			// HIGH: ~320kbps
			// LOW: ~96kbps
			if (bitrate) {
				const kbps = Math.round(bitrate / 1000);
				if (kbps >= 256) {
					return { format: 'AAC', quality: `${kbps}kbps` };
				} else if (kbps >= 128) {
					return { format: 'AAC', quality: `${kbps}kbps` };
				} else {
					return { format: 'AAC', quality: `${kbps}kbps` };
				}
			}
			return { format: 'AAC', quality: 'Lossy' };
		}
		
		if (ext === 'mp3') {
			if (bitrate) {
				return { format: 'MP3', quality: `${Math.round(bitrate / 1000)}kbps` };
			}
			return { format: 'MP3', quality: 'Lossy' };
		}
		
		return { format: ext.toUpperCase(), quality: 'Unknown' };
	} catch {
		// If metadata parsing fails, just return basic info
		return { format: ext.toUpperCase(), quality: '' };
	}
}

// =============================================================================
// Scanner
// =============================================================================

/**
 * Check if a path exists and is a directory
 */
async function isDirectory(path: string): Promise<boolean> {
	try {
		const s = await stat(path);
		return s.isDirectory();
	} catch {
		return false;
	}
}

/**
 * Check if a file exists
 */
async function fileExists(path: string): Promise<boolean> {
	try {
		await stat(path);
		return true;
	} catch {
		return false;
	}
}

/**
 * Scan the music directory and return the library structure
 * Structure: MUSIC_DIR/Artist/Album/01 - Track.flac
 */
export async function scanLibrary(): Promise<Library> {
	const musicDir = env.MUSIC_DIR;
	const artists: LibraryArtist[] = [];
	let totalAlbums = 0;
	let totalTracks = 0;

	// Check if music directory exists
	if (!(await isDirectory(musicDir))) {
		return { artists: [], totalArtists: 0, totalAlbums: 0, totalTracks: 0 };
	}

	// Read artist directories
	const artistDirs = await readdir(musicDir);

	for (const artistName of artistDirs.sort()) {
		const artistPath = join(musicDir, artistName);

		if (!(await isDirectory(artistPath))) {
			continue;
		}

		const artist: LibraryArtist = {
			name: artistName,
			path: artistPath,
			albums: []
		};

		// Read album directories
		const albumDirs = await readdir(artistPath);

		for (const albumName of albumDirs.sort()) {
			const albumPath = join(artistPath, albumName);

			if (!(await isDirectory(albumPath))) {
				continue;
			}

			const album: LibraryAlbum = {
				name: albumName,
				path: albumPath,
				tracks: [],
				hasCover: await fileExists(join(albumPath, 'cover.jpg'))
			};

			// Read track files
			const files = await readdir(albumPath);

			for (const fileName of files.sort()) {
				// Only include audio files
				if (fileName.endsWith('.flac') || fileName.endsWith('.mp3') || fileName.endsWith('.m4a')) {
					const trackPath = join(albumPath, fileName);
					const { format, quality } = await getTrackQuality(trackPath);
					album.tracks.push({
						name: fileName,
						path: trackPath,
						format,
						quality
					});
					totalTracks++;
				}
			}

			// Only include albums with tracks
			if (album.tracks.length > 0) {
				artist.albums.push(album);
				totalAlbums++;
			}
		}

		// Only include artists with albums
		if (artist.albums.length > 0) {
			artists.push(artist);
		}
	}

	return {
		artists,
		totalArtists: artists.length,
		totalAlbums,
		totalTracks
	};
}
