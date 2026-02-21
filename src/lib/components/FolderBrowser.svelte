<script lang="ts">
	import { slide } from 'svelte/transition';

	// ==========================================================================
	// Types
	// ==========================================================================

	interface LibraryTrack {
		name: string;
		path: string;
		format: string;
		quality: string;
	}

	interface LibraryAlbum {
		name: string;
		path: string;
		tracks: LibraryTrack[];
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

	// ==========================================================================
	// Props & State
	// ==========================================================================

	interface Props {
		onRefreshRequest?: () => void;
	}

	let { onRefreshRequest }: Props = $props();

	let library = $state<Library | null>(null);
	let loading = $state(false);
	let error = $state<string | null>(null);
	let searchQuery = $state('');

	// Track expanded state for artists and albums
	let expandedArtists = $state<Set<string>>(new Set());
	let expandedAlbums = $state<Set<string>>(new Set());

	// ==========================================================================
	// Filtering
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
				const matchingTracks = album.tracks.filter((t) =>
					t.name.toLowerCase().includes(query)
				);

				// Include album if artist matches, album matches, or any track matches
				if (artistMatches || albumMatches || matchingTracks.length > 0) {
					matchingAlbums.push({
						...album,
						// Show all tracks if artist/album matches, otherwise only matching tracks
						tracks: artistMatches || albumMatches ? album.tracks : matchingTracks
					});
					totalTracks += artistMatches || albumMatches ? album.tracks.length : matchingTracks.length;
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
			// Expand all matching artists and albums when searching
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

	function handleRefresh() {
		fetchLibrary();
		onRefreshRequest?.();
	}

	function clearSearch() {
		searchQuery = '';
	}
</script>

<div class="flex h-full flex-col">
	<!-- Header -->
	<div class="mb-2 flex items-center justify-between">
		<h2 class="font-semibold">Library</h2>
		<button
			onclick={handleRefresh}
			disabled={loading}
			class="rounded p-1 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-white disabled:opacity-50"
			title="Refresh"
		>
			<svg
				class="h-5 w-5"
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

	<!-- Stats -->
	{#if filteredLibrary && filteredLibrary.totalTracks > 0}
		<div class="mb-2 text-xs text-neutral-500">
			{#if searchQuery.trim()}
				Found: {filteredLibrary.totalArtists} artists, {filteredLibrary.totalAlbums} albums, {filteredLibrary.totalTracks} tracks
			{:else}
				{filteredLibrary.totalArtists} artists, {filteredLibrary.totalAlbums} albums, {filteredLibrary.totalTracks} tracks
			{/if}
		</div>
	{/if}

	<!-- Content -->
	<div class="min-h-0 flex-1 overflow-y-auto">
		{#if error}
			<div class="rounded bg-red-900/50 p-3 text-sm text-red-200">
				{error}
			</div>
		{:else if loading && !library}
			<div class="flex items-center justify-center py-8">
				<svg class="h-6 w-6 animate-spin text-neutral-500" viewBox="0 0 24 24" fill="none">
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
					<!-- Artist -->
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
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M9 5l7 7-7 7"
								/>
							</svg>
							<svg class="h-4 w-4 flex-shrink-0 text-yellow-500" fill="currentColor" viewBox="0 0 24 24">
								<path d="M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2z" />
							</svg>
							<span class="truncate">{artist.name}</span>
							<span class="ml-auto flex-shrink-0 text-xs text-neutral-500">
								{artist.albums.length}
							</span>
						</button>

						<!-- Albums -->
						{#if expandedArtists.has(artist.name)}
							<div class="ml-4 space-y-1" transition:slide={{ duration: 150 }}>
								{#each artist.albums as album}
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
												<path
													stroke-linecap="round"
													stroke-linejoin="round"
													stroke-width="2"
													d="M9 5l7 7-7 7"
												/>
											</svg>
											<svg class="h-4 w-4 flex-shrink-0 text-blue-500" fill="currentColor" viewBox="0 0 24 24">
												<path d="M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2z" />
											</svg>
											<span class="truncate">{album.name}</span>
											<span class="ml-auto flex-shrink-0 text-xs text-neutral-500">
												{album.tracks.length}
											</span>
										</button>

										<!-- Tracks -->
										{#if expandedAlbums.has(album.path)}
											<div class="ml-4 space-y-0.5" transition:slide={{ duration: 150 }}>
												{#each album.tracks as track}
													<div
														class="flex items-center gap-2 rounded px-2 py-1 text-sm text-neutral-400"
													>
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
