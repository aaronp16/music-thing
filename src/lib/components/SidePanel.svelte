<script lang="ts">
	import { slide } from 'svelte/transition';
	import { downloadItems, downloads, hasActiveDownloads } from '$lib/stores/downloads';
	import type { DownloadItem } from '$lib/stores/downloads';

	// ==========================================================================
	// Props
	// ==========================================================================

	interface Props {
		onArtistClick?: (artistId: number, artistName: string) => void;
		onTrackMetadataClick?: (trackPath: string) => void;
		forcedTab?: 'library' | 'downloads';
		hideTabBar?: boolean;
		showLargeTitle?: boolean;
		titleRight?: import('svelte').Snippet;
	}

	let {
		onArtistClick,
		onTrackMetadataClick,
		forcedTab,
		hideTabBar = false,
		showLargeTitle = false,
		titleRight
	}: Props = $props();

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

	// Sync with forced tab if provided
	$effect(() => {
		if (forcedTab !== undefined) {
			activeTab = forcedTab;
		}
	});
	let library = $state<Library | null>(null);
	let loading = $state(false);
	let error = $state<string | null>(null);
	let searchQuery = $state('');

	// Track expanded state for artists and albums
	let expandedArtists = $state<Set<string>>(new Set());
	let expandedAlbums = $state<Set<string>>(new Set());

	// Enrichment state
	let enrichRunning = $state(false);
	let enrichProgress = $state<{
		current: number;
		total: number;
		track?: string;
		enriched: number;
		skipped: number;
		failed: number;
	} | null>(null);

	// ==========================================================================
	// Enrich All Metadata (includes artist images + MusicBrainz data)
	// ==========================================================================

	async function enrichAllMetadata() {
		if (enrichRunning) return;

		enrichRunning = true;
		enrichProgress = { current: 0, total: 0, enriched: 0, skipped: 0, failed: 0 };

		try {
			const response = await fetch('/api/library/enrich-metadata', { method: 'POST' });
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
						enrichProgress = {
							current: progress.current,
							total: progress.total,
							track: progress.track,
							enriched: progress.enriched,
							skipped: progress.skipped,
							failed: progress.failed
						};

						if (progress.type === 'complete') {
							// Refresh library
							await fetchLibrary();
						}
					} catch {
						// Ignore parse errors
					}
				}
			}
		} catch (err) {
			console.error('Enrichment failed:', err);
		} finally {
			enrichRunning = false;
			enrichProgress = null;
		}
	}

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
					const newDisks =
						artistMatches || albumMatches
							? album.disks
							: album.disks.map((disk) => ({
									...disk,
									tracks: disk.tracks.filter(
										(t) => t.name.toLowerCase().includes(query) || artistMatches || albumMatches
									)
								}));

					matchingAlbums.push({
						...album,
						disks: newDisks
					});

					const trackCount =
						artistMatches || albumMatches
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
		$downloadItems.filter((i) => i.status === 'downloading' || i.status === 'pending').length
	);
</script>

<div class="flex h-full flex-col">
	<!-- Library Content -->
	{#if activeTab === 'library' || showLargeTitle}
		<div class="flex flex-1 flex-col overflow-hidden">
			<!-- Header -->
			<div class="animate-fade-in px-4 py-6 sm:px-6 sm:py-8">
				{#if showLargeTitle}
					<div class="mb-4 flex items-center justify-between gap-4 sm:mb-6">
						<h1 class="text-2xl font-bold text-white sm:text-3xl md:text-4xl">Library</h1>
						{#if titleRight}
							{@render titleRight()}
						{/if}
					</div>
				{/if}

				<!-- Search bar -->
				{#if library && library.totalTracks > 0}
					<div class="relative">
						<div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
							{#if loading}
								<svg class="h-5 w-5 animate-spin text-neutral-400" viewBox="0 0 24 24" fill="none">
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
							placeholder="Filter library..."
							class="w-full rounded-full border-0 bg-neutral-800 py-3 pr-12 pl-12 text-white placeholder-neutral-500 ring-1 ring-neutral-700 transition-all focus:bg-neutral-750 focus:ring-2 focus:ring-blue-500 focus:outline-none"
						/>
						{#if searchQuery}
							<button
								onclick={clearSearch}
								class="absolute top-1/2 right-4 -translate-y-1/2 rounded-full p-0.5 text-neutral-400 hover:bg-neutral-700 hover:text-neutral-300"
								aria-label="Clear search"
							>
								<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M6 18L18 6M6 6l12 12"
									/>
								</svg>
							</button>
						{:else}
							<button
								onclick={fetchLibrary}
								disabled={loading}
								class="absolute top-1/2 right-4 -translate-y-1/2 rounded-full p-0.5 text-neutral-400 hover:bg-neutral-700 hover:text-neutral-300 disabled:opacity-50"
								title="Refresh library"
							>
								<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
									/>
								</svg>
							</button>
						{/if}
					</div>
				{/if}
			</div>

			<!-- Results area -->
			<div class="min-h-0 flex-1 overflow-y-auto px-4 pb-4 sm:px-6 sm:pb-8">
				<!-- Stats -->
				{#if filteredLibrary && filteredLibrary.totalTracks > 0}
					<div class="mb-3 flex items-center justify-between text-xs text-neutral-500">
						<span>
							{#if searchQuery.trim()}
								Found {filteredLibrary.totalTracks} tracks
							{:else}
								{filteredLibrary.totalArtists} artists &middot; {filteredLibrary.totalAlbums} albums &middot;
								{filteredLibrary.totalTracks} tracks
							{/if}
						</span>
						{#if !searchQuery.trim()}
							{#if enrichRunning && enrichProgress}
								<div class="flex flex-col items-end gap-1">
									<span class="text-sm text-blue-400">
										Enriching {enrichProgress.current}/{enrichProgress.total}...
									</span>
									{#if enrichProgress.track}
										<span class="max-w-[200px] truncate text-xs text-neutral-500">
											{enrichProgress.track}
										</span>
									{/if}
								</div>
							{:else}
								<button
									onclick={enrichAllMetadata}
									class="rounded-full bg-neutral-800 px-3 py-1 text-sm text-neutral-400 transition-colors hover:bg-neutral-700 hover:text-white"
									title="Enrich all tracks with metadata from MusicBrainz"
								>
									<svg
										class="mr-1 inline-block h-4 w-4"
										fill="none"
										stroke="currentColor"
										viewBox="0 0 24 24"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
										/>
									</svg>
									Enrich Metadata
								</button>
							{/if}
						{/if}
					</div>
				{/if}

				<!-- Library Content -->
				{#if error}
					<div class="flex flex-col items-center justify-center py-12 text-center">
						<div class="mb-3 rounded-full bg-red-900/30 p-3">
							<svg
								class="h-6 w-6 text-red-400"
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
						<p class="text-sm text-red-400">{error}</p>
						<button onclick={fetchLibrary} class="mt-2 text-xs text-neutral-400 hover:text-white"
							>Try again</button
						>
					</div>
				{:else if loading && !library}
					<div class="flex flex-col items-center justify-center py-12">
						<svg class="h-8 w-8 animate-spin text-neutral-600" viewBox="0 0 24 24" fill="none">
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
						<p class="mt-3 text-sm text-neutral-500">Loading library...</p>
					</div>
				{:else if library && library.artists.length === 0}
					<div class="flex flex-col items-center justify-center py-12 text-center">
						<svg
							class="mb-3 h-12 w-12 text-neutral-700"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="1.5"
								d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
							/>
						</svg>
						<p class="text-sm text-neutral-400">Your library is empty</p>
						<p class="mt-1 text-xs text-neutral-500">Downloaded music will appear here</p>
					</div>
				{:else if filteredLibrary && filteredLibrary.artists.length === 0}
					<div class="flex flex-col items-center justify-center py-12 text-center">
						<svg
							class="mb-3 h-10 w-10 text-neutral-700"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="1.5"
								d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
							/>
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
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M9 5l7 7-7 7"
										/>
									</svg>
									{#if artist.hasArtistImage}
										<img
											src="/api/library/artist?path={encodeURIComponent(artist.path)}"
											alt=""
											class="h-7 w-7 flex-shrink-0 rounded-full object-cover"
										/>
									{:else}
										<div
											class="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-neutral-800"
										>
											<svg
												class="h-3.5 w-3.5 text-neutral-400"
												fill="currentColor"
												viewBox="0 0 24 24"
											>
												<path
													d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"
												/>
											</svg>
										</div>
									{/if}
									<span class="flex-1 truncate text-sm font-medium text-white">{artist.name}</span>
									<span class="text-xs text-neutral-500">{artist.albums.length}</span>
								</button>

								{#if expandedArtists.has(artist.name)}
									<div
										class="ml-6 space-y-0.5 border-l border-neutral-800 pl-2"
										transition:slide={{ duration: 150 }}
									>
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
														<path
															stroke-linecap="round"
															stroke-linejoin="round"
															stroke-width="2"
															d="M9 5l7 7-7 7"
														/>
													</svg>
													{#if album.hasCover}
														<img
															src="/api/library/cover?path={encodeURIComponent(album.path)}"
															alt=""
															class="h-7 w-7 flex-shrink-0 rounded object-cover"
														/>
													{:else}
														<div
															class="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded bg-neutral-800"
														>
															<svg
																class="h-3.5 w-3.5 text-neutral-400"
																fill="none"
																stroke="currentColor"
																viewBox="0 0 24 24"
															>
																<path
																	stroke-linecap="round"
																	stroke-linejoin="round"
																	stroke-width="1.5"
																	d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
																/>
															</svg>
														</div>
													{/if}
													<span class="flex-1 truncate text-sm text-neutral-300">{album.name}</span>
													<span class="text-xs text-neutral-500">
														{trackCount}
													</span>
												</button>

												{#if expandedAlbums.has(album.path)}
													<div
														class="ml-6 space-y-0.5 border-l border-neutral-800 pl-2"
														transition:slide={{ duration: 150 }}
													>
														{#each album.disks as disk}
															{#if hasMultipleDisks}
																<div class="px-2 py-1 text-xs font-medium text-neutral-500">
																	{disk.name}
																</div>
															{/if}
															{#each disk.tracks as track}
																<div
																	class="group/track flex items-center gap-2 rounded-lg px-2 py-1 text-sm text-neutral-400 transition-colors hover:bg-neutral-800/50"
																>
																	<svg
																		class="h-3.5 w-3.5 flex-shrink-0 text-neutral-600"
																		fill="currentColor"
																		viewBox="0 0 24 24"
																	>
																		<path
																			d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"
																		/>
																	</svg>
																	<span class="flex-1 truncate"
																		>{track.name.replace(/\.(flac|m4a|mp3|wav|ogg)$/i, '')}</span
																	>
																	{#if onTrackMetadataClick}
																		<button
																			onclick={() => onTrackMetadataClick?.(track.path)}
																			class="invisible rounded p-1 text-neutral-500 group-hover/track:visible hover:bg-neutral-700 hover:text-blue-400"
																			title="View metadata"
																		>
																			<svg
																				class="h-3.5 w-3.5"
																				fill="none"
																				stroke="currentColor"
																				viewBox="0 0 24 24"
																			>
																				<path
																					stroke-linecap="round"
																					stroke-linejoin="round"
																					stroke-width="2"
																					d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
																				/>
																			</svg>
																		</button>
																	{/if}
																	<span
																		class="rounded px-1.5 py-0.5 text-[10px] font-medium {track.format ===
																		'FLAC'
																			? 'bg-green-900/50 text-green-400'
																			: track.format === 'AAC'
																				? 'bg-orange-900/50 text-orange-400'
																				: track.format === 'MP3'
																					? 'bg-purple-900/50 text-purple-400'
																					: 'bg-neutral-800 text-neutral-400'}"
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
	{/if}
</div>
