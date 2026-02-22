/**
 * Backfill missing artist images
 * POST /api/library/backfill
 * 
 * Streams progress via SSE-style newline-delimited JSON
 */

import type { RequestHandler } from './$types';
import { scanLibrary } from '$lib/server/library';
import { searchArtists, getArtistInfo, getArtistImageUrl } from '$lib/server/hifi-client';
import { createWriteStream } from 'fs';
import { mkdir, access, constants, copyFile, unlink } from 'fs/promises';
import { join } from 'path';
import { env } from '$lib/server/env';

interface BackfillProgress {
	type: 'progress' | 'complete' | 'error';
	artist?: string;
	current: number;
	total: number;
	fetched: number;
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

export const POST: RequestHandler = async () => {
	const encoder = new TextEncoder();
	
	const stream = new ReadableStream({
		async start(controller) {
			const sendProgress = (progress: BackfillProgress) => {
				controller.enqueue(encoder.encode(JSON.stringify(progress) + '\n'));
			};
			
			try {
				// Scan library to get all artists
				const library = await scanLibrary();
				const artists = library.artists;
				
				// Filter to only artists missing images
				const artistsNeedingImages = artists.filter(a => !a.hasArtistImage);
				
				const total = artistsNeedingImages.length;
				let current = 0;
				let fetched = 0;
				let skipped = 0;
				let failed = 0;
				
				if (total === 0) {
					sendProgress({
						type: 'complete',
						current: 0,
						total: 0,
						fetched: 0,
						skipped: artists.length,
						failed: 0
					});
					controller.close();
					return;
				}
				
				for (const artist of artistsNeedingImages) {
					current++;
					
					sendProgress({
						type: 'progress',
						artist: artist.name,
						current,
						total,
						fetched,
						skipped,
						failed
					});
					
					try {
						// Search for artist on Tidal
						const searchResult = await searchArtists(artist.name);
						
						if (!searchResult.items || searchResult.items.length === 0) {
							failed++;
							continue;
						}
						
						// Find best match (exact name match preferred)
						const exactMatch = searchResult.items.find(
							a => a.name.toLowerCase() === artist.name.toLowerCase()
						);
						const artistMatch = exactMatch || searchResult.items[0];
						
						// Get artist info to get picture UUID
						const artistInfo = await getArtistInfo(artistMatch.id);
						const pictureUuid = artistInfo.artist?.picture;
						
						if (!pictureUuid) {
							failed++;
							continue;
						}
						
						// Download image
						const imageUrl = getArtistImageUrl(pictureUuid, 750);
						const response = await fetch(imageUrl);
						
						if (!response.ok) {
							failed++;
							continue;
						}
						
						const artistImagePath = join(artist.path, 'artist.jpg');
						
						// Use temp file if TEMP_DIR is set
						const tempPath = env.TEMP_DIR 
							? join(env.TEMP_DIR, `backfill-artist-${artistMatch.id}.jpg`)
							: null;
						
						const downloadPath = tempPath || artistImagePath;
						
						// Ensure directory exists
						await mkdir(artist.path, { recursive: true });
						if (tempPath) {
							await mkdir(env.TEMP_DIR!, { recursive: true });
						}
						
						const buffer = await response.arrayBuffer();
						const writer = createWriteStream(downloadPath);
						writer.write(Buffer.from(buffer));
						writer.end();
						
						await new Promise<void>((resolve, reject) => {
							writer.on('finish', resolve);
							writer.on('error', reject);
						});
						
						// Move from temp if needed
						if (tempPath) {
							await copyFile(tempPath, artistImagePath);
							await unlink(tempPath);
						}
						
						fetched++;
						
						// Small delay to avoid rate limiting
						await new Promise(resolve => setTimeout(resolve, 200));
						
					} catch (err) {
						console.error(`Failed to fetch image for ${artist.name}:`, err);
						failed++;
					}
				}
				
				sendProgress({
					type: 'complete',
					current,
					total,
					fetched,
					skipped: artists.length - total,
					failed
				});
				
			} catch (err) {
				sendProgress({
					type: 'error',
					current: 0,
					total: 0,
					fetched: 0,
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
			'Connection': 'keep-alive'
		}
	});
};
