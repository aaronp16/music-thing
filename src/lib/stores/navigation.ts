/**
 * Navigation store for managing page views with URL synchronization
 * Supports browser back/forward buttons and shareable URLs
 */

import { writable, derived, get } from 'svelte/store';
import { browser } from '$app/environment';

export type ViewType = 'search' | 'artist' | 'album';

export interface SearchView {
	type: 'search';
	query?: string;
	searchType?: 'tracks' | 'albums' | 'artists';
}

export interface ArtistView {
	type: 'artist';
	artistId: number;
	artistName: string;
}

export interface AlbumView {
	type: 'album';
	albumId: number;
	albumTitle: string;
}

export type View = SearchView | ArtistView | AlbumView;

interface NavigationState {
	current: View;
	direction: 'forward' | 'back';
	hasNavigated: boolean; // true after first navigation (to skip initial animation)
}

/**
 * Parse URL search params into a View
 */
function parseUrl(url: URL): View {
	const params = url.searchParams;
	const view = params.get('view');
	
	if (view === 'artist') {
		const id = params.get('id');
		const name = params.get('name') || 'Artist';
		if (id) {
			return {
				type: 'artist',
				artistId: parseInt(id, 10),
				artistName: decodeURIComponent(name)
			};
		}
	}
	
	if (view === 'album') {
		const id = params.get('id');
		const name = params.get('name') || 'Album';
		if (id) {
			return {
				type: 'album',
				albumId: parseInt(id, 10),
				albumTitle: decodeURIComponent(name)
			};
		}
	}
	
	// Default to search view
	const query = params.get('q') || undefined;
	const searchType = params.get('type') as 'tracks' | 'albums' | 'artists' | null;
	
	return {
		type: 'search',
		query,
		searchType: searchType || undefined
	};
}

/**
 * Build URL search params from a View
 */
function buildUrl(view: View): string {
	const params = new URLSearchParams();
	
	if (view.type === 'artist') {
		params.set('view', 'artist');
		params.set('id', view.artistId.toString());
		params.set('name', view.artistName);
	} else if (view.type === 'album') {
		params.set('view', 'album');
		params.set('id', view.albumId.toString());
		params.set('name', view.albumTitle);
	} else {
		// Search view
		if (view.query) {
			params.set('q', view.query);
		}
		if (view.searchType) {
			params.set('type', view.searchType);
		}
	}
	
	const queryString = params.toString();
	return queryString ? `?${queryString}` : '/';
}

/**
 * Check if two views are the same (for avoiding duplicate history entries)
 */
function viewsEqual(a: View, b: View): boolean {
	if (a.type !== b.type) return false;
	
	if (a.type === 'artist' && b.type === 'artist') {
		return a.artistId === b.artistId;
	}
	if (a.type === 'album' && b.type === 'album') {
		return a.albumId === b.albumId;
	}
	if (a.type === 'search' && b.type === 'search') {
		return a.query === b.query && a.searchType === b.searchType;
	}
	return false;
}

function createNavigation() {
	// Initialize from URL if in browser
	const initialView: View = browser 
		? parseUrl(new URL(window.location.href))
		: { type: 'search' };
	
	const { subscribe, set, update } = writable<NavigationState>({
		current: initialView,
		direction: 'forward',
		hasNavigated: false
	});

	// Track if we're handling a popstate to avoid pushing duplicate history
	let handlingPopState = false;

	// Listen for browser back/forward
	if (browser) {
		window.addEventListener('popstate', (event) => {
			handlingPopState = true;
			const view = parseUrl(new URL(window.location.href));
			const currentState = get({ subscribe });
			
			// Determine direction based on whether we're going back or forward
			// We can't easily know, so we'll just use 'back' for popstate
			const direction = 'back';
			
			set({
				current: view,
				direction,
				hasNavigated: true
			});
			handlingPopState = false;
		});
	}

	/**
	 * Navigate to a view and update the URL
	 */
	function navigateTo(view: View, options: { replace?: boolean; direction?: 'forward' | 'back' } = {}) {
		const { replace = false, direction = 'forward' } = options;
		const currentState = get({ subscribe });
		
		// Don't navigate if we're already at this view
		if (viewsEqual(currentState.current, view)) {
			return;
		}
		
		set({
			current: view,
			direction,
			hasNavigated: true
		});
		
		// Update URL if in browser and not handling popstate
		if (browser && !handlingPopState) {
			const url = buildUrl(view);
			if (replace) {
				window.history.replaceState({ view }, '', url);
			} else {
				window.history.pushState({ view }, '', url);
			}
		}
	}

	return {
		subscribe,

		/**
		 * Navigate to an artist page
		 */
		goToArtist(artistId: number, artistName: string) {
			navigateTo({
				type: 'artist',
				artistId,
				artistName
			});
		},

		/**
		 * Navigate to an album page
		 */
		goToAlbum(albumId: number, albumTitle: string) {
			navigateTo({
				type: 'album',
				albumId,
				albumTitle
			});
		},

		/**
		 * Go back to search (or use browser history)
		 */
		goToSearch(query?: string, searchType?: 'tracks' | 'albums' | 'artists') {
			navigateTo({
				type: 'search',
				query,
				searchType
			}, { direction: 'back' });
		},

		/**
		 * Update search state (replace current history entry)
		 */
		updateSearch(query?: string, searchType?: 'tracks' | 'albums' | 'artists') {
			const currentState = get({ subscribe });
			
			// Only update if we're in search view
			if (currentState.current.type !== 'search') {
				navigateTo({
					type: 'search',
					query,
					searchType
				});
				return;
			}
			
			// Replace current entry to avoid cluttering history with every keystroke
			navigateTo({
				type: 'search',
				query,
				searchType
			}, { replace: true });
		},

		/**
		 * Go back using browser history
		 */
		back() {
			if (browser) {
				// Let the browser handle it, popstate will update our state
				window.history.back();
			}
		},

		/**
		 * Check if we can go back (has history)
		 */
		get canGoBack() {
			return derived({ subscribe }, (state) => {
				// We can go back if we're not on the search page
				// or if browser has history
				return state.current.type !== 'search';
			});
		},

		/**
		 * Get current view
		 */
		get currentView() {
			return derived({ subscribe }, (state) => state.current);
		},

		/**
		 * Get animation direction
		 */
		get direction() {
			return derived({ subscribe }, (state) => state.direction);
		},

		/**
		 * Check if any navigation has happened (to skip initial animation)
		 */
		get hasNavigated() {
			return derived({ subscribe }, (state) => state.hasNavigated);
		},

		/**
		 * Get initial URL state (for hydration)
		 */
		getInitialState(): View {
			return initialView;
		}
	};
}

export const navigation = createNavigation();
