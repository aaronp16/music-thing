/**
 * hifi-api client for interacting with the Tidal proxy API
 * Supports multiple providers with automatic fallback on rate limit or errors
 */

import { env } from './env';

// =============================================================================
// Types
// =============================================================================

export interface Artist {
	id: number;
	name: string;
	picture?: string;
}

export interface Album {
	id: number;
	title: string;
	cover: string;
	numberOfTracks?: number;
	numberOfVolumes?: number;
	duration?: number;
	releaseDate?: string;
	artist?: Artist;
	artists?: Artist[];
}

export interface Track {
	id: number;
	title: string;
	duration: number;
	trackNumber: number;
	volumeNumber: number;
	explicit: boolean;
	artist: Artist;
	artists: Artist[];
	album: Album;
}

export interface SearchResult<T> {
	items: T[];
	totalNumberOfItems: number;
	limit: number;
	offset: number;
}

/**
 * Raw album track item from API (wrapped in { item: Track })
 */
interface AlbumTrackItem {
	item: Track;
}

/**
 * Raw album response from API
 */
interface AlbumApiResponse extends Album {
	items: AlbumTrackItem[];
}

/**
 * Normalized album with tracks (after unwrapping)
 */
export interface AlbumWithTracks extends Album {
	tracks: Track[];
}

export interface StreamResponse {
	trackId: number;
	assetPresentation: string;
	audioQuality: string;
	manifest: string;
	manifestMimeType: string;
}

export interface CoverUrls {
	'80': string;
	'640': string;
	'1280': string;
}

export type Quality = 'LOSSLESS' | 'HIGH' | 'LOW';

// =============================================================================
// Provider Management
// =============================================================================

interface ProviderState {
	url: string;
	failedAt?: number;
	failCount: number;
}

// Track provider health state
const providerStates: Map<string, ProviderState> = new Map();

// How long to deprioritize a failed provider (5 minutes)
const PROVIDER_COOLDOWN_MS = 5 * 60 * 1000;

/**
 * Get providers sorted by health (healthy first, then by fail count)
 */
function getProvidersByPriority(): string[] {
	const now = Date.now();
	
	// Initialize states for any new providers
	for (const url of env.API_PROVIDERS) {
		if (!providerStates.has(url)) {
			providerStates.set(url, { url, failCount: 0 });
		}
	}
	
	return [...env.API_PROVIDERS].sort((a, b) => {
		const stateA = providerStates.get(a)!;
		const stateB = providerStates.get(b)!;
		
		// Check if providers are in cooldown
		const aCooldown = stateA.failedAt && (now - stateA.failedAt) < PROVIDER_COOLDOWN_MS;
		const bCooldown = stateB.failedAt && (now - stateB.failedAt) < PROVIDER_COOLDOWN_MS;
		
		// Providers not in cooldown come first
		if (aCooldown && !bCooldown) return 1;
		if (!aCooldown && bCooldown) return -1;
		
		// Sort by fail count (fewer failures first)
		return stateA.failCount - stateB.failCount;
	});
}

/**
 * Mark a provider as failed
 */
function markProviderFailed(url: string): void {
	const state = providerStates.get(url);
	if (state) {
		state.failedAt = Date.now();
		state.failCount++;
		console.warn(`[hifi-client] Provider ${url} marked as failed (count: ${state.failCount})`);
	}
}

/**
 * Mark a provider as successful (reset fail state)
 */
function markProviderSuccess(url: string): void {
	const state = providerStates.get(url);
	if (state && state.failCount > 0) {
		state.failedAt = undefined;
		state.failCount = 0;
		console.log(`[hifi-client] Provider ${url} recovered`);
	}
}

/**
 * Get current active provider (for display purposes)
 */
export function getCurrentProvider(): string {
	return getProvidersByPriority()[0];
}

/**
 * Get all providers with their status
 */
export function getProviderStatus(): { url: string; healthy: boolean; failCount: number }[] {
	const now = Date.now();
	return env.API_PROVIDERS.map((url) => {
		const state = providerStates.get(url);
		const inCooldown = state?.failedAt && (now - state.failedAt) < PROVIDER_COOLDOWN_MS;
		return {
			url,
			healthy: !inCooldown,
			failCount: state?.failCount || 0
		};
	});
}

// =============================================================================
// API Client
// =============================================================================

class HifiApiError extends Error {
	constructor(
		message: string,
		public status: number,
		public endpoint: string,
		public provider?: string
	) {
		super(message);
		this.name = 'HifiApiError';
	}
}

/**
 * hifi-api wraps all responses in { version, data: T }
 */
interface ApiResponse<T> {
	version: string;
	data: T;
}

/**
 * Check if an error is retryable (rate limit or server error)
 */
function isRetryableError(status: number): boolean {
	return status === 429 || status >= 500;
}

/**
 * Make API request with automatic provider fallback
 */
async function apiRequest<T>(endpoint: string): Promise<T> {
	const providers = getProvidersByPriority();
	let lastError: Error | null = null;

	for (const baseUrl of providers) {
		const url = `${baseUrl}${endpoint}`;

		try {
			const response = await fetch(url);

			if (!response.ok) {
				const error = new HifiApiError(
					`API request failed: ${response.statusText}`,
					response.status,
					endpoint,
					baseUrl
				);

				// If retryable, mark provider and try next
				if (isRetryableError(response.status)) {
					markProviderFailed(baseUrl);
					lastError = error;
					console.warn(`[hifi-client] ${baseUrl} returned ${response.status}, trying next provider...`);
					continue;
				}

				// Non-retryable error (4xx except 429), throw immediately
				throw error;
			}

			// Parse JSON response
			const json: ApiResponse<T> = await response.json();
			
			// Success - mark provider as healthy (after successful parse)
			markProviderSuccess(baseUrl);
			
			return json.data;
		} catch (error) {
			// Network errors are retryable
			if (error instanceof TypeError || (error instanceof Error && error.message.includes('fetch'))) {
				markProviderFailed(baseUrl);
				lastError = error as Error;
				console.warn(`[hifi-client] ${baseUrl} network error, trying next provider...`);
				continue;
			}

			// Re-throw HifiApiError (non-retryable)
			if (error instanceof HifiApiError) {
				throw error;
			}

			// Unknown error, try next provider
			markProviderFailed(baseUrl);
			lastError = error as Error;
			console.warn(`[hifi-client] ${baseUrl} unknown error: ${error instanceof Error ? error.message : error}, trying next provider...`);
			continue;
		}
	}

	// All providers failed
	throw lastError || new Error('All API providers failed');
}

// =============================================================================
// Search
// =============================================================================

/**
 * Search for tracks
 */
export async function searchTracks(query: string): Promise<SearchResult<Track>> {
	return apiRequest(`/search/?s=${encodeURIComponent(query)}`);
}

/**
 * Album search response has nested structure
 */
interface AlbumSearchResponse {
	artists: SearchResult<Artist>;
	albums: SearchResult<Album>;
}

/**
 * Search for albums
 */
export async function searchAlbums(query: string): Promise<SearchResult<Album>> {
	const response = await apiRequest<AlbumSearchResponse>(`/search/?al=${encodeURIComponent(query)}`);
	return response.albums;
}

/**
 * Artist search response has nested structure
 */
interface ArtistSearchResponse {
	artists: SearchResult<Artist>;
	albums: SearchResult<Album>;
}

/**
 * Search for artists
 */
export async function searchArtists(query: string): Promise<SearchResult<Artist>> {
	const response = await apiRequest<ArtistSearchResponse>(`/search/?ar=${encodeURIComponent(query)}`);
	return response.artists;
}

// =============================================================================
// Track & Album Info
// =============================================================================

/**
 * Get track info by ID
 */
export async function getTrackInfo(trackId: number): Promise<Track> {
	return apiRequest(`/info/?id=${trackId}`);
}

/**
 * Get album with tracks
 */
export async function getAlbum(albumId: number): Promise<AlbumWithTracks> {
	const album = await apiRequest<AlbumApiResponse>(`/album/?id=${albumId}`);
	// Unwrap { item: track } structure from API response
	return {
		...album,
		tracks: album.items?.map((i) => i.item) || []
	};
}

// =============================================================================
// Streaming
// =============================================================================

/**
 * Error thrown when a quality level is not available for a track
 */
export class QualityNotAvailableError extends Error {
	constructor(
		public trackId: number,
		public quality: Quality,
		public reason: string
	) {
		super(`Quality ${quality} not available for track ${trackId}: ${reason}`);
		this.name = 'QualityNotAvailableError';
	}
}

/**
 * Get stream URL for a track
 * Returns the direct download URL for the audio file
 * @throws QualityNotAvailableError if the requested quality is not available
 */
export async function getStreamUrl(
	trackId: number,
	quality: Quality = 'LOSSLESS'
): Promise<string> {
	const data = await apiRequest<StreamResponse>(
		`/track/?id=${trackId}&quality=${quality}`
	);

	// Decode the base64 manifest to get the stream URL
	let manifestStr: string;
	try {
		manifestStr = Buffer.from(data.manifest, 'base64').toString();
	} catch (err) {
		throw new QualityNotAvailableError(
			trackId,
			quality,
			'Failed to decode manifest (not valid base64)'
		);
	}

	// Check if manifest is XML (error response) instead of JSON
	if (manifestStr.startsWith('<?xml') || manifestStr.startsWith('<')) {
		throw new QualityNotAvailableError(
			trackId,
			quality,
			'API returned XML error instead of stream manifest'
		);
	}

	let manifest: { urls?: string[] };
	try {
		manifest = JSON.parse(manifestStr);
	} catch (err) {
		throw new QualityNotAvailableError(
			trackId,
			quality,
			`Invalid manifest format: ${manifestStr.substring(0, 100)}`
		);
	}

	if (!manifest.urls || !manifest.urls[0]) {
		throw new QualityNotAvailableError(
			trackId,
			quality,
			'Manifest does not contain stream URLs'
		);
	}

	return manifest.urls[0];
}

/**
 * Quality fallback order - when a quality isn't available, try these in order
 */
const QUALITY_FALLBACK: Record<Quality, Quality[]> = {
	LOSSLESS: ['HIGH', 'LOW'],
	HIGH: ['LOW'],
	LOW: []
};

/**
 * Get stream URL with automatic quality fallback
 * Returns both the URL and the actual quality used
 */
export async function getStreamUrlWithFallback(
	trackId: number,
	preferredQuality: Quality = 'LOSSLESS'
): Promise<{ url: string; actualQuality: Quality }> {
	const qualitiesToTry = [preferredQuality, ...QUALITY_FALLBACK[preferredQuality]];

	for (const quality of qualitiesToTry) {
		try {
			const url = await getStreamUrl(trackId, quality);
			if (quality !== preferredQuality) {
				console.log(
					`[hifi-client] Track ${trackId}: ${preferredQuality} not available, using ${quality}`
				);
			}
			return { url, actualQuality: quality };
		} catch (err) {
			if (err instanceof QualityNotAvailableError) {
				console.warn(`[hifi-client] Track ${trackId}: ${quality} not available, trying fallback...`);
				continue;
			}
			// Re-throw non-quality errors
			throw err;
		}
	}

	throw new Error(`No available quality for track ${trackId}`);
}

/**
 * Get stream response (for advanced use cases)
 */
export async function getStreamResponse(
	trackId: number,
	quality: Quality = 'LOSSLESS'
): Promise<StreamResponse> {
	return apiRequest(`/track/?id=${trackId}&quality=${quality}`);
}

// =============================================================================
// Cover Art
// =============================================================================

/**
 * Get cover art URLs for a track
 */
export async function getCoverUrls(trackId: number): Promise<CoverUrls> {
	return apiRequest(`/cover/?id=${trackId}`);
}

/**
 * Construct cover art URL from cover UUID
 * This is faster than calling the /cover/ endpoint
 */
export function getCoverUrl(coverUuid: string, size: 80 | 640 | 1280 = 1280): string {
	const path = coverUuid.replace(/-/g, '/');
	return `https://resources.tidal.com/images/${path}/${size}x${size}.jpg`;
}

// =============================================================================
// Exports
// =============================================================================

export const hifiApi = {
	searchTracks,
	searchAlbums,
	searchArtists,
	getTrackInfo,
	getAlbum,
	getStreamUrl,
	getStreamUrlWithFallback,
	getStreamResponse,
	getCoverUrls,
	getCoverUrl,
	getCurrentProvider,
	getProviderStatus,
	QualityNotAvailableError
};

export default hifiApi;
