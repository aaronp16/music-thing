import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { searchTracks, searchAlbums, searchArtists } from '$lib/server/hifi-client';

export const GET: RequestHandler = async ({ url }) => {
	const query = url.searchParams.get('q');
	const type = url.searchParams.get('type') || 'tracks';

	if (!query) {
		return json({ error: 'Missing query parameter' }, { status: 400 });
	}

	try {
		if (type === 'albums') {
			const results = await searchAlbums(query);
			return json(results);
		} else if (type === 'artists') {
			const results = await searchArtists(query);
			return json(results);
		} else {
			const results = await searchTracks(query);
			return json(results);
		}
	} catch (error) {
		console.error('Search error:', error);
		return json(
			{ error: error instanceof Error ? error.message : 'Search failed' },
			{ status: 500 }
		);
	}
};
