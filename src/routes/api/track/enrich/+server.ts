import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { enrichTrackMetadata } from '$lib/server/musicbrainz-client';
import { embedMetadata, saveMetadataJSON, mergeMetadata } from '$lib/server/metadata';
import * as mm from 'music-metadata';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const { trackPath } = await request.json();

		if (!trackPath || typeof trackPath !== 'string') {
			return json({ error: 'Invalid track path' }, { status: 400 });
		}

		console.log(`[Enrich Single] Starting enrichment for: ${trackPath}`);

		// Read existing FLAC metadata
		const metadata = await mm.parseFile(trackPath);
		const title = metadata.common.title || 'Unknown';
		const artist = metadata.common.artist || 'Unknown Artist';
		const isrc = metadata.common.isrc?.[0];

		console.log(
			`[Enrich Single] Searching for: "${title}" by "${artist}"${isrc ? ` (ISRC: ${isrc})` : ''}`
		);

		// Fetch enriched metadata from MusicBrainz
		const enrichedData = await enrichTrackMetadata(isrc, artist, title);

		if (enrichedData) {
			const confidence = (enrichedData.matchConfidence || 1) * 100;
			console.log(`[Enrich Single] Found MusicBrainz data (confidence: ${confidence.toFixed(0)}%)`);
			console.log(`[Enrich Single] Enriched data:`, JSON.stringify(enrichedData, null, 2));

			// Prepare basic metadata for merging
			const basicMetadata = {
				title,
				artist,
				albumArtist: metadata.common.albumartist || artist,
				album: metadata.common.album || 'Unknown Album',
				year: metadata.common.year?.toString() || metadata.common.date?.split('-')[0],
				trackNumber: metadata.common.track.no || 1,
				discNumber: metadata.common.disk.no || undefined,
				isrc
			};

			// Merge basic + enriched metadata
			const fullMetadata = mergeMetadata(basicMetadata, enrichedData);

			// Extract year from releaseDate if year is still missing
			if (!fullMetadata.year && fullMetadata.releaseDate) {
				fullMetadata.year = fullMetadata.releaseDate.split('-')[0];
			}

			console.log(`[Enrich Single] Final merged metadata:`, JSON.stringify(fullMetadata, null, 2));

			// Save to JSON sidecar
			await saveMetadataJSON(trackPath, fullMetadata);
			console.log(`[Enrich Single] Saved metadata JSON`);

			// Re-embed in FLAC
			await embedMetadata(trackPath, fullMetadata);
			console.log(`[Enrich Single] Re-embedded FLAC tags`);

			return json({
				success: true,
				enriched: true,
				confidence: confidence
			});
		} else {
			console.log(`[Enrich Single] No MusicBrainz match found`);
			return json({
				success: true,
				enriched: false,
				message: 'No MusicBrainz match found'
			});
		}
	} catch (error) {
		console.error('[Enrich Single] Error:', error);
		return json(
			{
				error: error instanceof Error ? error.message : 'Failed to enrich track'
			},
			{ status: 500 }
		);
	}
};
