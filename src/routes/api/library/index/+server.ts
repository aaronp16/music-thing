/**
 * Library index API - returns a lightweight set of track keys for "in library" checking
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { readdir, stat } from 'fs/promises';
import { join } from 'path';
import { env } from '$lib/server/env';

/**
 * Sanitize name to match how files are saved
 */
function sanitize(name: string): string {
	return name.replace(/[<>:"/\\|?*]/g, '_').trim();
}

/**
 * Check if path is a directory
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
 * Generate a track key for matching: "artist|album|disk|trackname" (all lowercase, sanitized)
 * Disk is 0 for single-disk albums, or the disk number for multi-disk albums
 */
function makeTrackKey(artist: string, album: string, diskNum: number, trackName: string): string {
	// Remove track number prefix and extension from filename
	// e.g., "01 - Track Name.flac" -> "track name"
	const cleanTrackName = trackName
		.replace(/^\d+\s*-\s*/, '') // Remove "01 - " prefix
		.replace(/\.(flac|m4a|mp3|wav|ogg)$/i, '') // Remove extension
		.toLowerCase()
		.trim();
	
	return `${artist.toLowerCase()}|${album.toLowerCase()}|${diskNum}|${cleanTrackName}`;
}

export const GET: RequestHandler = async () => {
	const musicDir = env.MUSIC_DIR;
	const tracks: string[] = [];

	try {
		if (!(await isDirectory(musicDir))) {
			return json({ tracks: [] });
		}

		// Scan artist directories
		const artistDirs = await readdir(musicDir);

		for (const artistName of artistDirs) {
			const artistPath = join(musicDir, artistName);
			if (!(await isDirectory(artistPath))) continue;

			// Scan album directories
			const albumDirs = await readdir(artistPath);

			for (const albumName of albumDirs) {
				const albumPath = join(artistPath, albumName);
				if (!(await isDirectory(albumPath))) continue;

				const albumContents = await readdir(albumPath);
				
				// Check for disk folders
				const diskFolders = albumContents.filter(f => f.startsWith('Disk '));
				
			if (diskFolders.length > 0) {
				// Multi-disk album - scan each disk folder
				for (const diskName of diskFolders) {
					const diskPath = join(albumPath, diskName);
					if (!(await isDirectory(diskPath))) continue;

					// Extract disk number from folder name (e.g., "Disk 1" -> 1)
					const diskNum = parseInt(diskName.replace('Disk ', ''), 10) || 1;

					const files = await readdir(diskPath);
					for (const fileName of files) {
						if (fileName.endsWith('.flac') || fileName.endsWith('.mp3') || fileName.endsWith('.m4a')) {
							tracks.push(makeTrackKey(artistName, albumName, diskNum, fileName));
						}
					}
				}
			} else {
				// Single disk - use disk 0
				for (const fileName of albumContents) {
					if (fileName.endsWith('.flac') || fileName.endsWith('.mp3') || fileName.endsWith('.m4a')) {
						tracks.push(makeTrackKey(artistName, albumName, 0, fileName));
					}
				}
			}
			}
		}

		return json({ tracks });
	} catch (error) {
		console.error('Library index error:', error);
		return json({ tracks: [] });
	}
};
