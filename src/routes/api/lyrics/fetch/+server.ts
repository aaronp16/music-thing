/**
 * Fetch lyrics for a single track
 * POST /api/lyrics/fetch
 * Body: { trackPath: string }
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { fetchAndSaveLyrics } from '$lib/server/metadata';
import { parseFile } from 'music-metadata';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const { trackPath } = await request.json();

		if (!trackPath || typeof trackPath !== 'string') {
			return json({ error: 'Invalid track path' }, { status: 400 });
		}

		console.log(`[Lyrics] Fetching lyrics for: ${trackPath}`);

		// Read track metadata to get artist/title/album/duration
		const metadata = await parseFile(trackPath, { duration: true, skipCovers: true });
		const artist = metadata.common.artist || 'Unknown Artist';
		const title = metadata.common.title || 'Unknown';
		const album = metadata.common.album;
		const duration = metadata.format.duration;

		if (!artist || !title) {
			return json({ error: 'Track missing artist or title metadata' }, { status: 400 });
		}

		// Fetch and save lyrics
		const lyricsData = await fetchAndSaveLyrics({
			trackPath,
			artist,
			title,
			album,
			duration
		});

		if (lyricsData) {
			return json({
				success: true,
				found: true,
				hasPlain: !!lyricsData.plain,
				hasSynced: !!lyricsData.synced
			});
		} else {
			return json({
				success: true,
				found: false,
				message: 'No lyrics found'
			});
		}
	} catch (error) {
		console.error('[Lyrics] Error:', error);
		return json(
			{
				error: error instanceof Error ? error.message : 'Failed to fetch lyrics'
			},
			{ status: 500 }
		);
	}
};
