/**
 * Get track metadata (embedded + sidecar JSON)
 * GET /api/track/metadata?path=/path/to/track.flac
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { loadMetadataJSON, loadLyricsSidecar } from '$lib/server/metadata';
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

		// Read sidecar JSON if it exists
		const sidecarMetadata = await loadMetadataJSON(resolvedTrackPath);

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

			// MusicBrainz IDs
			mbid_recording: audioMetadata.native?.vorbis?.find((t) => t.id === 'MUSICBRAINZ_TRACKID')
				?.value,
			mbid_release: audioMetadata.native?.vorbis?.find((t) => t.id === 'MUSICBRAINZ_ALBUMID')
				?.value,
			mbid_artist: audioMetadata.native?.vorbis?.find((t) => t.id === 'MUSICBRAINZ_ARTISTID')
				?.value,

			// Lyrics (extract text from ILyricsTag or Vorbis comment)
			lyrics:
				audioMetadata.common.lyrics?.[0]?.text ||
				audioMetadata.native?.vorbis?.find((t) => t.id === 'LYRICS')?.value,
			syncedLyrics: audioMetadata.native?.vorbis?.find((t) => t.id === 'SYNCEDLYRICS')?.value
		};

		// Check for lyrics sidecar files if not embedded
		if (!embedded.lyrics && !embedded.syncedLyrics) {
			const sidecarLyrics = await loadLyricsSidecar(resolvedTrackPath);
			if (sidecarLyrics.plain) {
				embedded.lyrics = sidecarLyrics.plain;
			}
			if (sidecarLyrics.synced) {
				embedded.syncedLyrics = sidecarLyrics.synced;
			}
		}

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
			sidecar: sidecarMetadata,
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
