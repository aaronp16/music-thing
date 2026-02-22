<script lang="ts">
	import { slide } from 'svelte/transition';
	import { downloadItems, downloads, hasActiveDownloads } from '$lib/stores/downloads';
	import type { DownloadItem } from '$lib/stores/downloads';

	// ==========================================================================
	// Props
	// ==========================================================================

	interface Props {
		onArtistClick?: (artistId: number, artistName: string) => void;
	}

	let { onArtistClick }: Props = $props();

	// ==========================================================================
	// Types
	// ==========================================================================

	interface LibraryTrack {
		name: string;
		path: string;
		format: string;
		quality: string;
	}

	interface LibraryDisk {
		name: string;
		path: string;
		tracks: LibraryTrack[];
	}

	interface LibraryAlbum {
		name: string;
		path: string;
		disks: LibraryDisk[];
		hasCover: boolean;
	}

	interface LibraryArtist {
		name: string;
		path: string;
		albums: LibraryAlbum[];
		hasArtistImage: boolean;
	}

	interface Library {
		artists: LibraryArtist[];
		totalArtists: number;
		totalAlbums: number;
		totalTracks: number;
	}

	type Tab = 'library' | 'downloads';

	// ==========================================================================
	// State
	// ==========================================================================

	let activeTab = $state<Tab>('library');
	let library = $state<Library | null>(null);
	let loading = $state(false);
	let error = $state<string | null>(null);
	let searchQuery = $state('');

	// Track expanded state for artists and albums
	let expandedArtists = $state<Set<string>>(new Set());
	let expandedAlbums = $state<Set<string>>(new Set());

	// Backfill state
	let backfillRunning = $state(false);
	let backfillProgress = $state<{ current: number; total: number; artist?: string } | null>(null);

	// ==========================================================================
	// Backfill Artist Images
	// ==========================================================================

	async function backfillArtistImages() {
		if (backfillRunning) return;
		
		backfillRunning = true;
		backfillProgress = { current: 0, total: 0 };
		
		try {
			const response = await fetch('/api/library/backfill', { method: 'POST' });
			const reader = response.body?.getReader();
			
			if (!reader) {
				throw new Error('No response body');
			}
			
			const decoder = new TextDecoder();
			let buffer = '';
			
			while (true) {
				const { done, value } = await reader.read();
				
				if (done) break;
				
				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split('\n');
				buffer = lines.pop() || '';
				
				for (const line of lines) {
					if (!line.trim()) continue;
					
					try {
						const progress = JSON.parse(line);
						backfillProgress = {
							current: progress.current,
							total: progress.total,
							artist: progress.artist
						};
						
						if (progress.type === 'complete') {
							// Refresh library to show new images
							await fetchLibrary();
						}
					} catch {
						// Ignore parse errors
					}
				}
			}
		} catch (err) {
			console.error('Backfill failed:', err);
		} finally {
			backfillRunning = false;
			backfillProgress = null;
		}
	}

	// ==========================================================================
	// Downloads Helpers
	// ==========================================================================

	function formatBytes(bytes: number): string {
		if (bytes === 0) return '0 B';
		const k = 1024;
		const sizes = ['B', 'KB', 'MB', 'GB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
	}

	function getStatusColor(status: DownloadItem['status']): string {
		switch (status) {
			case 'downloading':
				return 'bg-blue-500';
			case 'complete':
				return 'bg-green-500';
			case 'error':
				return 'bg-red-500';
			case 'skipped':
				return 'bg-amber-500';
			default:
				return 'bg-neutral-600';
		}
	}

	function getStatusText(item: DownloadItem): string {
		switch (item.status) {
			case 'pending':
				return 'Waiting...';
			case 'downloading':
				return `${item.progress}%`;
			case 'complete':
				return 'Done';
			case 'error':
				return item.error || 'Error';
			case 'skipped':
				return 'Exists';
			default:
				return '';
		}
	}

	// Auto-switch to downloads tab when a NEW download starts (not continuously)
	let previousDownloadCount = $state(0);
	$effect(() => {
		const currentCount = $downloadItems.filter(i => i.status === 'downloading' || i.status === 'pending').length;
		// Only switch if a new download was added (count increased)
		if (currentCount > previousDownloadCount && activeTab === 'library') {
			activeTab = 'downloads';
		}
		previousDownloadCount = currentCount;
	});

	// ==========================================================================
	// Library Filtering
	// ==========================================================================

	const filteredLibrary = $derived.by(() => {
		if (!library) return null;
		if (!searchQuery.trim()) return library;

		const query = searchQuery.toLowerCase();
		const filteredArtists: LibraryArtist[] = [];
		let totalAlbums = 0;
		let totalTracks = 0;

		for (const artist of library.artists) {
			const artistMatches = artist.name.toLowerCase().includes(query);
			const matchingAlbums: LibraryAlbum[] = [];

			for (const album of artist.albums) {
				const albumMatches = album.name.toLowerCase().includes(query);
				
				// Check tracks in all disks
				let matchingTracks: LibraryTrack[] = [];
				for (const disk of album.disks) {
					const diskMatchingTracks = disk.tracks.filter((t) =>
						t.name.toLowerCase().includes(query)
					);
					matchingTracks = [...matchingTracks, ...diskMatchingTracks];
				}

				if (artistMatches || albumMatches || matchingTracks.length > 0) {
					// Include all disks if artist/album matches, otherwise only matching tracks
					const newDisks = artistMatches || albumMatches 
						? album.disks 
						: album.disks.map(disk => ({
							...disk,
							tracks: disk.tracks.filter(t => 
								t.name.toLowerCase().includes(query) || 
								(artistMatches || albumMatches)
							)
						}));
					
					matchingAlbums.push({
						...album,
						disks: newDisks
					});
					
					const trackCount = artistMatches || albumMatches 
						? album.disks.reduce((sum, d) => sum + d.tracks.length, 0)
						: matchingTracks.length;
					totalTracks += trackCount;
				}
			}

			if (matchingAlbums.length > 0) {
				filteredArtists.push({
					...artist,
					albums: matchingAlbums
				});
				totalAlbums += matchingAlbums.length;
			}
		}

		return {
			artists: filteredArtists,
			totalArtists: filteredArtists.length,
			totalAlbums,
			totalTracks
		};
	});

	// Auto-expand when searching
	$effect(() => {
		if (searchQuery.trim() && filteredLibrary) {
			const newExpandedArtists = new Set<string>();
			const newExpandedAlbums = new Set<string>();

			for (const artist of filteredLibrary.artists) {
				newExpandedArtists.add(artist.name);
				for (const album of artist.albums) {
					newExpandedAlbums.add(album.path);
				}
			}

			expandedArtists = newExpandedArtists;
			expandedAlbums = newExpandedAlbums;
		}
	});

	// ==========================================================================
	// Data Fetching
	// ==========================================================================

	async function fetchLibrary() {
		loading = true;
		error = null;

		try {
			const response = await fetch('/api/library');
			if (!response.ok) {
				throw new Error('Failed to load library');
			}
			library = await response.json();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load library';
		} finally {
			loading = false;
		}
	}

	// Expose refresh function
	export function refresh() {
		fetchLibrary();
	}

	// Initial load
	$effect(() => {
		fetchLibrary();
	});

	// ==========================================================================
	// Event Handlers
	// ==========================================================================

	function toggleArtist(artistName: string) {
		if (expandedArtists.has(artistName)) {
			expandedArtists.delete(artistName);
		} else {
			expandedArtists.add(artistName);
		}
		expandedArtists = new Set(expandedArtists);
	}

	function toggleAlbum(albumPath: string) {
		if (expandedAlbums.has(albumPath)) {
			expandedAlbums.delete(albumPath);
		} else {
			expandedAlbums.add(albumPath);
		}
		expandedAlbums = new Set(expandedAlbums);
	}

	function clearSearch() {
		searchQuery = '';
	}

	// Count active/pending downloads for badge
	const activeDownloadCount = $derived(
		$downloadItems.filter(i => i.status === 'downloading' || i.status === 'pending').length
	);
</script>

<div class="flex h-full flex-col">
	<!-- Header -->
	<div class="mb-6">
		<!-- Tab pills -->
		<div class="flex gap-2">
			<button
				onclick={() => activeTab = 'library'}
				class="rounded-full px-4 py-1.5 text-sm font-medium transition-all {activeTab === 'library' 
					? 'bg-white text-black' 
					: 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700 hover:text-white'}"
			>
				Library
			</button>
			<button
				onclick={() => activeTab = 'downloads'}
				class="flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium transition-all {activeTab === 'downloads' 
					? 'bg-white text-black' 
					: 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700 hover:text-white'}"
			>
				Downloads
				{#if activeDownloadCount > 0}
					<span class="flex h-5 min-w-5 items-center justify-center rounded-full text-xs font-bold {activeTab === 'downloads' ? 'bg-black text-white' : 'bg-blue-500 text-white'}">
						{activeDownloadCount}
					</span>
				{/if}
			</button>
		</div>
	</div>

	<!-- Tab Content -->
	{#if activeTab === 'library'}
		<!-- Library Tab -->
		<div class="flex min-h-0 flex-1 flex-col">
			<!-- Search bar -->
			{#if library && library.totalTracks > 0}
				<div class="relative mb-4">
					<div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
						{#if loading}
							<svg class="h-4 w-4 animate-spin text-neutral-500" viewBox="0 0 24 24" fill="none">
								<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
								<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
							</svg>
						{:else}
							<svg class="h-4 w-4 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
							</svg>
						{/if}
					</div>
					<input
						type="text"
						bind:value={searchQuery}
						placeholder="Filter library..."
						class="w-full rounded-full border-0 bg-neutral-800 py-2 pl-10 pr-10 text-sm text-white placeholder-neutral-500 ring-1 ring-neutral-700 transition-all focus:bg-neutral-750 focus:outline-none focus:ring-2 focus:ring-neutral-600"
					/>
					{#if searchQuery}
						<button
							onclick={clearSearch}
							class="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-neutral-500 hover:bg-neutral-700 hover:text-neutral-300"
							aria-label="Clear search"
						>
							<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
							</svg>
						</button>
					{:else}
						<button
							onclick={fetchLibrary}
							disabled={loading}
							class="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-neutral-500 hover:bg-neutral-700 hover:text-neutral-300 disabled:opacity-50"
							title="Refresh library"
						>
							<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
							</svg>
						</button>
					{/if}
				</div>
			{/if}

			<!-- Stats -->
			{#if filteredLibrary && filteredLibrary.totalTracks > 0}
				<div class="mb-3 flex items-center justify-between text-xs text-neutral-500">
					<span>
						{#if searchQuery.trim()}
							Found {filteredLibrary.totalTracks} tracks
						{:else}
							{filteredLibrary.totalArtists} artists &middot; {filteredLibrary.totalAlbums} albums &middot; {filteredLibrary.totalTracks} tracks
						{/if}
					</span>
					{#if !searchQuery.trim()}
						{@const missingImages = library?.artists.filter(a => !a.hasArtistImage).length || 0}
						{#if backfillRunning && backfillProgress}
							<span class="text-blue-400">
								Fetching {backfillProgress.current}/{backfillProgress.total}...
							</span>
						{:else if missingImages > 0}
							<button
								onclick={backfillArtistImages}
								class="rounded-full bg-neutral-800 px-2 py-0.5 text-neutral-400 transition-colors hover:bg-neutral-700 hover:text-white"
								title="Fetch missing artist images from Tidal"
							>
								Fetch {missingImages} image{missingImages !== 1 ? 's' : ''}
							</button>
						{/if}
					{/if}
				</div>
			{/if}

			<!-- Library Content -->
			<div class="min-h-0 flex-1 overflow-y-auto">
				{#if error}
					<div class="flex flex-col items-center justify-center py-12 text-center">
						<div class="mb-3 rounded-full bg-red-900/30 p-3">
							<svg class="h-6 w-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
							</svg>
						</div>
						<p class="text-sm text-red-400">{error}</p>
						<button onclick={fetchLibrary} class="mt-2 text-xs text-neutral-400 hover:text-white">Try again</button>
					</div>
				{:else if loading && !library}
					<div class="flex flex-col items-center justify-center py-12">
						<svg class="h-8 w-8 animate-spin text-neutral-600" viewBox="0 0 24 24" fill="none">
							<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
							<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
						</svg>
						<p class="mt-3 text-sm text-neutral-500">Loading library...</p>
					</div>
				{:else if library && library.artists.length === 0}
					<div class="flex flex-col items-center justify-center py-12 text-center">
						<svg class="mb-3 h-12 w-12 text-neutral-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
						</svg>
						<p class="text-sm text-neutral-400">Your library is empty</p>
						<p class="mt-1 text-xs text-neutral-500">Downloaded music will appear here</p>
					</div>
				{:else if filteredLibrary && filteredLibrary.artists.length === 0}
					<div class="flex flex-col items-center justify-center py-12 text-center">
						<svg class="mb-3 h-10 w-10 text-neutral-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
						</svg>
						<p class="text-sm text-neutral-400">No matches found</p>
						<p class="mt-1 text-xs text-neutral-500">Try a different search term</p>
					</div>
				{:else if filteredLibrary}
					<div class="space-y-0.5">
						{#each filteredLibrary.artists as artist}
							<div>
								<button
									onclick={() => toggleArtist(artist.name)}
									class="group flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-neutral-800/70"
								>
								<svg
									class="h-4 w-4 flex-shrink-0 text-neutral-600 transition-transform"
									class:rotate-90={expandedArtists.has(artist.name)}
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
								</svg>
								{#if artist.hasArtistImage}
									<img 
										src="/api/library/artist?path={encodeURIComponent(artist.path)}" 
										alt=""
										class="h-7 w-7 flex-shrink-0 rounded-full object-cover"
									/>
								{:else}
									<div class="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-neutral-800">
										<svg class="h-3.5 w-3.5 text-neutral-400" fill="currentColor" viewBox="0 0 24 24">
											<path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
										</svg>
									</div>
								{/if}
									<span class="flex-1 truncate text-sm font-medium text-white">{artist.name}</span>
									<span class="text-xs text-neutral-500">{artist.albums.length}</span>
								</button>

								{#if expandedArtists.has(artist.name)}
									<div class="ml-6 space-y-0.5 border-l border-neutral-800 pl-2" transition:slide={{ duration: 150 }}>
										{#each artist.albums as album}
											{@const hasMultipleDisks = album.disks.length > 1}
											{@const trackCount = album.disks.reduce((sum, d) => sum + d.tracks.length, 0)}
											<div>
												<button
													onclick={() => toggleAlbum(album.path)}
													class="group flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-neutral-800/70"
												>
													<svg
														class="h-4 w-4 flex-shrink-0 text-neutral-600 transition-transform"
														class:rotate-90={expandedAlbums.has(album.path)}
														fill="none"
														stroke="currentColor"
														viewBox="0 0 24 24"
													>
														<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
													</svg>
													{#if album.hasCover}
														<img 
															src="/api/library/cover?path={encodeURIComponent(album.path)}" 
															alt=""
															class="h-7 w-7 flex-shrink-0 rounded object-cover"
														/>
													{:else}
														<div class="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded bg-neutral-800">
															<svg class="h-3.5 w-3.5 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
																<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"/>
															</svg>
														</div>
													{/if}
													<span class="flex-1 truncate text-sm text-neutral-300">{album.name}</span>
													<span class="text-xs text-neutral-500">
														{trackCount}
													</span>
												</button>

												{#if expandedAlbums.has(album.path)}
													<div class="ml-6 space-y-0.5 border-l border-neutral-800 pl-2" transition:slide={{ duration: 150 }}>
														{#each album.disks as disk}
															{#if hasMultipleDisks}
																<div class="px-2 py-1 text-xs font-medium text-neutral-500">
																	{disk.name}
																</div>
															{/if}
															{#each disk.tracks as track}
																<div class="flex items-center gap-2 rounded-lg px-2 py-1 text-sm text-neutral-400 transition-colors hover:bg-neutral-800/50">
																	<svg class="h-3.5 w-3.5 flex-shrink-0 text-neutral-600" fill="currentColor" viewBox="0 0 24 24">
																		<path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
																	</svg>
																	<span class="flex-1 truncate">{track.name.replace(/\.(flac|m4a|mp3|wav|ogg)$/i, '')}</span>
																	<span 
																		class="rounded px-1.5 py-0.5 text-[10px] font-medium {
																			track.format === 'FLAC' ? 'bg-green-900/50 text-green-400' :
																			track.format === 'AAC' ? 'bg-orange-900/50 text-orange-400' :
																			track.format === 'MP3' ? 'bg-purple-900/50 text-purple-400' :
																			'bg-neutral-800 text-neutral-400'
																		}"
																	>
																		{track.format}
																	</span>
																</div>
															{/each}
														{/each}
													</div>
												{/if}
											</div>
										{/each}
									</div>
								{/if}
							</div>
						{/each}
					</div>
				{/if}
			</div>
		</div>
	{:else}
		<!-- Downloads Tab -->
		<div class="flex min-h-0 flex-1 flex-col">
			{#if $downloadItems.length > 0}
				<!-- Header -->
				<div class="mb-3 flex items-center justify-between text-xs text-neutral-500">
					<span>{$downloadItems.length} item{$downloadItems.length !== 1 ? 's' : ''}</span>
					{#if !$hasActiveDownloads}
						<button
							onclick={() => downloads.clearCompleted()}
							class="rounded-full bg-neutral-800 px-2 py-1 text-neutral-400 transition-colors hover:bg-neutral-700 hover:text-white"
						>
							Clear all
						</button>
					{/if}
				</div>

				<!-- Download items -->
				<div class="min-h-0 flex-1 space-y-1.5 overflow-y-auto">
					{#each $downloadItems as item (item.id)}
						<div 
							class="rounded-lg p-3 transition-colors {item.status === 'pending' ? 'bg-neutral-800/30' : 'bg-neutral-800/50'}"
						>
							<div class="mb-2 flex items-start justify-between gap-3">
								<div class="min-w-0 flex-1">
									<div class="truncate text-sm font-medium {item.status === 'pending' ? 'text-neutral-500' : 'text-white'}">
										{item.trackTitle}
									</div>
									<div class="truncate text-xs {item.status === 'pending' ? 'text-neutral-600' : 'text-neutral-500'}">
										{item.artistName} &middot; {item.albumTitle}
									</div>
								</div>
								<div class="flex flex-shrink-0 items-center gap-2">
									{#if item.status === 'downloading'}
										<span class="text-xs font-medium text-blue-400">{item.progress}%</span>
									{:else if item.status === 'complete'}
										<svg class="h-4 w-4 text-green-500" fill="currentColor" viewBox="0 0 24 24">
											<path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
										</svg>
									{:else if item.status === 'error'}
										<svg class="h-4 w-4 text-red-500" fill="currentColor" viewBox="0 0 24 24">
											<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
										</svg>
									{:else if item.status === 'skipped'}
										<span class="rounded bg-amber-900/50 px-1.5 py-0.5 text-[10px] font-medium text-amber-400">Exists</span>
									{:else if item.status === 'pending'}
										<span class="text-xs text-neutral-600">Waiting</span>
									{/if}
								</div>
							</div>

							<!-- Progress bar -->
							<div class="h-1 overflow-hidden rounded-full bg-neutral-700">
								<div
									class="h-full transition-all duration-300 {getStatusColor(item.status)}"
									style="width: {item.progress}%"
								></div>
							</div>
							
							{#if item.status === 'downloading' && item.totalBytes > 0}
								<div class="mt-1 text-right text-[10px] text-neutral-500">
									{formatBytes(item.bytesDownloaded)} / {formatBytes(item.totalBytes)}
								</div>
							{/if}
							
							{#if item.status === 'error' && item.error}
								<div class="mt-1 truncate text-xs text-red-400">{item.error}</div>
							{/if}
						</div>
					{/each}
				</div>
			{:else}
				<div class="flex flex-1 flex-col items-center justify-center py-12 text-center">
					<svg class="mb-3 h-12 w-12 text-neutral-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
					</svg>
					<p class="text-sm text-neutral-400">No downloads</p>
					<p class="mt-1 text-xs text-neutral-500">Downloads will appear here</p>
				</div>
			{/if}
		</div>
	{/if}
</div>
