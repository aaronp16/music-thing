/**
 * LRCLIB API client for fetching song lyrics
 * https://lrclib.net - Free, open-source lyrics database with LRC support
 */

const LRCLIB_BASE_URL = 'https://lrclib.net/api';
const FETCH_TIMEOUT = 10000; // 10 seconds (LRCLIB can be slow)

export interface LRCLIBResult {
	id: number;
	trackName: string;
	artistName: string;
	albumName: string;
	duration: number;
	instrumental: boolean;
	plainLyrics: string | null;
	syncedLyrics: string | null;
}

export interface FetchLyricsOptions {
	artist: string;
	title: string;
	album?: string;
	duration?: number; // in seconds
}

/**
 * Fetch lyrics from LRCLIB
 * Returns null if not found, instrumental, or on error
 */
export async function fetchLyrics(
	options: FetchLyricsOptions
): Promise<{ plain: string | null; synced: string | null } | null> {
	try {
		// Build query parameters
		const params = new URLSearchParams({
			artist_name: options.artist,
			track_name: options.title
		});

		if (options.album) {
			params.set('album_name', options.album);
		}

		if (options.duration) {
			params.set('duration', Math.round(options.duration).toString());
		}

		// Create abort controller for timeout
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

		const url = `${LRCLIB_BASE_URL}/get?${params}`;
		console.log(`[LRCLIB] Fetching: ${url}`);

		try {
			const response = await fetch(url, {
				signal: controller.signal,
				headers: {
					'User-Agent': 'music-thing/1.0'
				}
			});

			clearTimeout(timeoutId);

			// Handle 404 - no lyrics found
			if (response.status === 404) {
				return null;
			}

			if (!response.ok) {
				console.warn(`[LRCLIB] HTTP ${response.status} for ${options.title}`);
				return null;
			}

			const data: LRCLIBResult = await response.json();

			// Skip instrumental tracks
			if (data.instrumental) {
				console.log(`[LRCLIB] Skipping instrumental track: ${options.title}`);
				return null;
			}

			// Check if we got any lyrics
			if (!data.plainLyrics && !data.syncedLyrics) {
				return null;
			}

			return {
				plain: data.plainLyrics,
				synced: data.syncedLyrics
			};
		} finally {
			clearTimeout(timeoutId);
		}
	} catch (error) {
		// Handle abort/timeout
		if (error instanceof Error && error.name === 'AbortError') {
			console.warn(`[LRCLIB] Timeout fetching lyrics for: ${options.title}`);
			return null;
		}

		// Log other errors but don't fail
		console.warn(`[LRCLIB] Error fetching lyrics for ${options.title}:`, error);
		return null;
	}
}

/**
 * Search for lyrics (returns multiple results)
 * Useful for manual lookup/debugging
 */
export async function searchLyrics(query: {
	track?: string;
	artist?: string;
	album?: string;
}): Promise<LRCLIBResult[]> {
	try {
		const params = new URLSearchParams();

		if (query.track) {
			params.set('track_name', query.track);
		}
		if (query.artist) {
			params.set('artist_name', query.artist);
		}
		if (query.album) {
			params.set('album_name', query.album);
		}

		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

		try {
			const response = await fetch(`${LRCLIB_BASE_URL}/search?${params}`, {
				signal: controller.signal,
				headers: {
					'User-Agent': 'music-thing/1.0'
				}
			});

			clearTimeout(timeoutId);

			if (!response.ok) {
				return [];
			}

			const results: LRCLIBResult[] = await response.json();
			return results;
		} finally {
			clearTimeout(timeoutId);
		}
	} catch (error) {
		console.warn('[LRCLIB] Search error:', error);
		return [];
	}
}
