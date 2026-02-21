/**
 * Stats API endpoint - returns disk space info for the music directory
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$lib/server/env';
import { statfs } from 'fs/promises';
import { stat, mkdir } from 'fs/promises';

export interface DiskStats {
	total: number;
	free: number;
	used: number;
	musicDirSize: number;
	path: string;
}

/**
 * Get directory size recursively (approximate, for display purposes)
 */
async function getDirectorySize(dirPath: string): Promise<number> {
	const { readdir } = await import('fs/promises');
	const { join } = await import('path');

	let size = 0;

	try {
		const entries = await readdir(dirPath, { withFileTypes: true });

		for (const entry of entries) {
			const fullPath = join(dirPath, entry.name);

			if (entry.isDirectory()) {
				size += await getDirectorySize(fullPath);
			} else if (entry.isFile()) {
				try {
					const fileStat = await stat(fullPath);
					size += fileStat.size;
				} catch {
					// Skip files we can't stat
				}
			}
		}
	} catch {
		// Directory doesn't exist or can't be read
	}

	return size;
}

export const GET: RequestHandler = async () => {
	try {
		const musicDir = env.MUSIC_DIR;

		// Ensure music directory exists
		try {
			await mkdir(musicDir, { recursive: true });
		} catch {
			// Already exists
		}

		// Get filesystem stats using statfs (works on macOS and Linux)
		const fsStats = await statfs(musicDir);

		// Calculate sizes in bytes
		// statfs returns block counts, multiply by block size
		const blockSize = fsStats.bsize;
		const total = fsStats.blocks * blockSize;
		const free = fsStats.bfree * blockSize;
		const used = total - free;

		// Get music directory size
		const musicDirSize = await getDirectorySize(musicDir);

		const stats: DiskStats = {
			total,
			free,
			used,
			musicDirSize,
			path: musicDir
		};

		return json(stats);
	} catch (error) {
		console.error('Failed to get disk stats:', error);
		return json(
			{ error: 'Failed to get disk stats' },
			{ status: 500 }
		);
	}
};
