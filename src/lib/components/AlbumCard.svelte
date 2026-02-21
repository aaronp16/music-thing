<script lang="ts">
	import type { Album, Quality, Track } from '$lib/types';
	import { formatDuration, getCoverUrl } from '$lib/types';
	import { slide } from 'svelte/transition';
	import { libraryIndex } from '$lib/stores/libraryIndex';
	import { toasts } from '$lib/stores/toasts';
	import DownloadButton from './DownloadButton.svelte';

	interface Props {
		album: Album;
		onDownload: (album: Album, quality: Quality, selectedTrackIds?: number[]) => void;
		downloading?: boolean;
	}

	let { album, onDownload, downloading = false }: Props = $props();

	let expanded = $state(false);
	let tracks = $state<Track[] | null>(null);
	let loadingTracks = $state(false);
	let tracksError = $state<string | null>(null);
	let selectedTrackIds = $state<Set<number>>(new Set());

	// Subscribe to library index for reactivity
	const libraryState = $derived($libraryIndex);

	const coverUrl = $derived(getCoverUrl(album.cover, 640));
	const duration = $derived(album.duration ? formatDuration(album.duration) : null);
	const artistName = $derived(album.artists?.map((a) => a.name).join(', ') || album.artist?.name || 'Unknown Artist');
	const year = $derived(album.releaseDate ? new Date(album.releaseDate).getFullYear() : null);
	const allSelected = $derived(tracks ? tracks.every(t => selectedTrackIds.has(t.id)) : false);
	const selectedCount = $derived(selectedTrackIds.size);
	
	// Disable download button when tracks are loaded but none selected
	const downloadDisabled = $derived(tracks !== null && selectedTrackIds.size === 0);
	
	// Helper to sanitize names (same as server)
	function sanitize(name: string): string {
		return name.replace(/[<>:"/\\|?*]/g, '_').trim();
	}
	
	// Helper to make track key (format: artist|album|disk|trackname)
	// For single-disk albums, disk is 0. For multi-disk, disk is the volume number.
	function makeTrackKey(artist: string, albumTitle: string, diskNum: number, trackTitle: string): string {
		return `${sanitize(artist).toLowerCase()}|${sanitize(albumTitle).toLowerCase()}|${diskNum}|${sanitize(trackTitle).toLowerCase()}`;
	}
	
	// Library status for the album (reactive)
	// Count unique tracks in library by scanning index for matching artist|album| prefix
	// Key format: artist|album|disk|trackname
	const albumLibraryStatus = $derived.by(() => {
		const total = album.numberOfTracks || 0;
		const prefix = `${sanitize(artistName).toLowerCase()}|${sanitize(album.title).toLowerCase()}|`;
		
		// Count unique disk|trackname combinations (handles multiple qualities/formats of same track)
		const uniqueTracksInLibrary = new Set<string>();
		for (const key of libraryState.tracks) {
			if (key.startsWith(prefix)) {
				// Extract disk|trackname (everything after artist|album|)
				const diskAndTrack = key.slice(prefix.length);
				uniqueTracksInLibrary.add(diskAndTrack);
			}
		}
		
		const inLibrary = uniqueTracksInLibrary.size;
		
		return {
			inLibrary,
			total,
			complete: inLibrary >= total && total > 0
		};
	});
	
	// Group tracks by disk (volumeNumber)
	const tracksByDisk = $derived.by(() => {
		if (!tracks) return [];
		const disks: Map<number, Track[]> = new Map();
		for (const track of tracks) {
			const disk = track.volumeNumber || 1;
			if (!disks.has(disk)) {
				disks.set(disk, []);
			}
			disks.get(disk)!.push(track);
		}
		return Array.from(disks.entries()).sort((a, b) => a[0] - b[0]);
	});
	
	const hasMultipleDisks = $derived(tracksByDisk.length > 1);
	
	// Get featured artists for a track (artists other than the main album artist)
	function getFeaturedArtists(track: Track): string | null {
		if (!track.artists || track.artists.length <= 1) return null;
		// Filter out the main album artist
		const dominated = track.artists.filter(a => a.name.toLowerCase() !== artistName.toLowerCase());
		if (dominated.length === 0) return null;
		return dominated.map(a => a.name).join(', ');
	}
	
	// Check if individual track is in library (reactive via libraryState dependency)
	function isTrackInLibrary(track: Track): boolean {
		// For single-disk albums (numberOfVolumes <= 1), use disk 0
		// For multi-disk albums, use the track's volumeNumber
		const diskNum = (album.numberOfVolumes && album.numberOfVolumes > 1) ? (track.volumeNumber || 1) : 0;
		const key = makeTrackKey(artistName, album.title, diskNum, track.title);
		return libraryState.tracks.has(key);
	}

	function handleDownload(quality: Quality) {
		const ids = selectedTrackIds.size > 0 ? Array.from(selectedTrackIds) : undefined;
		onDownload(album, quality, ids);
	}

	async function loadTracks() {
		if (loadingTracks) return;
		
		loadingTracks = true;
		tracksError = null;
		try {
			const response = await fetch(`/api/album?id=${album.id}`);
			if (!response.ok) {
				// Try to extract error message from response
				let errorMsg = 'Failed to load tracks';
				try {
					const errorData = await response.json();
					errorMsg = errorData.error || errorData.detail || errorMsg;
				} catch {
					// If we can't parse JSON, use status text
					errorMsg = response.statusText || errorMsg;
				}
				throw new Error(errorMsg);
			}
			const data = await response.json();
			const loadedTracks: Track[] = data.tracks || [];
			tracks = loadedTracks;
			// Select all by default
			selectedTrackIds = new Set(loadedTracks.map((t) => t.id));
		} catch (e) {
			const message = e instanceof Error ? e.message : 'Failed to load tracks';
			tracksError = message;
			toasts.error(message);
		} finally {
			loadingTracks = false;
		}
	}

	async function toggleExpanded() {
		if (expanded) {
			expanded = false;
		} else {
			expanded = true;
			if (tracks === null) {
				await loadTracks();
			}
		}
	}
	
	async function retryLoadTracks() {
		await loadTracks();
	}

	function toggleTrack(trackId: number) {
		if (selectedTrackIds.has(trackId)) {
			selectedTrackIds.delete(trackId);
		} else {
			selectedTrackIds.add(trackId);
		}
		selectedTrackIds = new Set(selectedTrackIds);
	}

	function toggleDisk(diskTracks: Track[]) {
		const allInDiskSelected = diskTracks.every(t => selectedTrackIds.has(t.id));
		if (allInDiskSelected) {
			// Deselect all in disk
			for (const t of diskTracks) {
				selectedTrackIds.delete(t.id);
			}
		} else {
			// Select all in disk
			for (const t of diskTracks) {
				selectedTrackIds.add(t.id);
			}
		}
		selectedTrackIds = new Set(selectedTrackIds);
	}

	function isDiskSelected(diskTracks: Track[]): boolean {
		return diskTracks.some(t => selectedTrackIds.has(t.id));
	}

	function isDiskFullySelected(diskTracks: Track[]): boolean {
		return diskTracks.every(t => selectedTrackIds.has(t.id));
	}

	function toggleAll() {
		if (allSelected) {
			selectedTrackIds = new Set();
		} else if (tracks) {
			selectedTrackIds = new Set(tracks.map(t => t.id));
		}
	}
</script>

<div class="overflow-hidden rounded-lg bg-neutral-800">
	<!-- Main card (always visible) -->
	<button
		type="button"
		onclick={toggleExpanded}
		class="flex w-full items-center gap-4 p-3 text-left transition-colors hover:bg-neutral-750"
	>
		<!-- Chevron -->
		<svg
			class="h-5 w-5 flex-shrink-0 text-neutral-500 transition-transform duration-200"
			class:rotate-90={expanded}
			fill="none"
			stroke="currentColor"
			viewBox="0 0 24 24"
		>
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
		</svg>

		<!-- Cover Art -->
		<div class="h-20 w-20 flex-shrink-0 overflow-hidden rounded-md bg-neutral-700">
			{#if coverUrl}
				<img src={coverUrl} alt={album.title} class="h-full w-full object-cover" />
			{/if}
		</div>

		<!-- Album Info -->
		<div class="flex min-w-0 flex-1 flex-col justify-center">
			<div class="flex items-center gap-2">
				<span class="truncate font-medium text-white">{album.title}</span>
				{#if albumLibraryStatus.complete}
					<span class="flex-shrink-0 rounded bg-green-900 px-1.5 py-0.5 text-xs font-medium text-green-300">
						In Library
					</span>
				{:else if albumLibraryStatus.inLibrary > 0}
					<span class="flex-shrink-0 rounded bg-green-900/50 px-1.5 py-0.5 text-xs font-medium text-green-400">
						{albumLibraryStatus.inLibrary} of {albumLibraryStatus.total} in library
					</span>
				{/if}
			</div>
			<span class="truncate text-sm text-neutral-400">{artistName}</span>
			<div class="flex items-center gap-2 text-sm text-neutral-500">
				{#if album.numberOfTracks}
					<span>{album.numberOfTracks} tracks</span>
				{/if}
				{#if year}
					<span>&middot; {year}</span>
				{/if}
				{#if duration}
					<span>&middot; {duration}</span>
				{/if}
			</div>
		</div>

		<!-- Download Button -->
		<div
			class="flex items-center"
			onclick={(e) => e.stopPropagation()}
			role="presentation"
		>
			<DownloadButton onDownload={handleDownload} {downloading} disabled={downloadDisabled} />
		</div>
	</button>

	<!-- Expanded: Track list -->
	{#if expanded}
		<div class="border-t border-neutral-700" transition:slide={{ duration: 200 }}>
			{#if loadingTracks}
				<div class="flex items-center justify-center py-6">
					<svg class="h-5 w-5 animate-spin text-neutral-500" viewBox="0 0 24 24" fill="none">
						<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
						<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
					</svg>
				</div>
			{:else if tracksError}
				<div class="flex items-center justify-between px-4 py-3">
					<span class="text-sm text-red-400">{tracksError}</span>
					<button
						type="button"
						onclick={retryLoadTracks}
						class="rounded bg-neutral-700 px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-600"
					>
						Retry
					</button>
				</div>
			{:else if tracks && tracks.length > 0}
				<!-- Track list -->
				<div>
					{#if hasMultipleDisks}
						<!-- Multi-disk: per-disk selection -->
						{#each tracksByDisk as [diskNum, diskTracks] (diskNum)}
							<div class="flex items-center gap-2 border-b border-neutral-700 bg-neutral-800 px-4 py-2">
								<input
									type="checkbox"
									checked={isDiskFullySelected(diskTracks)}
									onchange={() => toggleDisk(diskTracks)}
									class="h-4 w-4 rounded border-neutral-600 bg-neutral-700 text-green-500 focus:ring-green-500 focus:ring-offset-0"
								/>
								<button
									type="button"
									onclick={() => toggleDisk(diskTracks)}
									class="text-xs font-medium text-neutral-400 hover:text-white"
								>
									Disk {diskNum}
								</button>
								{#if isDiskSelected(diskTracks) && !isDiskFullySelected(diskTracks)}
									<span class="text-xs text-neutral-500">({diskTracks.filter(t => selectedTrackIds.has(t.id)).length} selected)</span>
								{/if}
							</div>
							{#each diskTracks as track (track.id)}
								{@const featured = getFeaturedArtists(track)}
								<div class="flex items-center gap-3 px-4 py-2 text-sm hover:bg-neutral-750">
									<input
										type="checkbox"
										checked={selectedTrackIds.has(track.id)}
										onchange={() => toggleTrack(track.id)}
										class="h-4 w-4 rounded border-neutral-600 bg-neutral-700 text-green-500 focus:ring-green-500 focus:ring-offset-0"
									/>
									<span class="w-6 text-right text-neutral-500">{track.trackNumber}</span>
									<div class="flex flex-1 items-center gap-1.5 truncate">
										<span class="{selectedTrackIds.has(track.id) ? 'text-neutral-300' : 'text-neutral-600'}">{track.title}</span>
										{#if track.explicit}
											<span class="flex-shrink-0 rounded bg-neutral-600 px-1 py-0.5 text-[10px] font-medium text-neutral-300">E</span>
										{/if}
										{#if featured}
											<span class="truncate text-neutral-500">feat. {featured}</span>
										{/if}
									</div>
									{#if isTrackInLibrary(track)}
										<svg class="h-4 w-4 flex-shrink-0 text-green-500" fill="currentColor" viewBox="0 0 24 24">
											<path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
										</svg>
									{/if}
									<span class="flex-shrink-0 text-neutral-500">{formatDuration(track.duration)}</span>
								</div>
							{/each}
						{/each}
					{:else}
						<!-- Single disk: global select all -->
						<div class="flex items-center gap-3 border-b border-neutral-700 px-4 py-2">
							<input
								type="checkbox"
								checked={allSelected}
								onchange={toggleAll}
								class="h-4 w-4 rounded border-neutral-600 bg-neutral-700 text-green-500 focus:ring-green-500 focus:ring-offset-0"
							/>
							<button
								type="button"
								onclick={toggleAll}
								class="text-sm text-neutral-400 hover:text-white"
							>
								{allSelected ? 'Deselect All' : 'Select All'}
							</button>
							{#if selectedCount > 0 && selectedCount < tracks.length}
								<span class="text-xs text-neutral-500">({selectedCount} selected)</span>
							{/if}
						</div>
						{#each tracks as track (track.id)}
							{@const featured = getFeaturedArtists(track)}
							<div class="flex items-center gap-3 px-4 py-2 text-sm hover:bg-neutral-750">
								<input
									type="checkbox"
									checked={selectedTrackIds.has(track.id)}
									onchange={() => toggleTrack(track.id)}
									class="h-4 w-4 rounded border-neutral-600 bg-neutral-700 text-green-500 focus:ring-green-500 focus:ring-offset-0"
								/>
								<span class="w-6 text-right text-neutral-500">{track.trackNumber}</span>
								<div class="flex flex-1 items-center gap-1.5 truncate">
									<span class="{selectedTrackIds.has(track.id) ? 'text-neutral-300' : 'text-neutral-600'}">{track.title}</span>
									{#if track.explicit}
										<span class="flex-shrink-0 rounded bg-neutral-600 px-1 py-0.5 text-[10px] font-medium text-neutral-300">E</span>
									{/if}
									{#if featured}
										<span class="truncate text-neutral-500">feat. {featured}</span>
									{/if}
								</div>
								{#if isTrackInLibrary(track)}
									<svg class="h-4 w-4 flex-shrink-0 text-green-500" fill="currentColor" viewBox="0 0 24 24">
										<path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
									</svg>
								{/if}
								<span class="flex-shrink-0 text-neutral-500">{formatDuration(track.duration)}</span>
							</div>
						{/each}
					{/if}
				</div>
			{/if}
		</div>
	{/if}
</div>
