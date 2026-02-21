/**
 * Serve cover art from the library
 * GET /api/library/cover?path=/path/to/album
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { readFile } from 'fs/promises';
import { join, resolve } from 'path';
import { env } from '$lib/server/env';

export const GET: RequestHandler = async ({ url }) => {
	const albumPath = url.searchParams.get('path');
	
	if (!albumPath) {
		return json({ error: 'Missing path parameter' }, { status: 400 });
	}
	
	// Security: ensure the path is within MUSIC_DIR (resolve to absolute paths for comparison)
	const resolvedMusicDir = resolve(env.MUSIC_DIR);
	const resolvedAlbumPath = resolve(albumPath);
	
	if (!resolvedAlbumPath.startsWith(resolvedMusicDir)) {
		return json({ error: 'Invalid path' }, { status: 403 });
	}
	
	const coverPath = join(albumPath, 'cover.jpg');
	
	try {
		const coverData = await readFile(coverPath);
		
		return new Response(coverData, {
			headers: {
				'Content-Type': 'image/jpeg',
				'Cache-Control': 'public, max-age=31536000, immutable'
			}
		});
	} catch {
		// Return a 404 if cover doesn't exist
		return json({ error: 'Cover not found' }, { status: 404 });
	}
};
