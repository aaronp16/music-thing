<script lang="ts">
	import SearchBar from '$lib/components/SearchBar.svelte';
	import ResultsGrid from '$lib/components/ResultsGrid.svelte';
	import SidePanel from '$lib/components/SidePanel.svelte';
	import ArtistPage from '$lib/components/ArtistPage.svelte';
	import AlbumPage from '$lib/components/AlbumPage.svelte';
	import type { Track, Album, Artist, SearchResult, Quality } from '$lib/types';
	import { downloads, downloadingTrackIds, downloadingAlbumIds, downloadItems } from '$lib/stores/downloads';
	import { libraryIndex } from '$lib/stores/libraryIndex';
	import { toasts } from '$lib/stores/toasts';
	import { navigation, type SearchView } from '$lib/stores/navigation';
	import { onMount } from 'svelte';

	let { data } = $props();

	type SearchType = 'tracks' | 'albums' | 'artists';

	let searchType: SearchType = $state('tracks');
	let searchQuery: string = $state('');
	let tracks: Track[] = $state([]);
	let albums: Album[] = $state([]);
	let artists: Artist[] = $state([]);
	let loading = $state(false);
	let hasSearched = $state(false);
	let error = $state<string | null>(null);

	// Reference to side panel for refresh
	let sidePanel: SidePanel | null = $state(null);

	// Track completed downloads to trigger library refresh
	let lastCompletedCount = $state(0);

	// Navigation state
	const currentView = navigation.currentView;
	const navDirection = navigation.direction;
	const hasNavigated = navigation.hasNavigated;

	// Initialize from URL state on mount
	onMount(() => {
		libraryIndex.load();
		
		// Check if we have search params in the URL
		const initialState = navigation.getInitialState();
		if (initialState.type === 'search') {
			const searchView = initialState as SearchView;
			if (searchView.query) {
				searchQuery = searchView.query;
				searchType = searchView.searchType || 'tracks';
				// Trigger the search
				handleSearch(searchView.query, searchType);
			} else if (searchView.searchType) {
				searchType = searchView.searchType;
			}
		}
	});

	// React to navigation changes (e.g., browser back/forward to search view)
	$effect(() => {
		const view = $currentView;
		if (view.type === 'search') {
			const searchView = view as SearchView;
			// Update local state from navigation
			if (searchView.query !== undefined && searchView.query !== searchQuery) {
				searchQuery = searchView.query || '';
				searchType = searchView.searchType || 'tracks';
				if (searchView.query) {
					// Re-run search when navigating back to a search
					performSearch(searchView.query, searchType);
				}
			}
		}
	});

	// Auto-refresh library when downloads complete
	$effect(() => {
		const items = $downloadItems;
		const completedCount = items.filter((i) => i.status === 'complete').length;
		
		if (completedCount > lastCompletedCount && sidePanel) {
			// New download completed, refresh library and library index
			sidePanel.refresh();
			libraryIndex.refresh();
		}
		lastCompletedCount = completedCount;
	});

	async function performSearch(query: string, type: SearchType) {
		loading = true;
		error = null;
		hasSearched = true;

		try {
			const response = await fetch(`/api/search?q=${encodeURIComponent(query)}&type=${type}`);
			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || data.detail || 'Search failed');
			}

			// Reset all result arrays
			tracks = [];
			albums = [];
			artists = [];

			if (type === 'tracks') {
				tracks = (data as SearchResult<Track>).items;
			} else if (type === 'albums') {
				albums = (data as SearchResult<Album>).items;
			} else if (type === 'artists') {
				artists = (data as SearchResult<Artist>).items;
			}
		} catch (e) {
			const message = e instanceof Error ? e.message : 'Search failed';
			error = message;
			toasts.error(message);
			tracks = [];
			albums = [];
			artists = [];
		} finally {
			loading = false;
		}
	}

	async function handleSearch(query: string, type: SearchType) {
		searchType = type;
		searchQuery = query;
		
		// Update URL with search params
		navigation.updateSearch(query, type);
		
		await performSearch(query, type);
	}

	async function handleDownloadTrack(track: Track, quality: Quality) {
		try {
			await downloads.startDownload('track', track.id, track, quality);
		} catch (e) {
			const message = e instanceof Error ? e.message : 'Failed to start download';
			toasts.error(message);
		}
	}

	async function handleDownloadAlbum(album: Album, quality: Quality) {
		try {
			await downloads.startDownload('album', album.id, undefined, quality);
		} catch (e) {
			const message = e instanceof Error ? e.message : 'Failed to start download';
			toasts.error(message);
		}
	}

	// Combine downloading track IDs with album track IDs
	const downloadingIds = $derived(
		new Set([...$downloadingTrackIds, ...$downloadingAlbumIds])
	);

	// Handle artist click from TrackCard/AlbumCard
	function handleArtistClick(artistId: number, artistName: string) {
		navigation.goToArtist(artistId, artistName);
	}

	// Handle album click from AlbumCard
	function handleAlbumClick(albumId: number, albumTitle: string) {
		navigation.goToAlbum(albumId, albumTitle);
	}
</script>

<div class="flex h-full w-full">
	<!-- Search Panel (left side) -->
	<div class="relative flex flex-1 flex-col overflow-hidden border-r border-neutral-800">
		<!-- Page container with transitions -->
		<div class="relative flex-1 overflow-hidden">
			{#key $currentView.type + ($currentView.type === 'artist' ? $currentView.artistId : $currentView.type === 'album' ? $currentView.albumId : '')}
				<div
					class="absolute inset-0 flex flex-col {$hasNavigated ? ($navDirection === 'forward' ? 'animate-slide-in-right' : 'animate-slide-in-left') : ''}"
				>
					{#if $currentView.type === 'search'}
						<!-- Search view -->
						<div class="flex flex-1 flex-col overflow-hidden p-4">
							<SearchBar 
								onSearch={handleSearch} 
								{loading} 
								placeholder={data.placeholder}
								initialQuery={searchQuery}
								initialType={searchType}
							/>

							<div class="mt-4 min-h-0 flex-1 overflow-y-auto">
								{#if error}
									<div class="rounded-lg bg-red-900/50 p-4 text-red-200">
										{error}
									</div>
								{:else if loading}
									<div class="flex items-center justify-center py-8">
										<svg class="h-8 w-8 animate-spin text-blue-500" viewBox="0 0 24 24" fill="none">
											<circle
												class="opacity-25"
												cx="12"
												cy="12"
												r="10"
												stroke="currentColor"
												stroke-width="4"
											></circle>
											<path
												class="opacity-75"
												fill="currentColor"
												d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
											></path>
										</svg>
									</div>
								{:else if hasSearched}
								<ResultsGrid
									{tracks}
									{albums}
									{artists}
									type={searchType}
									onDownloadTrack={handleDownloadTrack}
									onDownloadAlbum={handleDownloadAlbum}
									downloadingIds={downloadingIds}
									onArtistClick={handleArtistClick}
									onAlbumClick={handleAlbumClick}
								/>
								{:else}
									<div class="py-8 text-center text-neutral-500">
										Search for tracks, albums, or artists to get started
									</div>
								{/if}
							</div>
						</div>
					{:else if $currentView.type === 'artist'}
						<!-- Artist page view -->
						<ArtistPage
							artistId={$currentView.artistId}
							artistName={$currentView.artistName}
						/>
					{:else if $currentView.type === 'album'}
						<!-- Album page view -->
						<AlbumPage
							albumId={$currentView.albumId}
							albumTitle={$currentView.albumTitle}
						/>
					{/if}
				</div>
			{/key}
		</div>
	</div>

	<!-- Side Panel (right side) - Library & Downloads -->
	<div class="flex w-[580px] flex-col p-4">
		<SidePanel bind:this={sidePanel} onArtistClick={handleArtistClick} />
	</div>
</div>
