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
				return 'bg-yellow-500';
			default:
				return 'bg-neutral-500';
		}
	}

	function getStatusText(item: DownloadItem): string {
		switch (item.status) {
			case 'pending':
				return 'Waiting...';
			case 'downloading':
				return `${item.progress}% (${formatBytes(item.bytesDownloaded)} / ${formatBytes(item.totalBytes)})`;
			case 'complete':
				return 'Complete';
			case 'error':
				return item.error || 'Error';
			case 'skipped':
				return 'Already exists';
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
	<!-- Tabs -->
	<div class="mb-3 flex border-b border-neutral-700">
		<button
			onclick={() => activeTab = 'library'}
			class="relative px-4 py-2 text-sm font-medium transition-colors {activeTab === 'library' ? 'text-white' : 'text-neutral-400 hover:text-neutral-200'}"
		>
			Library
			{#if activeTab === 'library'}
				<div class="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500"></div>
			{/if}
		</button>
		<button
			onclick={() => activeTab = 'downloads'}
			class="relative flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors {activeTab === 'downloads' ? 'text-white' : 'text-neutral-400 hover:text-neutral-200'}"
		>
			Downloads
			{#if activeDownloadCount > 0}
				<span class="flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-500 px-1.5 text-xs font-medium text-white">
					{activeDownloadCount}
				</span>
			{/if}
			{#if activeTab === 'downloads'}
				<div class="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500"></div>
			{/if}
		</button>
	</div>

	<!-- Tab Content -->
	{#if activeTab === 'library'}
		<!-- Library Tab -->
		<div class="flex min-h-0 flex-1 flex-col">
			<!-- Header with refresh -->
			<div class="mb-2 flex items-center justify-between">
				<div class="text-xs text-neutral-500">
					{#if filteredLibrary && filteredLibrary.totalTracks > 0}
						{#if searchQuery.trim()}
							Found: {filteredLibrary.totalArtists} artists, {filteredLibrary.totalAlbums} albums, {filteredLibrary.totalTracks} tracks
						{:else}
							{filteredLibrary.totalArtists} artists, {filteredLibrary.totalAlbums} albums, {filteredLibrary.totalTracks} tracks
						{/if}
					{/if}
				</div>
				<button
					onclick={fetchLibrary}
					disabled={loading}
					class="rounded p-1 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-white disabled:opacity-50"
					title="Refresh"
				>
					<svg
						class="h-4 w-4"
						class:animate-spin={loading}
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
						/>
					</svg>
				</button>
			</div>

			<!-- Search -->
			{#if library && library.totalTracks > 0}
				<div class="relative mb-2">
					<input
						type="text"
						bind:value={searchQuery}
						placeholder="Filter library..."
						class="w-full rounded border border-neutral-700 bg-neutral-800 py-1.5 pl-8 pr-8 text-sm text-white placeholder-neutral-500 focus:border-neutral-600 focus:outline-none"
					/>
					<svg
						class="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500"
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
					{#if searchQuery}
						<button
							onclick={clearSearch}
							class="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-neutral-500 hover:text-neutral-300"
							aria-label="Clear search"
						>
							<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
							</svg>
						</button>
					{/if}
				</div>
			{/if}

			<!-- Library Content -->
			<div class="min-h-0 flex-1 overflow-y-auto">
				{#if error}
					<div class="rounded bg-red-900/50 p-3 text-sm text-red-200">
						{error}
					</div>
				{:else if loading && !library}
					<div class="flex items-center justify-center py-8">
						<svg class="h-6 w-6 animate-spin text-neutral-500" viewBox="0 0 24 24" fill="none">
							<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
							<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
						</svg>
					</div>
				{:else if library && library.artists.length === 0}
					<div class="py-8 text-center text-sm text-neutral-500">
						No music downloaded yet
					</div>
				{:else if filteredLibrary && filteredLibrary.artists.length === 0}
					<div class="py-8 text-center text-sm text-neutral-500">
						No matches for "{searchQuery}"
					</div>
				{:else if filteredLibrary}
					<div class="space-y-1">
						{#each filteredLibrary.artists as artist}
							<div>
								<button
									onclick={() => toggleArtist(artist.name)}
									class="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-neutral-800"
								>
									<svg
										class="h-4 w-4 flex-shrink-0 text-neutral-500 transition-transform"
										class:rotate-90={expandedArtists.has(artist.name)}
										fill="none"
										stroke="currentColor"
										viewBox="0 0 24 24"
									>
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
									</svg>
									<svg class="h-4 w-4 flex-shrink-0 text-yellow-500" fill="currentColor" viewBox="0 0 24 24">
										<path d="M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2z" />
									</svg>
									<span class="truncate">{artist.name}</span>
									<span class="ml-auto flex-shrink-0 text-xs text-neutral-500">{artist.albums.reduce((sum, a) => sum + a.disks.reduce((s, d) => s + d.tracks.length, 0), 0)}</span>
								</button>

								{#if expandedArtists.has(artist.name)}
									<div class="ml-4 space-y-1" transition:slide={{ duration: 150 }}>
										{#each artist.albums as album}
											{@const hasMultipleDisks = album.disks.length > 1}
											<div>
												<button
													onclick={() => toggleAlbum(album.path)}
													class="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-neutral-800"
												>
													<svg
														class="h-4 w-4 flex-shrink-0 text-neutral-500 transition-transform"
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
															class="h-5 w-5 flex-shrink-0 rounded-sm object-cover"
														/>
													{:else}
														<svg class="h-5 w-5 flex-shrink-0 text-blue-500" fill="currentColor" viewBox="0 0 24 24">
															<path d="M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2z" />
														</svg>
													{/if}
													<span class="truncate">{album.name}</span>
													<span class="ml-auto flex-shrink-0 text-xs text-neutral-500">
														{album.disks.reduce((sum, d) => sum + d.tracks.length, 0)} tracks
														{#if hasMultipleDisks}
															({album.disks.length} disks)
														{/if}
													</span>
												</button>

												{#if expandedAlbums.has(album.path)}
													<div class="ml-4 space-y-0.5" transition:slide={{ duration: 150 }}>
														{#each album.disks as disk}
															{#if hasMultipleDisks}
																<div class="px-2 py-1 text-xs font-medium text-neutral-500">
																	{disk.name}
																</div>
															{/if}
															{#each disk.tracks as track}
																<div class="flex items-center gap-2 rounded px-2 py-1 text-sm text-neutral-400">
																	<svg class="h-4 w-4 flex-shrink-0 text-neutral-600" fill="currentColor" viewBox="0 0 24 24">
																		<path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
																	</svg>
																	<span class="truncate">{track.name.replace(/\.(flac|m4a|mp3|wav|ogg)$/i, '')}</span>
																	<div class="ml-auto flex flex-shrink-0 items-center gap-1">
																		<span 
																			class="rounded px-1.5 py-0.5 text-[10px] font-medium"
																			class:bg-green-900={track.format === 'FLAC'}
																			class:text-green-300={track.format === 'FLAC'}
																			class:bg-orange-900={track.format === 'AAC'}
																			class:text-orange-300={track.format === 'AAC'}
																			class:bg-purple-900={track.format === 'MP3'}
																			class:text-purple-300={track.format === 'MP3'}
																			class:bg-neutral-700={track.format !== 'FLAC' && track.format !== 'AAC' && track.format !== 'MP3'}
																			class:text-neutral-400={track.format !== 'FLAC' && track.format !== 'AAC' && track.format !== 'MP3'}
																		>
																			{track.format}
																		</span>
																		{#if track.quality}
																			<span class="rounded bg-neutral-700 px-1.5 py-0.5 text-[10px] text-neutral-300">
																				{track.quality}
																			</span>
																		{/if}
																	</div>
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
				<!-- Header with clear button -->
				<div class="mb-2 flex items-center justify-between">
					<div class="text-xs text-neutral-500">
						{$downloadItems.length} item{$downloadItems.length !== 1 ? 's' : ''}
					</div>
					{#if !$hasActiveDownloads}
						<button
							onclick={() => downloads.clearCompleted()}
							class="text-xs text-neutral-400 transition-colors hover:text-white"
						>
							Clear all
						</button>
					{/if}
				</div>

				<!-- Download items -->
				<div class="min-h-0 flex-1 space-y-2 overflow-y-auto">
					{#each $downloadItems as item (item.id)}
						<div 
							class="rounded-lg p-3 transition-colors {item.status === 'pending' ? 'bg-neutral-800/50' : 'bg-neutral-800'}"
						>
							<div class="mb-1 flex items-center justify-between">
								<div class="min-w-0 flex-1">
									<div class="truncate text-sm font-medium {item.status === 'pending' ? 'text-neutral-400' : 'text-white'}">
										{item.trackTitle}
									</div>
									<div class="truncate text-xs {item.status === 'pending' ? 'text-neutral-600' : 'text-neutral-400'}">
										{item.artistName} - {item.albumTitle}
									</div>
								</div>
								<div class="ml-3 flex-shrink-0 flex items-center gap-2">
									{#if item.status === 'pending'}
										<span class="rounded bg-neutral-700 px-1.5 py-0.5 text-[10px] text-neutral-400">
											Pending
										</span>
									{/if}
									<span class="text-xs {item.status === 'pending' ? 'text-neutral-600' : 'text-neutral-400'}">
										{getStatusText(item)}
									</span>
								</div>
							</div>

							<div class="h-1.5 overflow-hidden rounded-full bg-neutral-700">
								<div
									class="h-full transition-all duration-300 {getStatusColor(item.status)}"
									style="width: {item.progress}%"
								></div>
							</div>
						</div>
					{/each}
				</div>
			{:else}
				<div class="flex flex-1 items-center justify-center text-sm text-neutral-500">
					No downloads yet
				</div>
			{/if}
		</div>
	{/if}
</div>
