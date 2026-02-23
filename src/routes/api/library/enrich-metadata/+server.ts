/**
 * Enrich all library tracks with extended metadata from MusicBrainz
 * POST /api/library/enrich-metadata
 *
 * Streams progress via SSE-style newline-delimited JSON
 */

import type { RequestHandler } from './$types';
import { scanLibrary } from '$lib/server/library';
import { enrichTrackMetadata } from '$lib/server/musicbrainz-client';
import {
	loadMetadataJSON,
	saveMetadataJSON,
	embedMetadata,
	mergeMetadata,
	extractMetadata
} from '$lib/server/metadata';
import { parseFile } from 'music-metadata';
import { access, constants } from 'fs/promises';
import { join } from 'path';

interface EnrichProgress {
	type: 'progress' | 'complete' | 'error';
	track?: string;
	current: number;
	total: number;
	enriched: number;
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

/**
 * Extract basic metadata from audio file for MusicBrainz matching
 */
async function extractBasicInfo(
	filePath: string
): Promise<{ artist: string; title: string; isrc?: string } | null> {
	try {
		const metadata = await parseFile(filePath, { duration: false, skipCovers: true });
		const artist = metadata.common.artist || metadata.common.albumartist || 'Unknown';
		const title = metadata.common.title || 'Unknown';
		const isrc = metadata.common.isrc?.[0];

		return { artist, title, isrc };
	} catch (error) {
		console.error(`Failed to read metadata from ${filePath}:`, error);
		return null;
	}
}

export const POST: RequestHandler = async () => {
	const encoder = new TextEncoder();

	const stream = new ReadableStream({
		async start(controller) {
			const sendProgress = (progress: EnrichProgress) => {
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
				let enriched = 0;
				let skipped = 0;
				let failed = 0;

				if (total === 0) {
					sendProgress({
						type: 'complete',
						current: 0,
						total: 0,
						enriched: 0,
						skipped: 0,
						failed: 0
					});
					controller.close();
					return;
				}

				for (const trackPath of trackFiles) {
					current++;

					// Check if already has metadata JSON (skip if exists)
					const existingMetadata = await loadMetadataJSON(trackPath);
					if (existingMetadata && existingMetadata.enrichedAt) {
						skipped++;
						sendProgress({
							type: 'progress',
							current,
							total,
							enriched,
							skipped,
							failed
						});
						continue;
					}

					// Extract basic info from file
					const basicInfo = await extractBasicInfo(trackPath);
					if (!basicInfo) {
						failed++;
						sendProgress({
							type: 'progress',
							current,
							total,
							enriched,
							skipped,
							failed
						});
						continue;
					}

					sendProgress({
						type: 'progress',
						track: `${basicInfo.artist} - ${basicInfo.title}`,
						current,
						total,
						enriched,
						skipped,
						failed
					});

					try {
						// Fetch enriched metadata from MusicBrainz
						const enrichedData = await enrichTrackMetadata(
							basicInfo.isrc,
							basicInfo.artist,
							basicInfo.title
						);

						if (!enrichedData) {
							failed++;
							continue;
						}

						// Read current embedded metadata to preserve basic fields
						const fileMetadata = await parseFile(trackPath, { duration: false, skipCovers: true });
						const basicMetadata = {
							title: fileMetadata.common.title || basicInfo.title,
							artist: fileMetadata.common.artist || basicInfo.artist,
							album: fileMetadata.common.album || 'Unknown Album',
							trackNumber: fileMetadata.common.track.no || 1,
							totalTracks: fileMetadata.common.track.of || undefined,
							discNumber: fileMetadata.common.disk.no || 1,
							totalDiscs: fileMetadata.common.disk.of || undefined,
							year: fileMetadata.common.year?.toString(),
							albumArtist: fileMetadata.common.albumartist
						};

						// Merge with enriched data
						const finalMetadata = mergeMetadata(basicMetadata, enrichedData);

						// Re-embed metadata in FLAC
						await embedMetadata(trackPath, finalMetadata);

						// Save sidecar JSON
						await saveMetadataJSON(trackPath, finalMetadata);

						enriched++;

						// Small delay to respect rate limiting
						await new Promise((resolve) => setTimeout(resolve, 100));
					} catch (err) {
						console.error(`Failed to enrich ${trackPath}:`, err);
						failed++;
					}
				}

				sendProgress({
					type: 'complete',
					current,
					total,
					enriched,
					skipped,
					failed
				});
			} catch (err) {
				sendProgress({
					type: 'error',
					current: 0,
					total: 0,
					enriched: 0,
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
