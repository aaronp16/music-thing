/**
 * Get track metadata (embedded + sidecar JSON)
 * GET /api/track/metadata?path=/path/to/track.flac
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
// Sidecar JSON metadata removed; only return embedded tags
import { parseFile } from 'music-metadata';
import { stat, access, constants } from 'fs/promises';
import { resolve } from 'path';
import { env } from '$lib/server/env';

export const GET: RequestHandler = async ({ url }) => {
	const trackPath = url.searchParams.get('path');

	if (!trackPath) {
		return json({ error: 'Missing path parameter' }, { status: 400 });
	}

	// Security: ensure the path is within MUSIC_DIR
	const resolvedMusicDir = resolve(env.MUSIC_DIR);
	const resolvedTrackPath = resolve(trackPath);

	if (!resolvedTrackPath.startsWith(resolvedMusicDir)) {
		return json({ error: 'Invalid path' }, { status: 403 });
	}

	try {
		// Check if file exists
		await access(resolvedTrackPath, constants.F_OK);

		// Read embedded metadata from audio file
		const audioMetadata = await parseFile(resolvedTrackPath, { duration: true, skipCovers: true });

		const sidecarMetadata = null;

		// Get file stats
		const fileStat = await stat(resolvedTrackPath);

		// Extract embedded metadata
		const embedded = {
			// Basic tags
			title: audioMetadata.common.title,
			artist: audioMetadata.common.artist,
			albumArtist: audioMetadata.common.albumartist,
			album: audioMetadata.common.album,
			trackNumber: audioMetadata.common.track.no,
			totalTracks: audioMetadata.common.track.of,
			discNumber: audioMetadata.common.disk.no,
			totalDiscs: audioMetadata.common.disk.of,
			year: audioMetadata.common.year?.toString(),
			date: audioMetadata.common.date,

			// Extended tags (Vorbis comments)
			isrc: audioMetadata.common.isrc?.[0],
			barcode: audioMetadata.native?.vorbis?.find((t) => t.id === 'BARCODE')?.value,
			label: audioMetadata.native?.vorbis?.find((t) => t.id === 'LABEL')?.value,
			catalogNumber: audioMetadata.native?.vorbis?.find((t) => t.id === 'CATALOGNUMBER')?.value,
			originalDate: audioMetadata.native?.vorbis?.find((t) => t.id === 'ORIGINALDATE')?.value,
			releaseDate: audioMetadata.native?.vorbis?.find((t) => t.id === 'RELEASEDATE')?.value,
			releaseCountry: audioMetadata.native?.vorbis?.find((t) => t.id === 'RELEASECOUNTRY')?.value,

			// Credits
			composer: audioMetadata.native?.vorbis?.find((t) => t.id === 'COMPOSER')?.value,
			lyricist: audioMetadata.native?.vorbis?.find((t) => t.id === 'LYRICIST')?.value,
			producer: audioMetadata.native?.vorbis?.find((t) => t.id === 'PRODUCER')?.value,
			engineer: audioMetadata.native?.vorbis?.find((t) => t.id === 'ENGINEER')?.value,

			// Genres (can be multiple)
			genres: audioMetadata.common.genre,

			// MusicBrainz IDs (preserved if embedded)
			mbid_recording:
				audioMetadata.native?.vorbis?.find((t) => t.id === 'MUSICBRAINZ_TRACKID')?.value || null,
			mbid_release:
				audioMetadata.native?.vorbis?.find((t) => t.id === 'MUSICBRAINZ_ALBUMID')?.value || null,
			mbid_artist:
				audioMetadata.native?.vorbis?.find((t) => t.id === 'MUSICBRAINZ_ARTISTID')?.value || null
		};

		// No sidecar/enrichment data is returned; response contains embedded tags only

		// Audio format info
		const format = {
			codec: audioMetadata.format.codec,
			sampleRate: audioMetadata.format.sampleRate,
			bitsPerSample: audioMetadata.format.bitsPerSample,
			bitrate: audioMetadata.format.bitrate,
			duration: audioMetadata.format.duration,
			container: audioMetadata.format.container
		};

		return json({
			embedded,
			format,
			filePath: resolvedTrackPath,
			fileSize: fileStat.size,
			modifiedAt: fileStat.mtime.toISOString()
		});
	} catch (error) {
		console.error('Failed to read track metadata:', error);
		return json({ error: 'Failed to read track metadata' }, { status: 500 });
	}
};
