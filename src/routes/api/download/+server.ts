import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { startTrackDownload, startAlbumDownload } from '$lib/server/downloader';
import { getTrackInfo, getAlbum, type Track } from '$lib/server/hifi-client';
import { DEFAULT_QUALITY, type Quality } from '$lib/types';

interface AlbumInfo {
	id: number;
	title: string;
	artistName: string;
	tracks: {
		id: number;
		title: string;
		trackNumber: number;
	}[];
}

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const { type, id, track, quality = DEFAULT_QUALITY, selectedTrackIds } = body as {
			type: 'track' | 'album';
			id: number;
			track?: Parameters<typeof startTrackDownload>[0];
			quality?: Quality;
			selectedTrackIds?: number[];
		};

		if (!type || !id) {
			return json({ error: 'Missing type or id' }, { status: 400 });
		}

		let jobId: string;
		let pendingTracks: AlbumInfo['tracks'] | null = null;
		let albumTitle: string | undefined;
		let artistName: string | undefined;

		if (type === 'track') {
			const trackData = track || await getTrackInfo(id);
			jobId = await startTrackDownload(trackData, quality);
		} else if (type === 'album') {
			const album = await getAlbum(id);
			jobId = await startAlbumDownload(id, quality, selectedTrackIds);
			
			// Filter pending tracks based on selection
			const allTracks = album.tracks.map(t => ({
				id: t.id,
				title: t.title,
				trackNumber: t.trackNumber
			}));
			
			if (selectedTrackIds && selectedTrackIds.length > 0) {
				pendingTracks = allTracks.filter(t => selectedTrackIds.includes(t.id));
			} else {
				pendingTracks = allTracks;
			}
			albumTitle = album.title;
			artistName = album.artist?.name || album.artists?.[0]?.name;
		} else {
			return json({ error: 'Invalid type. Must be "track" or "album"' }, { status: 400 });
		}

		return json({ 
			jobId,
			...(pendingTracks && { pendingTracks, albumTitle, artistName })
		});
	} catch (error) {
		console.error('Download error:', error);
		return json(
			{ error: error instanceof Error ? error.message : 'Download failed' },
			{ status: 500 }
		);
	}
};
