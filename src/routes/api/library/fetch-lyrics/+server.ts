/**
 * Fetch lyrics for all library tracks that don't have lyrics
 * POST /api/library/fetch-lyrics
 *
 * Streams progress via SSE-style newline-delimited JSON
 */

import type { RequestHandler } from './$types';
import { scanLibrary } from '$lib/server/library';
import { fetchAndSaveLyrics, loadLyricsSidecar } from '$lib/server/metadata';
import { parseFile } from 'music-metadata';
import { access, constants } from 'fs/promises';

interface LyricsProgress {
	type: 'progress' | 'complete' | 'error';
	track?: string;
	current: number;
	total: number;
	found: number;
	skipped: number;
	failed: number;
	error?: string;
}

async function fileExists(path: string): Promise<boolean> {
	try {
		await access(path, constants.F_OK);
		return true;
	} catch {
		return false;
	}
}

async function trackHasLyrics(filePath: string): Promise<boolean> {
	try {
		// Check for sidecar files
		const sidecarLyrics = await loadLyricsSidecar(filePath);
		if (sidecarLyrics.plain || sidecarLyrics.synced) {
			return true;
		}

		// Check embedded metadata
		const metadata = await parseFile(filePath, { duration: false, skipCovers: true });
		const hasEmbedded =
			(metadata.common.lyrics && metadata.common.lyrics.length > 0) ||
			metadata.native?.vorbis?.some((tag) => tag.id === 'LYRICS' || tag.id === 'SYNCEDLYRICS');

		return !!hasEmbedded;
	} catch {
		return false;
	}
}

export const POST: RequestHandler = async () => {
	const encoder = new TextEncoder();

	const stream = new ReadableStream({
		async start(controller) {
			const sendProgress = (progress: LyricsProgress) => {
				controller.enqueue(encoder.encode(JSON.stringify(progress) + '\n'));
			};

			try {
				// Scan library
				const library = await scanLibrary();

				// Get all track files
				const trackFiles: string[] = [];
				for (const artist of library.artists) {
					for (const album of artist.albums) {
						for (const disk of album.disks) {
							for (const track of disk.tracks) {
								trackFiles.push(track.path);
							}
						}
					}
				}

				const total = trackFiles.length;
				let current = 0;
				let found = 0;
				let skipped = 0;
				let failed = 0;

				if (total === 0) {
					sendProgress({
						type: 'complete',
						current: 0,
						total: 0,
						found: 0,
						skipped: 0,
						failed: 0
					});
					controller.close();
					return;
				}

				for (const trackPath of trackFiles) {
					current++;

					// Check if track already has lyrics
					const hasLyrics = await trackHasLyrics(trackPath);
					if (hasLyrics) {
						skipped++;
						sendProgress({
							type: 'progress',
							current,
							total,
							found,
							skipped,
							failed
						});
						continue;
					}

					// Read track metadata
					let metadata;
					try {
						metadata = await parseFile(trackPath, { duration: true, skipCovers: true });
					} catch (error) {
						console.error(`Failed to read metadata from ${trackPath}:`, error);
						failed++;
						sendProgress({
							type: 'progress',
							current,
							total,
							found,
							skipped,
							failed
						});
						continue;
					}

					const artist = metadata.common.artist || 'Unknown';
					const title = metadata.common.title || 'Unknown';
					const album = metadata.common.album;
					const duration = metadata.format.duration;

					sendProgress({
						type: 'progress',
						track: `${artist} - ${title}`,
						current,
						total,
						found,
						skipped,
						failed
					});

					try {
						// Fetch lyrics
						const lyricsData = await fetchAndSaveLyrics({
							trackPath,
							artist,
							title,
							album,
							duration
						});

						if (lyricsData) {
							found++;
						} else {
							failed++;
						}

						// Small delay between requests (LRCLIB is slow)
						await new Promise((resolve) => setTimeout(resolve, 200));
					} catch (err) {
						console.error(`Failed to fetch lyrics for ${trackPath}:`, err);
						failed++;
					}
				}

				sendProgress({
					type: 'complete',
					current,
					total,
					found,
					skipped,
					failed
				});
			} catch (err) {
				sendProgress({
					type: 'error',
					current: 0,
					total: 0,
					found: 0,
					skipped: 0,
					failed: 0,
					error: err instanceof Error ? err.message : 'Unknown error'
				});
			}

			controller.close();
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'application/x-ndjson',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive'
		}
	});
};
