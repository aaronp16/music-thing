/**
 * MusicBrainz API client for fetching extended metadata
 * API Docs: https://musicbrainz.org/doc/MusicBrainz_API
 *
 * Rate limit: 1 request per second
 */

const MUSICBRAINZ_API = 'https://musicbrainz.org/ws/2';
const USER_AGENT = 'music-thing/1.0.0 (https://github.com/your-repo/music-thing)';

interface Artist {
	id: string;
	name: string;
	'sort-name': string;
	disambiguation?: string;
	country?: string;
	'life-span'?: {
		begin?: string;
		end?: string;
	};
}

interface Release {
	id: string;
	title: string;
	date?: string;
	country?: string;
	barcode?: string;
	'label-info'?: Array<{
		'catalog-number'?: string;
		label?: {
			id: string;
			name: string;
		};
	}>;
	'release-group'?: {
		'primary-type'?: string;
		'secondary-types'?: string[];
	};
}

interface Recording {
	id: string;
	title: string;
	length?: number;
	isrcs?: string[];
	releases?: Release[];
	'artist-credit'?: Array<{
		name: string;
		artist: Artist;
	}>;
	tags?: Array<{
		count: number;
		name: string;
	}>;
	genres?: Array<{
		count: number;
		name: string;
	}>;
	relations?: Array<{
		type: string;
		'type-id': string;
		direction: string;
		artist?: Artist;
		attributes?: string[];
		begin?: string;
		end?: string;
	}>;
}

export interface EnrichedMetadata {
	// MusicBrainz IDs
	mbid_recording?: string;
	mbid_release?: string;
	mbid_artist?: string;

	// Release info
	label?: string;
	catalogNumber?: string;
	originalDate?: string;
	releaseDate?: string;
	releaseCountry?: string;
	barcode?: string;

	// Credits (from relations)
	composer?: string;
	lyricist?: string;
	producer?: string;
	engineer?: string;

	// Categorization
	genres?: string[];
	styles?: string[];

	// Metadata
	enrichedAt: string;
	enrichedFrom: 'musicbrainz';
	matchConfidence?: number; // 0-1 score
}

/**
 * Rate limiter to comply with MusicBrainz 1 request/second limit
 */
class RateLimiter {
	private queue: Array<() => void> = [];
	private lastRequest = 0;
	private processing = false;

	async add<T>(fn: () => Promise<T>): Promise<T> {
		return new Promise((resolve, reject) => {
			this.queue.push(async () => {
				try {
					const result = await fn();
					resolve(result);
				} catch (error) {
					reject(error);
				}
			});

			if (!this.processing) {
				this.process();
			}
		});
	}

	private async process(): Promise<void> {
		this.processing = true;

		while (this.queue.length > 0) {
			const now = Date.now();
			const timeSinceLastRequest = now - this.lastRequest;
			const delay = Math.max(0, 1000 - timeSinceLastRequest);

			if (delay > 0) {
				await new Promise((resolve) => setTimeout(resolve, delay));
			}

			const fn = this.queue.shift();
			if (fn) {
				this.lastRequest = Date.now();
				await fn();
			}
		}

		this.processing = false;
	}
}

const rateLimiter = new RateLimiter();

/**
 * Make a rate-limited request to MusicBrainz API
 */
async function mbRequest<T>(endpoint: string, params: Record<string, string> = {}): Promise<T> {
	return rateLimiter.add(async () => {
		const url = new URL(`${MUSICBRAINZ_API}${endpoint}`);
		url.searchParams.set('fmt', 'json');

		for (const [key, value] of Object.entries(params)) {
			url.searchParams.set(key, value);
		}

		const response = await fetch(url.toString(), {
			headers: {
				'User-Agent': USER_AGENT,
				Accept: 'application/json'
			}
		});

		if (!response.ok) {
			throw new Error(`MusicBrainz API error: ${response.status} ${response.statusText}`);
		}

		return response.json();
	});
}

/**
 * Look up recording by ISRC
 */
async function lookupRecordingByISRC(isrc: string): Promise<Recording | null> {
	try {
		const result = await mbRequest<{ recordings?: Recording[] }>('/isrc/' + isrc, {
			inc: 'artist-credits+releases+labels+tags+genres+artist-rels+work-rels'
		});

		if (result.recordings && result.recordings.length > 0) {
			return result.recordings[0];
		}

		return null;
	} catch (error) {
		console.error('Failed to lookup ISRC:', error);
		return null;
	}
}

/**
 * Search for recording by artist and title
 */
async function searchRecording(artist: string, title: string): Promise<Recording[]> {
	try {
		// Try exact match first
		let query = `artist:"${artist}" AND recording:"${title}"`;
		console.log(`[MusicBrainz] Search query: ${query}`);

		let result = await mbRequest<{ recordings?: Recording[] }>('/recording', {
			query,
			limit: '5',
			inc: 'artist-credits+releases+labels+tags+genres+artist-rels+work-rels'
		});

		if (result.recordings && result.recordings.length > 0) {
			return result.recordings;
		}

		// If no results and artist has comma/ampersand (collaboration), try first artist only
		if (artist.includes(',') || artist.includes('&')) {
			const primaryArtist = artist.split(/[,&]/)[0].trim();
			console.log(`[MusicBrainz] No results, trying primary artist: "${primaryArtist}"`);

			query = `artist:"${primaryArtist}" AND recording:"${title}"`;
			result = await mbRequest<{ recordings?: Recording[] }>('/recording', {
				query,
				limit: '5',
				inc: 'artist-credits+releases+labels+tags+genres+artist-rels+work-rels'
			});
		}

		return result.recordings || [];
	} catch (error) {
		console.error('Failed to search recording:', error);
		return [];
	}
}

/**
 * Calculate similarity score between two strings (0-1)
 */
function similarity(s1: string, s2: string): number {
	const longer = s1.length > s2.length ? s1 : s2;
	const shorter = s1.length > s2.length ? s2 : s1;

	if (longer.length === 0) return 1.0;

	const editDistance = levenshteinDistance(longer.toLowerCase(), shorter.toLowerCase());
	return (longer.length - editDistance) / longer.length;
}

/**
 * Levenshtein distance between two strings
 */
function levenshteinDistance(s1: string, s2: string): number {
	const costs: number[] = [];
	for (let i = 0; i <= s2.length; i++) {
		let lastValue = i;
		for (let j = 0; j <= s1.length; j++) {
			if (i === 0) {
				costs[j] = j;
			} else if (j > 0) {
				let newValue = costs[j - 1];
				if (s1.charAt(j - 1) !== s2.charAt(i - 1)) {
					newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
				}
				costs[j - 1] = lastValue;
				lastValue = newValue;
			}
		}
		if (i > 0) costs[s1.length] = lastValue;
	}
	return costs[s1.length];
}

/**
 * Extract credits from recording relations
 */
function extractCredits(
	recording: Recording
): Pick<EnrichedMetadata, 'composer' | 'lyricist' | 'producer' | 'engineer'> {
	const credits: Pick<EnrichedMetadata, 'composer' | 'lyricist' | 'producer' | 'engineer'> = {};

	if (!recording.relations) return credits;

	const composers: string[] = [];
	const lyricists: string[] = [];
	const producers: string[] = [];
	const engineers: string[] = [];

	for (const relation of recording.relations) {
		if (!relation.artist) continue;

		const artistName = relation.artist.name;

		switch (relation.type) {
			case 'composer':
				composers.push(artistName);
				break;
			case 'lyricist':
			case 'writer':
				lyricists.push(artistName);
				break;
			case 'producer':
				producers.push(artistName);
				break;
			case 'engineer':
			case 'mix':
			case 'sound':
				engineers.push(artistName);
				break;
		}
	}

	if (composers.length > 0) credits.composer = composers.join(', ');
	if (lyricists.length > 0) credits.lyricist = lyricists.join(', ');
	if (producers.length > 0) credits.producer = producers.join(', ');
	if (engineers.length > 0) credits.engineer = engineers.join(', ');

	return credits;
}

/**
 * Get primary release from recording
 */
function getPrimaryRelease(recording: Recording): Release | null {
	if (!recording.releases || recording.releases.length === 0) {
		return null;
	}

	// Prefer releases with barcode and label info
	const releasesWithMetadata = recording.releases.filter(
		(r) => r.barcode || (r['label-info'] && r['label-info'].length > 0)
	);

	if (releasesWithMetadata.length > 0) {
		return releasesWithMetadata[0];
	}

	return recording.releases[0];
}

/**
 * Lookup full release details by ID
 */
async function lookupRelease(releaseId: string): Promise<Release | null> {
	try {
		const result = await mbRequest<Release>(`/release/${releaseId}`, {
			inc: 'labels+artist-credits'
		});
		return result;
	} catch (error) {
		console.error('Failed to lookup release:', error);
		return null;
	}
}

/**
 * Enrich track metadata from MusicBrainz
 */
export async function enrichTrackMetadata(
	isrc: string | undefined,
	artistName: string,
	trackTitle: string
): Promise<EnrichedMetadata | null> {
	let recording: Recording | null = null;
	let matchConfidence = 1.0;

	// Try ISRC lookup first (most accurate)
	if (isrc) {
		recording = await lookupRecordingByISRC(isrc);
		if (recording) {
			console.log(`Found recording via ISRC: ${isrc}`);
		}
	}

	// Fall back to search if ISRC failed
	if (!recording) {
		const searchResults = await searchRecording(artistName, trackTitle);

		if (searchResults.length === 0) {
			console.warn(`No MusicBrainz match found for: ${artistName} - ${trackTitle}`);
			return null;
		}

		// Score each result
		const scoredResults = searchResults.map((r) => {
			// Get full artist credit string (all artists joined)
			const artistCredit = r['artist-credit']?.map((ac) => ac.name).join(', ') || '';
			const artistScore = similarity(artistName.toLowerCase(), artistCredit.toLowerCase());
			const titleScore = similarity(trackTitle.toLowerCase(), r.title.toLowerCase());
			const score = (artistScore + titleScore) / 2;

			console.log(
				`[MusicBrainz] Match candidate: "${r.title}" by "${artistCredit}" (score: ${(score * 100).toFixed(0)}%)`
			);

			return { recording: r, score };
		});

		// Sort by score
		scoredResults.sort((a, b) => b.score - a.score);

		recording = scoredResults[0].recording;
		matchConfidence = scoredResults[0].score;

		console.log(
			`Found recording via search (confidence: ${(matchConfidence * 100).toFixed(0)}%): ${recording.title}`
		);
	}

	// Extract metadata
	const credits = extractCredits(recording);
	let release = getPrimaryRelease(recording);

	// If we found a release but it doesn't have label info, fetch full details
	if (release && !release['label-info']) {
		console.log(`[MusicBrainz] Fetching full release details for: ${release.id}`);
		const fullRelease = await lookupRelease(release.id);
		if (fullRelease) {
			release = fullRelease;
			console.log('[MusicBrainz] Full release data fetched');
		}
	}

	console.log(
		'[MusicBrainz] Release:',
		release
			? {
					id: release.id,
					date: release.date,
					country: release.country,
					barcode: release.barcode,
					label: release['label-info']?.[0]?.label?.name,
					catalogNumber: release['label-info']?.[0]?.['catalog-number']
				}
			: 'NO RELEASE'
	);

	// Extract genres (prefer genres over tags)
	const genres: string[] = [];
	if (recording.genres && recording.genres.length > 0) {
		genres.push(...recording.genres.map((g) => g.name));
	} else if (recording.tags && recording.tags.length > 0) {
		// Use top 5 tags if no genres
		genres.push(
			...recording.tags
				.sort((a, b) => b.count - a.count)
				.slice(0, 5)
				.map((t) => t.name)
		);
	}

	const metadata: EnrichedMetadata = {
		mbid_recording: recording.id,
		mbid_release: release?.id,
		mbid_artist: recording['artist-credit']?.[0]?.artist.id,

		// Release info
		label: release?.['label-info']?.[0]?.label?.name,
		catalogNumber: release?.['label-info']?.[0]?.['catalog-number'],
		releaseDate: release?.date,
		releaseCountry: release?.country,
		barcode: release?.barcode,

		// Credits
		...credits,

		// Genres
		genres: genres.length > 0 ? genres : undefined,

		// Metadata
		enrichedAt: new Date().toISOString(),
		enrichedFrom: 'musicbrainz',
		matchConfidence
	};

	return metadata;
}
