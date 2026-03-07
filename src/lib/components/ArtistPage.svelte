<script lang="ts">
	import type { ArtistPageData, Album, Track, Quality, Artist } from '$lib/types';
	import { formatDuration, getCoverUrl } from '$lib/types';
	import { navigation } from '$lib/stores/navigation';
	import { libraryIndex } from '$lib/stores/libraryIndex';
	import { toasts } from '$lib/stores/toasts';
	import { downloads, downloadingTrackIds, downloadingAlbumIds } from '$lib/stores/downloads';
	import DownloadButton from './DownloadButton.svelte';

	interface Props {
		artistId: number;
		artistName: string;
	}

	let { artistId, artistName }: Props = $props();

	let data = $state<ArtistPageData | null>(null);
	let loading = $state(true);
	let error = $state<string | null>(null);

	// Subscribe to library index
	const libraryState = $derived($libraryIndex);

	$effect(() => {
		loadArtist(artistId);
	});

	async function loadArtist(id: number) {
		loading = true;
		error = null;

		try {
			const response = await fetch(`/api/artist?id=${id}`);
			if (!response.ok) {
				const errorData = await response.json().catch(() => ({}));
				throw new Error(errorData.error || 'Failed to load artist');
			}
			data = await response.json();
		} catch (e) {
			const message = e instanceof Error ? e.message : 'Failed to load artist';
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

	// Get artist picture URL
	// Note: Artist images only support specific sizes (160, 320, 480, 750) - not 640
	function getArtistPicture(
		artist: { picture?: string },
		size: 160 | 320 | 480 | 750 = 750
	): string {
		if (!artist.picture) return '';
		const slug = artist.picture.replace(/-/g, '/');
		return `https://resources.tidal.com/images/${slug}/${size}x${size}.jpg`;
	}

	// Format track artists, showing main artists and featured artists
	// If current artist is not the primary artist, show who it's by
	function formatTrackArtists(track: Track): {
		primary: Artist[];
		featured: Artist[];
		isFeature: boolean;
	} {
		const artists = track.artists || [track.artist];

		// The API is inconsistent: sometimes featured artists have type='FEATURED',
		// sometimes they have type='MAIN' but are listed after the primary artist.
		// Primary artist is always the first one
		const primaryArtist = artists[0];

		// Get primary artists (just the first one, or all with type='MAIN' that come before any FEATURED)
		const primaryArtists = [primaryArtist];

		// Get featured artists: type='FEATURED' OR secondary MAIN artists
		const featuredArtists = artists
			.slice(1)
			.filter((a, index) => a.type === 'FEATURED' || a.type === 'MAIN');

		// Check if current viewing artist is featured on this track
		const isFeature = primaryArtist && primaryArtist.id !== artistId;

		return {
			primary: primaryArtists,
			featured: featuredArtists,
			isFeature
		};
	}

	// Deduplicate albums by title (keeps first occurrence, which is usually the most recent/relevant)
	function dedupeByTitle<T extends { title: string }>(items: T[]): T[] {
		const seen = new Set<string>();
		return items.filter((item) => {
			const key = item.title.toLowerCase();
			if (seen.has(key)) return false;
			seen.add(key);
			return true;
		});
	}

	// Split albums and singles (deduplicated)
	const albums = $derived(dedupeByTitle(data?.albums.filter((a) => a.type !== 'SINGLE') || []));
	const singles = $derived(dedupeByTitle(data?.albums.filter((a) => a.type === 'SINGLE') || []));

	// Helper to sanitize names for library lookup
	function sanitize(name: string): string {
		return name
			.replace(/:/g, ' -')
			.replace(/[<>"/\\|?*]/g, '_')
			.trim();
	}

	// Check if a track is in library
	function isTrackInLibrary(track: Track): boolean {
		const artistNames = track.artists?.map((a) => a.name).join(', ') || track.artist.name;
		const albumVolumes = track.album.numberOfVolumes || 1;
		const diskNum = albumVolumes > 1 ? track.volumeNumber || 1 : 0;
		const key = `${sanitize(artistNames).toLowerCase()}|${sanitize(track.album.title).toLowerCase()}|${diskNum}|${sanitize(track.title).toLowerCase()}`;
		return libraryState.tracks.has(key);
	}

	// Check album library status
	function getAlbumLibraryStatus(album: Album) {
		const total = album.numberOfTracks || 0;
		const prefix = `${sanitize(data?.artist.name || '').toLowerCase()}|${sanitize(album.title).toLowerCase()}|`;

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
	}

	// Download handlers
	async function handleDownloadTrack(track: Track, quality: Quality) {
		try {
			await downloads.startDownload('track', track.id, track, quality);
		} catch (e) {
			const message = e instanceof Error ? e.message : 'Failed to start download';
			toasts.error(message);
		}
	}

	const downloadingIds = $derived(new Set([...$downloadingTrackIds, ...$downloadingAlbumIds]));
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
			<!-- Loading skeleton for hero -->
			<div class="relative h-64 animate-pulse bg-neutral-800">
				<div class="absolute inset-0 bg-gradient-to-t from-neutral-900 to-transparent"></div>
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
					onclick={() => loadArtist(artistId)}
					class="mt-3 rounded bg-red-800 px-3 py-1.5 text-sm font-medium hover:bg-red-700"
				>
					Retry
				</button>
			</div>
		</div>
	{:else if data}
		<div class="flex-1 overflow-y-auto pb-20 md:pb-0">
			<!-- Header section - artist info with circular image -->
			<div class="p-4 sm:p-6 md:px-6 md:py-8">
				<div class="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:gap-6 md:gap-8">
					<!-- Artist image - circular -->
					{#if data.cover?.['750'] || data.artist.picture}
						<div
							class="animate-fade-in relative h-32 w-32 flex-shrink-0 overflow-hidden rounded-full shadow-2xl ring-2 ring-neutral-800 sm:h-40 sm:w-40 sm:ring-4 md:h-48 md:w-48"
						>
							<img
								src={data.cover?.['750'] || getArtistPicture(data.artist)}
								alt={data.artist.name}
								class="h-full w-full object-cover"
							/>
						</div>
					{:else}
						<div
							class="flex h-32 w-32 flex-shrink-0 items-center justify-center rounded-full bg-neutral-800 ring-2 ring-neutral-700 sm:h-40 sm:w-40 sm:ring-4 md:h-48 md:w-48"
						>
							<svg
								class="h-12 w-12 text-neutral-600 sm:h-16 sm:w-16 md:h-20 md:w-20"
								fill="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"
								/>
							</svg>
						</div>
					{/if}

					<!-- Artist info -->
					<div
						class="animate-fade-in flex flex-col gap-2 text-center sm:gap-3 sm:text-left"
						style="animation-delay: 100ms"
					>
						<span class="text-xs font-medium tracking-wider text-neutral-400 uppercase sm:text-sm"
							>Artist</span
						>
						<h1 class="text-2xl font-bold text-white sm:text-3xl md:text-4xl lg:text-5xl">
							{data.artist.name}
						</h1>
						<div
							class="flex items-center justify-center gap-2 text-sm text-neutral-400 sm:justify-start sm:gap-3 sm:text-base"
						>
							{#if albums.length > 0}
								<span>{albums.length} {albums.length === 1 ? 'album' : 'albums'}</span>
							{/if}
							{#if singles.length > 0}
								<span class="text-neutral-600">&middot;</span>
								<span>{singles.length} {singles.length === 1 ? 'single' : 'singles'}</span>
							{/if}
						</div>
					</div>
				</div>
			</div>

			<!-- Content sections -->
			<div class="space-y-6 px-4 pb-4 sm:space-y-8 sm:px-6 sm:pb-8">
				<!-- Top Tracks -->
				{#if data.topTracks.length > 0}
					<section class="animate-fade-in" style="animation-delay: 200ms">
						<h2 class="mb-4 text-lg font-semibold text-white">Popular</h2>
						<div class="space-y-1">
							{#each data.topTracks.slice(0, 5) as track, i (track.id)}
								{@const artistInfo = formatTrackArtists(track)}
								<div
									class="group animate-fade-in flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-neutral-800/50"
									style="animation-delay: {250 + i * 50}ms"
								>
									<!-- Track number / Play indicator -->
									<div
										class="flex h-8 w-8 flex-shrink-0 items-center justify-center text-neutral-500"
									>
										<span class="group-hover:hidden">{i + 1}</span>
										<svg
											class="hidden h-4 w-4 text-white group-hover:block"
											fill="currentColor"
											viewBox="0 0 24 24"
										>
											<path d="M8 5v14l11-7z" />
										</svg>
									</div>

									<!-- Cover art -->
									<div class="h-10 w-10 flex-shrink-0 overflow-hidden rounded bg-neutral-700">
										{#if track.album.cover}
											<img
												src={getCoverUrl(track.album.cover, 80)}
												alt={track.album.title}
												class="h-full w-full object-cover"
											/>
										{/if}
									</div>

									<!-- Track info -->
									<div class="flex min-w-0 flex-1 flex-col">
										<div class="flex items-center gap-2">
											<span class="truncate font-medium text-white">{track.title}</span>
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
										<div class="flex items-center gap-1 truncate text-sm text-neutral-400">
											<button
												type="button"
												onclick={() => goToAlbum(track.album)}
												class="truncate hover:text-white hover:underline"
												>{track.album.title}</button
											>
											{#if artistInfo.primary.length > 0 || artistInfo.featured.length > 0}
												<span class="mx-1 text-neutral-500">&middot;</span>
												{#each artistInfo.primary as artist, j}
													{#if j > 0}<span>,&nbsp;</span>{/if}
													<button
														type="button"
														onclick={() => goToArtist(artist)}
														class="hover:text-white hover:underline">{artist.name}</button
													>
												{/each}
												{#if artistInfo.featured.length > 0}
													<span class="ml-1 text-neutral-500">ft.</span>
													{#each artistInfo.featured as artist, j}
														{#if j > 0}<span>,&nbsp;</span>{/if}
														<button
															type="button"
															onclick={() => goToArtist(artist)}
															class="hover:text-white hover:underline">{artist.name}</button
														>
													{/each}
												{/if}
											{/if}
										</div>
									</div>

									<!-- Duration -->
									<span class="flex-shrink-0 text-sm text-neutral-500"
										>{formatDuration(track.duration)}</span
									>

									<!-- Download button -->
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
					</section>
				{/if}

				<!-- Albums Section -->
				{#if albums.length > 0}
					<section class="animate-fade-in" style="animation-delay: 400ms">
						<h2 class="mb-3 text-lg font-semibold text-white">Albums</h2>
						<div class="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
							{#each albums as album, i (album.id)}
								{@const status = getAlbumLibraryStatus(album)}
								<button
									type="button"
									onclick={() => goToAlbum(album)}
									class="group animate-scale-in relative overflow-hidden rounded-lg bg-neutral-800/50 text-left transition-all hover:bg-neutral-800 hover:ring-1 hover:ring-neutral-600"
									style="animation-delay: {420 + i * 20}ms; opacity: 0"
								>
									<!-- Album cover -->
									<div class="relative aspect-square overflow-hidden">
										{#if album.cover}
											<img
												src={getCoverUrl(album.cover, 640)}
												alt={album.title}
												class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
												loading="lazy"
											/>
										{:else}
											<div class="flex h-full w-full items-center justify-center bg-neutral-700">
												<svg
													class="h-8 w-8 text-neutral-600"
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
										{#if status.complete}
											<div class="absolute top-1.5 right-1.5">
												<div class="rounded-full bg-green-500 p-1 shadow-lg">
													<svg
														class="h-2.5 w-2.5 text-white"
														fill="currentColor"
														viewBox="0 0 24 24"
													>
														<path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
													</svg>
												</div>
											</div>
										{:else if status.inLibrary > 0}
											<div class="absolute top-1.5 right-1.5">
												<div
													class="rounded-full bg-green-500/80 px-1.5 py-0.5 text-[9px] font-bold text-white shadow-lg"
												>
													{status.inLibrary}/{status.total}
												</div>
											</div>
										{/if}
									</div>

									<!-- Album info -->
									<div class="p-2">
										<h3 class="truncate text-sm font-medium text-white">{album.title}</h3>
										<p class="truncate text-xs text-neutral-400">
											{#if album.releaseDate}
												{new Date(album.releaseDate).getFullYear()}
											{/if}
										</p>
									</div>
								</button>
							{/each}
						</div>
					</section>
				{/if}

				<!-- Singles Section -->
				{#if singles.length > 0}
					<section class="animate-fade-in" style="animation-delay: 450ms">
						<h2 class="mb-3 text-lg font-semibold text-white">Singles</h2>
						<div class="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
							{#each singles as album, i (album.id)}
								{@const status = getAlbumLibraryStatus(album)}
								<button
									type="button"
									onclick={() => goToAlbum(album)}
									class="group animate-scale-in relative overflow-hidden rounded-lg bg-neutral-800/50 text-left transition-all hover:bg-neutral-800 hover:ring-1 hover:ring-neutral-600"
									style="animation-delay: {470 + i * 20}ms; opacity: 0"
								>
									<!-- Album cover -->
									<div class="relative aspect-square overflow-hidden">
										{#if album.cover}
											<img
												src={getCoverUrl(album.cover, 640)}
												alt={album.title}
												class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
												loading="lazy"
											/>
										{:else}
											<div class="flex h-full w-full items-center justify-center bg-neutral-700">
												<svg
													class="h-8 w-8 text-neutral-600"
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
										{#if status.complete}
											<div class="absolute top-1.5 right-1.5">
												<div class="rounded-full bg-green-500 p-1 shadow-lg">
													<svg
														class="h-2.5 w-2.5 text-white"
														fill="currentColor"
														viewBox="0 0 24 24"
													>
														<path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
													</svg>
												</div>
											</div>
										{:else if status.inLibrary > 0}
											<div class="absolute top-1.5 right-1.5">
												<div
													class="rounded-full bg-green-500/80 px-1.5 py-0.5 text-[9px] font-bold text-white shadow-lg"
												>
													{status.inLibrary}/{status.total}
												</div>
											</div>
										{/if}
									</div>

									<!-- Album info -->
									<div class="p-2">
										<h3 class="truncate text-sm font-medium text-white">{album.title}</h3>
										<p class="truncate text-xs text-neutral-400">
											{#if album.releaseDate}
												{new Date(album.releaseDate).getFullYear()}
											{/if}
										</p>
									</div>
								</button>
							{/each}
						</div>
					</section>
				{/if}

				<!-- Similar Artists -->
				{#if data.similarArtists.length > 0}
					<section class="animate-fade-in" style="animation-delay: 500ms">
						<h2 class="mb-4 text-lg font-semibold text-white">Fans Also Like</h2>
						<div class="flex gap-6 overflow-x-auto pb-2">
							{#each data.similarArtists.slice(0, 10) as artist, i (artist.id)}
								<button
									type="button"
									onclick={() => goToArtist(artist)}
									class="group animate-fade-in flex flex-shrink-0 flex-col items-center gap-3"
									style="animation-delay: {550 + i * 40}ms; opacity: 0"
								>
									<div
										class="h-32 w-32 overflow-hidden rounded-full bg-neutral-800 ring-2 ring-transparent transition-all group-hover:ring-blue-500"
									>
										{#if artist.picture}
											<img
												src={getArtistPicture(artist, 480)}
												alt={artist.name}
												class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-110"
												loading="lazy"
											/>
										{:else}
											<div class="flex h-full w-full items-center justify-center">
												<svg
													class="h-12 w-12 text-neutral-600"
													fill="currentColor"
													viewBox="0 0 24 24"
												>
													<path
														d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"
													/>
												</svg>
											</div>
										{/if}
									</div>
									<span
										class="max-w-32 truncate text-center text-sm text-neutral-300 group-hover:text-white"
									>
										{artist.name}
									</span>
								</button>
							{/each}
						</div>
					</section>
				{/if}
			</div>
		</div>
	{/if}
</div>
