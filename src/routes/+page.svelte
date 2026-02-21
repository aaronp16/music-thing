<script lang="ts">
	import SearchBar from '$lib/components/SearchBar.svelte';
	import ResultsGrid from '$lib/components/ResultsGrid.svelte';
	import SidePanel from '$lib/components/SidePanel.svelte';
	import type { Track, Album, SearchResult, Quality } from '$lib/types';
	import { downloads, downloadingTrackIds, downloadingAlbumIds, downloadItems } from '$lib/stores/downloads';
	import { toasts } from '$lib/stores/toasts';

	let { data } = $props();

	type SearchType = 'tracks' | 'albums';

	let searchType: SearchType = $state('tracks');
	let tracks: Track[] = $state([]);
	let albums: Album[] = $state([]);
	let loading = $state(false);
	let hasSearched = $state(false);
	let error = $state<string | null>(null);

	// Reference to side panel for refresh
	let sidePanel: SidePanel | null = $state(null);

	// Track completed downloads to trigger library refresh
	let lastCompletedCount = $state(0);

	// Auto-refresh library when downloads complete
	$effect(() => {
		const items = $downloadItems;
		const completedCount = items.filter((i) => i.status === 'complete').length;
		
		if (completedCount > lastCompletedCount && sidePanel) {
			// New download completed, refresh library
			sidePanel.refresh();
		}
		lastCompletedCount = completedCount;
	});

	async function handleSearch(query: string, type: SearchType) {
		searchType = type;
		loading = true;
		error = null;
		hasSearched = true;

		try {
			const response = await fetch(`/api/search?q=${encodeURIComponent(query)}&type=${type}`);
			const data: SearchResult<Track> | SearchResult<Album> = await response.json();

			if (!response.ok) {
				throw new Error((data as { error?: string }).error || 'Search failed');
			}

			if (type === 'tracks') {
				tracks = (data as SearchResult<Track>).items;
				albums = [];
			} else {
				albums = (data as SearchResult<Album>).items;
				tracks = [];
			}
		} catch (e) {
			error = e instanceof Error ? e.message : 'Search failed';
			tracks = [];
			albums = [];
		} finally {
			loading = false;
		}
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
</script>

<div class="flex h-full w-full">
	<!-- Search Panel (left side) -->
	<div class="flex flex-1 flex-col overflow-hidden border-r border-neutral-800 p-4">
		<SearchBar onSearch={handleSearch} {loading} placeholder={data.placeholder} />

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
					type={searchType}
					onDownloadTrack={handleDownloadTrack}
					onDownloadAlbum={handleDownloadAlbum}
					downloadingIds={downloadingIds}
				/>
			{:else}
				<div class="py-8 text-center text-neutral-500">
					Search for tracks or albums to get started
				</div>
			{/if}
		</div>
	</div>

	<!-- Side Panel (right side) - Library & Downloads -->
	<div class="flex w-[380px] flex-col p-4">
		<SidePanel bind:this={sidePanel} />
	</div>
</div>
