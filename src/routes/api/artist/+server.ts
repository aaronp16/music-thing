import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getArtistInfo, getArtistDiscography, getSimilarArtists } from '$lib/server/hifi-client';

export const GET: RequestHandler = async ({ url }) => {
	const id = url.searchParams.get('id');

	if (!id) {
		return json({ error: 'Missing id parameter' }, { status: 400 });
	}

	const artistId = parseInt(id, 10);
	if (isNaN(artistId)) {
		return json({ error: 'Invalid id parameter' }, { status: 400 });
	}

	try {
		// Fetch all artist data in parallel
		const [artistInfo, discography, similar] = await Promise.all([
			getArtistInfo(artistId),
			getArtistDiscography(artistId),
			getSimilarArtists(artistId).catch(() => ({ artists: [] })) // Don't fail if similar artists fails
		]);

		return json({
			artist: artistInfo.artist,
			cover: artistInfo.cover,
			albums: discography.albums?.items || [],
			topTracks: discography.tracks || [],
			similarArtists: similar.artists || []
		});
	} catch (error) {
		console.error('Artist fetch error:', error);
		return json(
			{ error: error instanceof Error ? error.message : 'Failed to fetch artist' },
			{ status: 500 }
		);
	}
};
