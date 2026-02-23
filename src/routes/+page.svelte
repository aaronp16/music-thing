<script lang="ts">
	import SearchBar from '$lib/components/SearchBar.svelte';
	import ResultsGrid from '$lib/components/ResultsGrid.svelte';
	import SidePanel from '$lib/components/SidePanel.svelte';
	import ArtistPage from '$lib/components/ArtistPage.svelte';
	import AlbumPage from '$lib/components/AlbumPage.svelte';
	import MobileTabBar, { type MobileTab } from '$lib/components/MobileTabBar.svelte';
	import DownloadsList from '$lib/components/DownloadsList.svelte';
	import DiskSpace from '$lib/components/DiskSpace.svelte';
	import DownloadsHeaderIndicator from '$lib/components/DownloadsHeaderIndicator.svelte';
	import DownloadsModal from '$lib/components/DownloadsModal.svelte';
	import MetadataPanel from '$lib/components/MetadataPanel.svelte';
	import type { Track, Album, Artist, SearchResult, Quality } from '$lib/types';
	import {
		downloads,
		downloadingTrackIds,
		downloadingAlbumIds,
		downloadItems
	} from '$lib/stores/downloads';
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

	// Mobile state
	let isMobile = $state(false);
	let mobileTab = $state<MobileTab>('search');
	let previousMobileTab = $state<MobileTab>('search');

	// Downloads modal state
	let isDownloadsModalOpen = $state(false);

	function openDownloadsModal() {
		isDownloadsModalOpen = true;
	}

	function closeDownloadsModal() {
		isDownloadsModalOpen = false;
	}

	// Metadata panel state
	let isMetadataPanelOpen = $state(false);
	let selectedTrackPath = $state<string | null>(null);

	function openMetadataPanel(trackPath: string) {
		selectedTrackPath = trackPath;
		isMetadataPanelOpen = true;
	}

	function closeMetadataPanel() {
		isMetadataPanelOpen = false;
		selectedTrackPath = null;
	}

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
				lastUrlQuery = searchView.query;
				lastUrlType = searchType;
				// Trigger the search directly (not through handleSearch to avoid URL update)
				performSearch(searchView.query, searchType);
				hasSearched = true;
			} else if (searchView.searchType) {
				searchType = searchView.searchType;
			}
		}

		// Setup media query listener for mobile detection
		const mediaQuery = window.matchMedia('(max-width: 767px)');
		isMobile = mediaQuery.matches;

		const handleResize = (e: MediaQueryListEvent) => {
			isMobile = e.matches;
		};

		mediaQuery.addEventListener('change', handleResize);
		return () => mediaQuery.removeEventListener('change', handleResize);
	});

	// Track the last URL query we processed to detect actual URL changes
	let lastUrlQuery = $state<string>('');
	let lastUrlType = $state<SearchType>('tracks');

	// React to navigation changes (e.g., browser back/forward to search view)
	// This effect syncs FROM URL TO local state and triggers searches
	// URL is the source of truth - it only updates on search submission
	$effect(() => {
		const view = $currentView;
		if (view.type === 'search') {
			const searchView = view as SearchView;
			const urlQuery = searchView.query || '';
			const urlType = searchView.searchType || 'tracks';

			// Only react if the URL actually changed (not just local input changes)
			const urlChanged = urlQuery !== lastUrlQuery || urlType !== lastUrlType;

			if (urlChanged) {
				// URL changed - this is a navigation event or search submission
				lastUrlQuery = urlQuery;
				lastUrlType = urlType;

				// Update local state to match URL
				searchQuery = urlQuery;
				searchType = urlType;

				// Perform search if there's a query
				if (urlQuery && urlQuery.trim()) {
					performSearch(urlQuery, urlType);
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

	// Auto-switch to downloads tab on mobile when download starts
	let previousDownloadCount = $state(0);
	$effect(() => {
		if (!isMobile) return;

		const activeCount = $downloadItems.filter(
			(i) => i.status === 'downloading' || i.status === 'pending'
		).length;

		// Switch to downloads tab if new download was added
		if (activeCount > previousDownloadCount && mobileTab !== 'downloads') {
			mobileTab = 'downloads';
		}

		previousDownloadCount = activeCount;
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
		// Update the URL - this will trigger the $effect which will:
		// 1. Update lastUrlQuery and lastUrlType
		// 2. Update searchQuery and searchType to match
		// 3. Call performSearch
		navigation.updateSearch(query, type);
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
	const downloadingIds = $derived(new Set([...$downloadingTrackIds, ...$downloadingAlbumIds]));

	// Handle artist click from TrackCard/AlbumCard
	function handleArtistClick(artistId: number, artistName: string) {
		navigation.goToArtist(artistId, artistName);
	}

	// Handle album click from AlbumCard
	function handleAlbumClick(albumId: number, albumTitle: string) {
		navigation.goToAlbum(albumId, albumTitle);
	}

	// Mobile tab management
	function handleMobileTabChange(tab: MobileTab) {
		previousMobileTab = mobileTab;
		mobileTab = tab;
	}

	// Compute slide direction for tab transitions
	const tabOrder: MobileTab[] = ['search', 'library', 'downloads'];
	const tabSlideClass = $derived.by(() => {
		const prevIndex = tabOrder.indexOf(previousMobileTab);
		const currIndex = tabOrder.indexOf(mobileTab);
		return currIndex > prevIndex ? 'tab-slide-left' : 'tab-slide-right';
	});

	// Count active downloads for badge
	const activeDownloadCount = $derived(
		$downloadItems.filter((i) => i.status === 'downloading' || i.status === 'pending').length
	);
</script>

<div class="flex h-full w-full">
	<!-- Main content area (search panel on desktop, tab-controlled on mobile) -->
	<div class="relative flex flex-1 flex-col overflow-hidden border-neutral-800 md:border-r">
		<!-- Desktop: always show navigation-based content -->
		<!-- Mobile: only show when search tab is active -->
		{#if !isMobile || mobileTab === 'search'}
			<!-- Page container with transitions -->
			<div class="relative flex-1 overflow-hidden">
				{#key $currentView.type + ($currentView.type === 'artist' ? $currentView.artistId : $currentView.type === 'album' ? $currentView.albumId : '')}
					<div
						class="absolute inset-0 flex flex-col {$hasNavigated
							? $navDirection === 'forward'
								? 'animate-slide-in-right'
								: 'animate-slide-in-left'
							: ''}"
					>
						{#if $currentView.type === 'search'}
							<!-- Search view -->
							<div class="flex flex-1 flex-col overflow-hidden">
								<!-- Header -->
								<div class="animate-fade-in px-4 py-6 sm:px-6 sm:py-8">
									<!-- Title and type pills -->
									<div class="mb-4 flex items-center justify-between gap-4 sm:mb-6">
										<h1 class="text-2xl font-bold text-white sm:text-3xl md:text-4xl">Search</h1>

										<!-- Type selector pills -->
										<div class="flex gap-2">
											<button
												type="button"
												onclick={() => {
													searchType = 'tracks';
													// If there's already a search, re-submit with new type
													if (searchQuery.trim() && hasSearched) {
														handleSearch(searchQuery.trim(), 'tracks');
													}
												}}
												class="rounded-full px-3 py-1.5 text-xs font-medium transition-all sm:px-4 sm:text-sm {searchType ===
												'tracks'
													? 'bg-white text-black'
													: 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700 hover:text-white'}"
											>
												Tracks
											</button>
											<button
												type="button"
												onclick={() => {
													searchType = 'albums';
													// If there's already a search, re-submit with new type
													if (searchQuery.trim() && hasSearched) {
														handleSearch(searchQuery.trim(), 'albums');
													}
												}}
												class="rounded-full px-3 py-1.5 text-xs font-medium transition-all sm:px-4 sm:text-sm {searchType ===
												'albums'
													? 'bg-white text-black'
													: 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700 hover:text-white'}"
											>
												Albums
											</button>
											<button
												type="button"
												onclick={() => {
													searchType = 'artists';
													// If there's already a search, re-submit with new type
													if (searchQuery.trim() && hasSearched) {
														handleSearch(searchQuery.trim(), 'artists');
													}
												}}
												class="rounded-full px-3 py-1.5 text-xs font-medium transition-all sm:px-4 sm:text-sm {searchType ===
												'artists'
													? 'bg-white text-black'
													: 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700 hover:text-white'}"
											>
												Artists
											</button>
										</div>
									</div>

									<!-- Search input only -->
									<div class="relative">
										<div
											class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4"
										>
											{#if loading}
												<svg
													class="h-5 w-5 animate-spin text-neutral-400"
													viewBox="0 0 24 24"
													fill="none"
												>
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
											{:else}
												<svg
													class="h-5 w-5 text-neutral-400"
													fill="none"
													stroke="currentColor"
													viewBox="0 0 24 24"
												>
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														stroke-width="2"
														d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
													/>
												</svg>
											{/if}
										</div>
										<input
											type="text"
											bind:value={searchQuery}
											onkeydown={(e) => {
												if (e.key === 'Enter' && searchQuery.trim())
													handleSearch(searchQuery.trim(), searchType);
											}}
											placeholder={data.placeholder}
											class="w-full rounded-full border-0 bg-neutral-800 py-3 pr-12 pl-12 text-white placeholder-neutral-500 ring-1 ring-neutral-700 transition-all focus:bg-neutral-750 focus:ring-2 focus:ring-blue-500 focus:outline-none"
											disabled={loading}
										/>
										{#if searchQuery}
											<button
												type="button"
												onclick={() => {
													searchQuery = '';
													hasSearched = false;
													tracks = [];
													albums = [];
													artists = [];
													navigation.updateSearch('', searchType);
												}}
												class="absolute inset-y-0 right-0 flex items-center pr-4 text-neutral-400 transition-colors hover:text-white"
												aria-label="Clear search"
											>
												<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														stroke-width="2"
														d="M6 18L18 6M6 6l12 12"
													/>
												</svg>
											</button>
										{/if}
									</div>
								</div>

								<!-- Results area -->
								<div class="min-h-0 flex-1 overflow-y-auto px-4 pb-20 sm:px-6 md:pb-8">
									{#if error}
										<div class="flex flex-col items-center justify-center py-12 text-center">
											<div class="mb-4 rounded-full bg-red-900/30 p-4">
												<svg
													class="h-8 w-8 text-red-400"
													fill="none"
													stroke="currentColor"
													viewBox="0 0 24 24"
												>
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														stroke-width="2"
														d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
													/>
												</svg>
											</div>
											<p class="text-lg font-medium text-red-400">{error}</p>
										</div>
									{:else if loading}
										<div class="flex flex-col items-center justify-center py-16">
											<svg
												class="h-10 w-10 animate-spin text-neutral-500"
												viewBox="0 0 24 24"
												fill="none"
											>
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
											<p class="mt-4 text-neutral-500">Searching...</p>
										</div>
									{:else if hasSearched}
										<ResultsGrid
											{tracks}
											{albums}
											{artists}
											type={searchType}
											onDownloadTrack={handleDownloadTrack}
											onDownloadAlbum={handleDownloadAlbum}
											{downloadingIds}
											onArtistClick={handleArtistClick}
											onAlbumClick={handleAlbumClick}
										/>
									{:else}
										<div class="flex flex-col items-center justify-center py-16 text-center">
											<svg
												class="mb-4 h-20 w-20 text-neutral-800"
												fill="none"
												stroke="currentColor"
												viewBox="0 0 24 24"
											>
												<path
													stroke-linecap="round"
													stroke-linejoin="round"
													stroke-width="1"
													d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
												/>
											</svg>
											<p class="text-lg font-medium text-neutral-400">Find your music</p>
											<p class="mt-1 text-sm text-neutral-500">
												Search for tracks, albums, or artists
											</p>
										</div>
									{/if}
								</div>
							</div>
						{:else if $currentView.type === 'artist'}
							<!-- Artist page view -->
							<ArtistPage artistId={$currentView.artistId} artistName={$currentView.artistName} />
						{:else if $currentView.type === 'album'}
							<!-- Album page view -->
							<AlbumPage albumId={$currentView.albumId} albumTitle={$currentView.albumTitle} />
						{/if}
					</div>
				{/key}
			</div>
		{/if}

		<!-- Mobile-only: Library & Downloads tabs -->
		{#if isMobile && mobileTab === 'library'}
			{#key mobileTab}
				<div class="absolute inset-0 flex flex-col bg-neutral-900 {tabSlideClass}">
					<div class="flex-1 overflow-hidden p-4 pb-20">
						<SidePanel
							bind:this={sidePanel}
							onArtistClick={handleArtistClick}
							onTrackMetadataClick={openMetadataPanel}
							forcedTab="library"
							hideTabBar={true}
						/>
					</div>
				</div>
			{/key}
		{:else if isMobile && mobileTab === 'downloads'}
			{#key mobileTab}
				<div class="absolute inset-0 flex flex-col bg-neutral-900 {tabSlideClass}">
					<!-- Downloads header -->
					<div class="animate-fade-in px-4 py-6">
						<h1 class="text-2xl font-bold text-white sm:text-3xl">Downloads</h1>
					</div>
					<!-- Downloads list -->
					<div class="flex-1 overflow-hidden px-4 pb-20">
						<DownloadsList />
					</div>
				</div>
			{/key}
		{/if}
	</div>

	<!-- Side Panel (right side on desktop, hidden on mobile) - Library only -->
	<div class="hidden flex-col md:flex md:w-80 lg:w-96 xl:w-[580px]">
		<SidePanel
			bind:this={sidePanel}
			onArtistClick={handleArtistClick}
			onTrackMetadataClick={openMetadataPanel}
			showLargeTitle={true}
		>
			{#snippet titleRight()}
				<div class="flex items-center gap-3">
					<DownloadsHeaderIndicator onClick={openDownloadsModal} />
					<DiskSpace />
				</div>
			{/snippet}
		</SidePanel>
	</div>
</div>

<!-- Mobile Tab Bar -->
{#if isMobile}
	<MobileTabBar activeTab={mobileTab} {activeDownloadCount} onTabChange={handleMobileTabChange} />
{/if}

<!-- Downloads Modal -->
<DownloadsModal isOpen={isDownloadsModalOpen} onClose={closeDownloadsModal} />

<!-- Metadata Panel -->
<MetadataPanel
	isOpen={isMetadataPanelOpen}
	trackPath={selectedTrackPath}
	onClose={closeMetadataPanel}
/>
