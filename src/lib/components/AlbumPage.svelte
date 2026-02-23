<script lang="ts">
	import type { Album, Track, Quality, Artist } from '$lib/types';
	import { formatDuration, getCoverUrl } from '$lib/types';
	import { navigation } from '$lib/stores/navigation';
	import { libraryIndex } from '$lib/stores/libraryIndex';
	import { toasts } from '$lib/stores/toasts';
	import { downloads, downloadingTrackIds, downloadingAlbumIds } from '$lib/stores/downloads';
	import DownloadButton from './DownloadButton.svelte';

	interface Props {
		albumId: number;
		albumTitle: string;
	}

	let { albumId, albumTitle }: Props = $props();

	// Album data from API
	interface AlbumData extends Album {
		tracks: Track[];
		artistAlbums?: Album[];
		similarAlbums?: Album[];
	}

	let data = $state<AlbumData | null>(null);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let selectedTrackIds = $state<Set<number>>(new Set());

	// Subscribe to library index
	const libraryState = $derived($libraryIndex);

	// Get artists array (data.artists or fallback to [data.artist] if available)
	const artists = $derived(data?.artists || (data?.artist ? [data.artist] : []));

	$effect(() => {
		loadAlbum(albumId);
	});

	async function loadAlbum(id: number) {
		loading = true;
		error = null;
		selectedTrackIds = new Set();

		try {
			const response = await fetch(`/api/album?id=${id}`);
			if (!response.ok) {
				const errorData = await response.json().catch(() => ({}));
				throw new Error(errorData.error || 'Failed to load album');
			}
			data = await response.json();
			// Select all tracks by default
			if (data?.tracks) {
				selectedTrackIds = new Set(data.tracks.map((t) => t.id));
			}
		} catch (e) {
			const message = e instanceof Error ? e.message : 'Failed to load album';
			error = message;
			toasts.error(message);
		} finally {
			loading = false;
		}
	}

	function goBack() {
		navigation.back();
	}

	function goToArtist(artist: Artist) {
		navigation.goToArtist(artist.id, artist.name);
	}

	function goToAlbum(album: Album) {
		navigation.goToAlbum(album.id, album.title);
	}

	// Computed values
	const artistName = $derived(
		data?.artists?.map((a) => a.name).join(', ') || data?.artist?.name || 'Unknown Artist'
	);
	const year = $derived(data?.releaseDate ? new Date(data.releaseDate).getFullYear() : null);
	const totalDuration = $derived(data?.tracks?.reduce((sum, t) => sum + t.duration, 0) || 0);
	const allSelected = $derived(
		data?.tracks ? data.tracks.every((t) => selectedTrackIds.has(t.id)) : false
	);
	const selectedCount = $derived(selectedTrackIds.size);
	const downloadDisabled = $derived(data?.tracks !== null && selectedTrackIds.size === 0);

	// Group tracks by disk
	const tracksByDisk = $derived.by(() => {
		if (!data?.tracks) return [];
		const disks: Map<number, Track[]> = new Map();
		for (const track of data.tracks) {
			const disk = track.volumeNumber || 1;
			if (!disks.has(disk)) {
				disks.set(disk, []);
			}
			disks.get(disk)!.push(track);
		}
		return Array.from(disks.entries()).sort((a, b) => a[0] - b[0]);
	});

	const hasMultipleDisks = $derived(tracksByDisk.length > 1);

	// Helper to sanitize names for library lookup
	function sanitize(name: string): string {
		return name.replace(/[<>:"/\\|?*]/g, '_').trim();
	}

	// Make track key for library lookup
	function makeTrackKey(
		artist: string,
		albumTitle: string,
		diskNum: number,
		trackTitle: string
	): string {
		return `${sanitize(artist).toLowerCase()}|${sanitize(albumTitle).toLowerCase()}|${diskNum}|${sanitize(trackTitle).toLowerCase()}`;
	}

	// Check if a track is in library
	function isTrackInLibrary(track: Track): boolean {
		const albumVolumes = data?.numberOfVolumes || 1;
		const diskNum = albumVolumes > 1 ? track.volumeNumber || 1 : 0;
		const key = makeTrackKey(artistName, data?.title || '', diskNum, track.title);
		return libraryState.tracks.has(key);
	}

	// Album library status
	const albumLibraryStatus = $derived.by(() => {
		if (!data) return { inLibrary: 0, total: 0, complete: false };
		const total = data.numberOfTracks || data.tracks?.length || 0;
		const prefix = `${sanitize(artistName).toLowerCase()}|${sanitize(data.title).toLowerCase()}|`;

		const uniqueTracksInLibrary = new Set<string>();
		for (const key of libraryState.tracks) {
			if (key.startsWith(prefix)) {
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

	// Get featured artists for a track
	function getFeaturedArtists(track: Track): Artist[] {
		if (!track.artists || track.artists.length <= 1) return [];

		// The API is inconsistent: sometimes featured artists have type='FEATURED',
		// sometimes they have type='MAIN' but are listed after the primary artist.
		// Strategy: treat as featured if:
		// 1. Has type === 'FEATURED', OR
		// 2. Is a MAIN artist but not the first one (secondary main artist)

		return track.artists.filter(
			(a, index) => a.type === 'FEATURED' || (a.type === 'MAIN' && index > 0)
		);
	}

	// Track selection
	function toggleTrack(trackId: number) {
		if (selectedTrackIds.has(trackId)) {
			selectedTrackIds.delete(trackId);
		} else {
			selectedTrackIds.add(trackId);
		}
		selectedTrackIds = new Set(selectedTrackIds);
	}

	function toggleDisk(diskTracks: Track[]) {
		const allInDiskSelected = diskTracks.every((t) => selectedTrackIds.has(t.id));
		if (allInDiskSelected) {
			for (const t of diskTracks) {
				selectedTrackIds.delete(t.id);
			}
		} else {
			for (const t of diskTracks) {
				selectedTrackIds.add(t.id);
			}
		}
		selectedTrackIds = new Set(selectedTrackIds);
	}

	function isDiskFullySelected(diskTracks: Track[]): boolean {
		return diskTracks.every((t) => selectedTrackIds.has(t.id));
	}

	function toggleAll() {
		if (allSelected) {
			selectedTrackIds = new Set();
		} else if (data?.tracks) {
			selectedTrackIds = new Set(data.tracks.map((t) => t.id));
		}
	}

	// Download handlers
	const downloadingIds = $derived(new Set([...$downloadingTrackIds, ...$downloadingAlbumIds]));

	async function handleDownload(quality: Quality) {
		if (!data) return;
		try {
			const ids =
				selectedTrackIds.size > 0 && selectedTrackIds.size < (data.tracks?.length || 0)
					? Array.from(selectedTrackIds)
					: undefined;
			await downloads.startDownload('album', data.id, undefined, quality, ids);
		} catch (e) {
			const message = e instanceof Error ? e.message : 'Failed to start download';
			toasts.error(message);
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
</script>

<div class="flex h-full flex-col overflow-hidden">
	<!-- Back button header -->
	<div
		class="flex items-center gap-2 border-b border-neutral-800 px-3 py-2 sm:gap-3 sm:px-4 sm:py-3"
	>
		<button
			type="button"
			onclick={goBack}
			class="flex min-h-[44px] items-center gap-1.5 rounded-lg px-2 py-1.5 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-white sm:gap-2"
		>
			<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
			</svg>
			<span class="text-sm font-medium">Back</span>
		</button>
	</div>

	{#if loading}
		<div class="flex flex-1 flex-col">
			<!-- Loading skeleton -->
			<div class="flex gap-6 p-6">
				<div class="h-48 w-48 animate-pulse rounded-lg bg-neutral-800"></div>
				<div class="flex flex-col gap-3">
					<div class="h-4 w-16 animate-pulse rounded bg-neutral-800"></div>
					<div class="h-10 w-64 animate-pulse rounded bg-neutral-800"></div>
					<div class="h-5 w-32 animate-pulse rounded bg-neutral-800"></div>
				</div>
			</div>
			<div class="flex flex-1 items-center justify-center">
				<svg class="h-8 w-8 animate-spin text-blue-500" viewBox="0 0 24 24" fill="none">
					<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"
					></circle>
					<path
						class="opacity-75"
						fill="currentColor"
						d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
					></path>
				</svg>
			</div>
		</div>
	{:else if error}
		<div class="flex flex-1 items-center justify-center p-4">
			<div class="rounded-lg bg-red-900/50 p-4 text-center text-red-200">
				<p>{error}</p>
				<button
					type="button"
					onclick={() => loadAlbum(albumId)}
					class="mt-3 rounded bg-red-800 px-3 py-1.5 text-sm font-medium hover:bg-red-700"
				>
					Retry
				</button>
			</div>
		</div>
	{:else if data}
		<div class="flex-1 overflow-y-auto pb-20 md:pb-0">
			<!-- Album header -->
			<div class="p-4 sm:p-6 md:px-6 md:py-8">
				<div
					class="animate-fade-in flex flex-col items-center gap-4 sm:flex-row sm:items-end sm:gap-4 md:gap-6"
				>
					<!-- Album cover -->
					<div
						class="relative h-32 w-32 flex-shrink-0 overflow-hidden rounded-lg shadow-2xl sm:h-40 sm:w-40 md:h-48 md:w-48"
					>
						{#if data.cover}
							<img
								src={getCoverUrl(data.cover, 640)}
								alt={data.title}
								class="h-full w-full object-cover"
							/>
						{:else}
							<div class="flex h-full w-full items-center justify-center bg-neutral-800">
								<svg
									class="h-12 w-12 text-neutral-600 sm:h-14 sm:w-14 md:h-16 md:w-16"
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
						<!-- Library status badge -->
						{#if albumLibraryStatus.complete}
							<div class="absolute top-1.5 right-1.5 sm:top-2 sm:right-2">
								<div class="rounded-full bg-green-500 p-1 shadow-lg sm:p-1.5">
									<svg
										class="h-2.5 w-2.5 text-white sm:h-3 sm:w-3"
										fill="currentColor"
										viewBox="0 0 24 24"
									>
										<path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
									</svg>
								</div>
							</div>
						{:else if albumLibraryStatus.inLibrary > 0}
							<div class="absolute top-1.5 right-1.5 sm:top-2 sm:right-2">
								<div
									class="rounded-full bg-green-500/80 px-1.5 py-0.5 text-[10px] font-bold text-white shadow-lg sm:px-2 sm:py-1 sm:text-xs"
								>
									{albumLibraryStatus.inLibrary}/{albumLibraryStatus.total}
								</div>
							</div>
						{/if}
					</div>

					<!-- Album info -->
					<div
						class="animate-fade-in flex flex-col gap-1.5 text-center sm:gap-2 sm:text-left"
						style="animation-delay: 100ms"
					>
						<span class="text-xs font-medium tracking-wider text-neutral-400 uppercase sm:text-sm">
							{data.type === 'SINGLE' ? 'Single' : 'Album'}
						</span>
						<h1 class="text-2xl font-bold text-white sm:text-3xl md:text-4xl">{data.title}</h1>

						<!-- Artist (clickable) -->
						<div
							class="flex flex-wrap items-center justify-center gap-1 text-sm text-neutral-300 sm:justify-start sm:text-base"
						>
							{#each artists as artist, i}
								{#if i > 0}<span class="text-neutral-500">,&nbsp;</span>{/if}
								<button
									type="button"
									onclick={() => goToArtist(artist)}
									class="flex min-h-[44px] items-center font-medium hover:text-white hover:underline sm:min-h-0"
								>
									{artist.name}
								</button>
							{/each}
						</div>

						<!-- Meta info -->
						<div
							class="flex flex-wrap items-center justify-center gap-1 text-xs text-neutral-400 sm:justify-start sm:gap-2 sm:text-sm"
						>
							{#if year}
								<span>{year}</span>
							{/if}
							{#if data.numberOfTracks}
								<span>&middot; {data.numberOfTracks} tracks</span>
							{/if}
							{#if totalDuration}
								<span>&middot; {formatDuration(totalDuration)}</span>
							{/if}
						</div>

						<!-- Download button -->
						<div class="mt-3 flex items-center gap-3">
							<DownloadButton
								onDownload={handleDownload}
								downloading={downloadingIds.has(data.id)}
								disabled={downloadDisabled}
							/>
							{#if selectedCount > 0 && selectedCount < (data.tracks?.length || 0)}
								<span class="text-sm text-neutral-400">{selectedCount} selected</span>
							{/if}
						</div>
					</div>
				</div>
			</div>

			<!-- Track list -->
			<div class="animate-fade-in px-4 pb-4 sm:px-6 sm:pb-8" style="animation-delay: 200ms">
				{#if data.tracks && data.tracks.length > 0}
					<div class="rounded-lg bg-neutral-800/30">
						{#if hasMultipleDisks}
							<!-- Multi-disk layout -->
							{#each tracksByDisk as [diskNum, diskTracks], diskIndex (diskNum)}
								<div class="border-b border-neutral-700/50 last:border-b-0">
									<!-- Disk header -->
									<div class="flex items-center gap-3 bg-neutral-800/50 px-4 py-2">
										<input
											type="checkbox"
											checked={isDiskFullySelected(diskTracks)}
											onchange={() => toggleDisk(diskTracks)}
											class="h-4 w-4 rounded border-neutral-600 bg-neutral-700 text-green-500 focus:ring-green-500 focus:ring-offset-0"
										/>
										<span class="text-sm font-medium text-neutral-300">Disc {diskNum}</span>
									</div>
									<!-- Disk tracks -->
									{#each diskTracks as track, i (track.id)}
										{@const featured = getFeaturedArtists(track)}
										<div
											class="group animate-fade-in flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-neutral-800/50"
											style="animation-delay: {250 + diskIndex * 100 + i * 30}ms"
										>
											<input
												type="checkbox"
												checked={selectedTrackIds.has(track.id)}
												onchange={() => toggleTrack(track.id)}
												class="h-4 w-4 rounded border-neutral-600 bg-neutral-700 text-green-500 focus:ring-green-500 focus:ring-offset-0"
											/>
											<span class="w-8 text-right text-sm text-neutral-500"
												>{track.trackNumber}</span
											>
											<div class="flex min-w-0 flex-1 flex-col">
												<div class="flex items-center gap-2">
													<span
														class="truncate {selectedTrackIds.has(track.id)
															? 'text-white'
															: 'text-neutral-400'}">{track.title}</span
													>
													{#if track.explicit}
														<span
															class="flex-shrink-0 rounded bg-neutral-600 px-1 py-0.5 text-[10px] font-medium text-neutral-300"
															>E</span
														>
													{/if}
													{#if isTrackInLibrary(track)}
														<svg
															class="h-4 w-4 flex-shrink-0 text-green-500"
															fill="currentColor"
															viewBox="0 0 24 24"
														>
															<path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
														</svg>
													{/if}
												</div>
												{#if featured.length > 0}
													<div class="flex items-center gap-1 text-sm text-neutral-500">
														<span>feat.</span>
														{#each featured as artist, j}
															{#if j > 0}<span>,</span>{/if}
															<button
																type="button"
																onclick={() => goToArtist(artist)}
																class="hover:text-white hover:underline">{artist.name}</button
															>
														{/each}
													</div>
												{/if}
											</div>
											<span class="flex-shrink-0 text-sm text-neutral-500"
												>{formatDuration(track.duration)}</span
											>
											<div>
												<DownloadButton
													onDownload={(q) => handleDownloadTrack(track, q)}
													downloading={downloadingIds.has(track.id)}
													compact
												/>
											</div>
										</div>
									{/each}
								</div>
							{/each}
						{:else}
							<!-- Single disk layout -->
							<!-- Select all header -->
							<div class="flex items-center gap-3 border-b border-neutral-700/50 px-4 py-2">
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
							</div>
							<!-- Tracks -->
							{#each data.tracks as track, i (track.id)}
								{@const featured = getFeaturedArtists(track)}
								<div
									class="group animate-fade-in flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-neutral-800/50"
									style="animation-delay: {250 + i * 30}ms"
								>
									<input
										type="checkbox"
										checked={selectedTrackIds.has(track.id)}
										onchange={() => toggleTrack(track.id)}
										class="h-4 w-4 rounded border-neutral-600 bg-neutral-700 text-green-500 focus:ring-green-500 focus:ring-offset-0"
									/>
									<span class="w-8 text-right text-sm text-neutral-500">{track.trackNumber}</span>
									<div class="flex min-w-0 flex-1 flex-col">
										<div class="flex items-center gap-2">
											<span
												class="truncate {selectedTrackIds.has(track.id)
													? 'text-white'
													: 'text-neutral-400'}">{track.title}</span
											>
											{#if track.explicit}
												<span
													class="flex-shrink-0 rounded bg-neutral-600 px-1 py-0.5 text-[10px] font-medium text-neutral-300"
													>E</span
												>
											{/if}
											{#if isTrackInLibrary(track)}
												<svg
													class="h-4 w-4 flex-shrink-0 text-green-500"
													fill="currentColor"
													viewBox="0 0 24 24"
												>
													<path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
												</svg>
											{/if}
										</div>
										{#if featured.length > 0}
											<div class="flex items-center gap-1 text-sm text-neutral-500">
												<span>feat.</span>
												{#each featured as artist, j}
													{#if j > 0}<span>,</span>{/if}
													<button
														type="button"
														onclick={() => goToArtist(artist)}
														class="hover:text-white hover:underline">{artist.name}</button
													>
												{/each}
											</div>
										{/if}
									</div>
									<span class="flex-shrink-0 text-sm text-neutral-500"
										>{formatDuration(track.duration)}</span
									>
									<div>
										<DownloadButton
											onDownload={(q) => handleDownloadTrack(track, q)}
											downloading={downloadingIds.has(track.id)}
											compact
										/>
									</div>
								</div>
							{/each}
						{/if}
					</div>
				{/if}
			</div>

			<!-- More from Artist -->
			{#if data.artistAlbums && data.artistAlbums.length > 0}
				<section class="animate-fade-in mt-10 px-6" style="animation-delay: 400ms">
					<h2 class="mb-4 text-xl font-bold">
						More from {data.artist?.name || data.artists?.[0]?.name}
					</h2>
					<div class="flex gap-4 overflow-x-auto pb-4">
						{#each data.artistAlbums as album, i (album.id)}
							<button
								type="button"
								onclick={() => goToAlbum(album)}
								class="group animate-fade-in flex w-40 flex-shrink-0 flex-col gap-2"
								style="animation-delay: {450 + i * 30}ms"
							>
								<div
									class="relative aspect-square w-full overflow-hidden rounded-md bg-neutral-800"
								>
									{#if album.cover}
										<img
											src={getCoverUrl(album.cover, 640)}
											alt={album.title}
											class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
										/>
									{/if}
									<div
										class="absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/20"
									></div>
								</div>
								<div class="flex flex-col gap-0.5 text-left">
									<span class="truncate text-sm font-medium text-white group-hover:underline"
										>{album.title}</span
									>
									<span class="text-xs text-neutral-400">
										{album.releaseDate ? new Date(album.releaseDate).getFullYear() : ''}
										{#if album.type}
											<span class="text-neutral-500">
												· {album.type === 'SINGLE' ? 'Single' : 'Album'}</span
											>
										{/if}
									</span>
								</div>
							</button>
						{/each}
					</div>
				</section>
			{/if}

			<!-- Similar Albums -->
			{#if data.similarAlbums && data.similarAlbums.length > 0}
				<section class="animate-fade-in mt-10 px-6 pb-8" style="animation-delay: 500ms">
					<h2 class="mb-4 text-xl font-bold">Similar Albums</h2>
					<div class="flex gap-4 overflow-x-auto pb-4">
						{#each data.similarAlbums as album, i (album.id)}
							<button
								type="button"
								onclick={() => goToAlbum(album)}
								class="group animate-fade-in flex w-40 flex-shrink-0 flex-col gap-2"
								style="animation-delay: {550 + i * 30}ms"
							>
								<div
									class="relative aspect-square w-full overflow-hidden rounded-md bg-neutral-800"
								>
									{#if album.cover}
										<img
											src={getCoverUrl(album.cover, 640)}
											alt={album.title}
											class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
										/>
									{/if}
									<div
										class="absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/20"
									></div>
								</div>
								<div class="flex flex-col gap-0.5 text-left">
									<span class="truncate text-sm font-medium text-white group-hover:underline"
										>{album.title}</span
									>
									<span class="truncate text-xs text-neutral-400"
										>{album.artist?.name || album.artists?.[0]?.name || ''}</span
									>
									<span class="text-xs text-neutral-500">
										{album.releaseDate ? new Date(album.releaseDate).getFullYear() : ''}
									</span>
								</div>
							</button>
						{/each}
					</div>
				</section>
			{/if}
		</div>
	{/if}
</div>
