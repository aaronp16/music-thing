import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { scanLibrary } from '$lib/server/library';
import { rm, readdir, stat } from 'fs/promises';
import path from 'path';

export const GET: RequestHandler = async () => {
	try {
		const library = await scanLibrary();
		return json(library);
	} catch (error) {
		console.error('Library scan failed:', error);
		return json({ error: 'Failed to scan library' }, { status: 500 });
	}
};

async function isOnlyAlbumInArtist(albumPath: string): Promise<boolean> {
	const artistPath = path.dirname(albumPath);
	try {
		const entries = await readdir(artistPath);
		let albumCount = 0;
		for (const entry of entries) {
			const entryPath = path.join(artistPath, entry);
			const stats = await stat(entryPath);
			if (stats.isDirectory() && entry !== 'artist.jpg') {
				albumCount++;
			}
		}
		return albumCount === 1;
	} catch {
		return false;
	}
}

export const DELETE: RequestHandler = async ({ request }) => {
	try {
		const { path: itemPath, type } = await request.json();

		if (!itemPath || !type) {
			return json({ error: 'Missing path or type' }, { status: 400 });
		}

		if (!['track', 'album', 'artist'].includes(type)) {
			return json({ error: 'Invalid type' }, { status: 400 });
		}

		let deletePath = itemPath;

		if (type === 'album') {
			const artistPath = path.dirname(itemPath);
			if (await isOnlyAlbumInArtist(itemPath)) {
				deletePath = artistPath;
			}
		}

		await rm(deletePath, { recursive: true, force: true });

		return json({ success: true });
	} catch (error) {
		console.error('Delete failed:', error);
		return json({ error: 'Failed to delete' }, { status: 500 });
	}
};
