/**
 * Serve artist images from the library
 * GET /api/library/artist?path=/path/to/artist
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { readFile } from 'fs/promises';
import { join, resolve } from 'path';
import { env } from '$lib/server/env';

export const GET: RequestHandler = async ({ url }) => {
	const artistPath = url.searchParams.get('path');
	
	if (!artistPath) {
		return json({ error: 'Missing path parameter' }, { status: 400 });
	}
	
	// Security: ensure the path is within MUSIC_DIR (resolve to absolute paths for comparison)
	const resolvedMusicDir = resolve(env.MUSIC_DIR);
	const resolvedArtistPath = resolve(artistPath);
	
	if (!resolvedArtistPath.startsWith(resolvedMusicDir)) {
		return json({ error: 'Invalid path' }, { status: 403 });
	}
	
	const artistImagePath = join(artistPath, 'artist.jpg');
	
	try {
		const imageData = await readFile(artistImagePath);
		
		return new Response(imageData, {
			headers: {
				'Content-Type': 'image/jpeg',
				'Cache-Control': 'public, max-age=31536000, immutable'
			}
		});
	} catch {
		// Return a 404 if artist image doesn't exist
		return json({ error: 'Artist image not found' }, { status: 404 });
	}
};
