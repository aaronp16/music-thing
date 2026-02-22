import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAlbum, getArtistDiscography, getSimilarAlbums, type Album } from '$lib/server/hifi-client';

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
		
		// Fetch artist albums and similar albums in parallel
		const artistId = album.artist?.id || album.artists?.[0]?.id;
		
		const [artistAlbumsResult, similarAlbumsResult] = await Promise.allSettled([
			artistId ? getArtistDiscography(artistId) : Promise.resolve(null),
			getSimilarAlbums(albumId)
		]);
		
		// Get artist's other albums (excluding current album, deduplicated by title)
		let artistAlbums: Album[] = [];
		if (artistAlbumsResult.status === 'fulfilled' && artistAlbumsResult.value) {
			const seen = new Set<string>();
			artistAlbums = artistAlbumsResult.value.albums.items
				.filter(a => {
					if (a.id === albumId) return false;
					const key = a.title.toLowerCase();
					if (seen.has(key)) return false;
					seen.add(key);
					return true;
				})
				.slice(0, 10);
		}
		
		// Get similar albums (deduplicated by title)
		let similarAlbums: Album[] = [];
		if (similarAlbumsResult.status === 'fulfilled' && similarAlbumsResult.value) {
			const rawAlbums = similarAlbumsResult.value.albums || [];
			const seen = new Set<string>();
			similarAlbums = rawAlbums
				.filter(a => {
					if (a.id === albumId) return false;
					const key = a.title.toLowerCase();
					if (seen.has(key)) return false;
					seen.add(key);
					return true;
				})
				.slice(0, 10);
		}
		
		return json({
			...album,
			artistAlbums,
			similarAlbums
		});
	} catch (error) {
		console.error('Album fetch error:', error);
		return json(
			{ error: error instanceof Error ? error.message : 'Failed to fetch album' },
			{ status: 500 }
		);
	}
};
