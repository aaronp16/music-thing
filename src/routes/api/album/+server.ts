import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAlbum } from '$lib/server/hifi-client';

export const GET: RequestHandler = async ({ url }) => {
	const id = url.searchParams.get('id');

	if (!id) {
		return json({ error: 'Missing id parameter' }, { status: 400 });
	}

	const albumId = parseInt(id, 10);
	if (isNaN(albumId)) {
		return json({ error: 'Invalid id parameter' }, { status: 400 });
	}

	try {
		const album = await getAlbum(albumId);
		return json(album);
	} catch (error) {
		console.error('Album fetch error:', error);
		return json(
			{ error: error instanceof Error ? error.message : 'Failed to fetch album' },
			{ status: 500 }
		);
	}
};
