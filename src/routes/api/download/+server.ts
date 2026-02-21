import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { startTrackDownload, startAlbumDownload } from '$lib/server/downloader';
import { getTrackInfo } from '$lib/server/hifi-client';
import { DEFAULT_QUALITY, type Quality } from '$lib/types';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const { type, id, track, quality = DEFAULT_QUALITY } = body as {
			type: 'track' | 'album';
			id: number;
			track?: Parameters<typeof startTrackDownload>[0];
			quality?: Quality;
		};

		if (!type || !id) {
			return json({ error: 'Missing type or id' }, { status: 400 });
		}

		let jobId: string;

		if (type === 'track') {
			// If full track object provided, use it; otherwise fetch it
			const trackData = track || await getTrackInfo(id);
			jobId = await startTrackDownload(trackData, quality);
		} else if (type === 'album') {
			jobId = await startAlbumDownload(id, quality);
		} else {
			return json({ error: 'Invalid type. Must be "track" or "album"' }, { status: 400 });
		}

		return json({ jobId });
	} catch (error) {
		console.error('Download error:', error);
		return json(
			{ error: error instanceof Error ? error.message : 'Download failed' },
			{ status: 500 }
		);
	}
};
