/**
 * Library index store - tracks what's already downloaded for "In Library" checking
 */

import { writable, derived, get } from 'svelte/store';

// =============================================================================
// Types
// =============================================================================

interface LibraryIndexState {
	tracks: Set<string>;
	loaded: boolean;
	loading: boolean;
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Sanitize name to match how files are saved (same as server)
 */
function sanitize(name: string): string {
	return name
		.replace(/:/g, ' -')
		.replace(/[<>"/\\|*]/g, '_')
		.trim();
}

/**
 * Generate a track key for matching: "artist|album|trackname" (all lowercase, sanitized)
 */
function makeTrackKey(artist: string, album: string, trackTitle: string): string {
	return `${sanitize(artist).toLowerCase()}|${sanitize(album).toLowerCase()}|${sanitize(trackTitle).toLowerCase()}`;
}

// =============================================================================
// Store
// =============================================================================

function createLibraryIndexStore() {
	const { subscribe, set, update } = writable<LibraryIndexState>({
		tracks: new Set(),
		loaded: false,
		loading: false
	});

	return {
		subscribe,

		/**
		 * Load the library index from the server
		 */
		load: async () => {
			update((state) => ({ ...state, loading: true }));

			try {
				const response = await fetch('/api/library/index');
				if (!response.ok) {
					throw new Error('Failed to load library index');
				}

				const data = await response.json();
				set({
					tracks: new Set(data.tracks),
					loaded: true,
					loading: false
				});
			} catch (error) {
				console.error('Failed to load library index:', error);
				update((state) => ({ ...state, loading: false }));
			}
		},

		/**
		 * Refresh the library index
		 */
		refresh: async () => {
			const state = get({ subscribe });
			if (state.loading) return;

			try {
				const response = await fetch('/api/library/index');
				if (!response.ok) return;

				const data = await response.json();
				set({
					tracks: new Set(data.tracks),
					loaded: true,
					loading: false
				});
			} catch (error) {
				console.error('Failed to refresh library index:', error);
			}
		},

		/**
		 * Check if a track is in the library
		 */
		isTrackInLibrary: (artist: string, album: string, trackTitle: string): boolean => {
			const state = get({ subscribe });
			const key = makeTrackKey(artist, album, trackTitle);
			return state.tracks.has(key);
		},

		/**
		 * Get library status for an album
		 * Returns: { inLibrary: number, total: number, complete: boolean }
		 */
		getAlbumStatus: (
			artist: string,
			album: string,
			trackTitles: string[]
		): { inLibrary: number; total: number; complete: boolean } => {
			const state = get({ subscribe });
			let inLibrary = 0;

			for (const title of trackTitles) {
				const key = makeTrackKey(artist, album, title);
				if (state.tracks.has(key)) {
					inLibrary++;
				}
			}

			return {
				inLibrary,
				total: trackTitles.length,
				complete: inLibrary === trackTitles.length && trackTitles.length > 0
			};
		}
	};
}

export const libraryIndex = createLibraryIndexStore();

// =============================================================================
// Derived Stores
// =============================================================================

/**
 * Whether the library index has been loaded
 */
export const libraryIndexLoaded = derived(libraryIndex, ($index) => $index.loaded);

/**
 * Whether the library index is loading
 */
export const libraryIndexLoading = derived(libraryIndex, ($index) => $index.loading);
