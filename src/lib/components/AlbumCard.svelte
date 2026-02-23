<script lang="ts">
	import type { Album, Quality } from '$lib/types';
	import { formatDuration, getCoverUrl } from '$lib/types';
	import { libraryIndex } from '$lib/stores/libraryIndex';
	import DownloadButton from './DownloadButton.svelte';

	interface Props {
		album: Album;
		onArtistClick?: (artistId: number, artistName: string) => void;
		onAlbumClick?: (albumId: number, albumTitle: string) => void;
		onDownload?: (album: Album, quality: Quality) => void;
		downloading?: boolean;
	}

	let { album, onArtistClick, onAlbumClick, onDownload, downloading = false }: Props = $props();

	// Subscribe to library index for reactivity
	const libraryState = $derived($libraryIndex);

	const coverUrl = $derived(getCoverUrl(album.cover, 640));
	const artistName = $derived(
		album.artists?.map((a) => a.name).join(', ') || album.artist?.name || 'Unknown Artist'
	);
	const year = $derived(album.releaseDate ? new Date(album.releaseDate).getFullYear() : null);

	// Helper to sanitize names (same as server)
	function sanitize(name: string): string {
		return name.replace(/[<>:"/\\|?*]/g, '_').trim();
	}

	// Library status for the album (reactive)
	const albumLibraryStatus = $derived.by(() => {
		const total = album.numberOfTracks || 0;
		const prefix = `${sanitize(artistName).toLowerCase()}|${sanitize(album.title).toLowerCase()}|`;

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

	function handleClick() {
		if (onAlbumClick) {
			onAlbumClick(album.id, album.title);
		}
	}

	function handleArtistClick(e: Event) {
		e.stopPropagation();
		if (onArtistClick) {
			const artist = album.artist || album.artists?.[0];
			if (artist) {
				onArtistClick(artist.id, artist.name);
			}
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			handleClick();
		}
	}

	function handleDownload(quality: Quality) {
		if (onDownload) {
			onDownload(album, quality);
		}
	}
</script>

<div
	role="button"
	tabindex="0"
	onclick={handleClick}
	onkeydown={handleKeydown}
	class="group flex cursor-pointer items-center gap-3 rounded-lg p-2 transition-colors hover:bg-neutral-800/70"
>
	<!-- Cover Art -->
	<div class="relative h-12 w-12 flex-shrink-0 overflow-hidden rounded bg-neutral-800">
		{#if coverUrl}
			<img src={coverUrl} alt={album.title} class="h-full w-full object-cover" />
		{/if}
		{#if albumLibraryStatus.complete}
			<div class="absolute inset-0 flex items-center justify-center bg-black/40">
				<svg class="h-5 w-5 text-green-500" fill="currentColor" viewBox="0 0 24 24">
					<path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
				</svg>
			</div>
		{:else if albumLibraryStatus.inLibrary > 0}
			<div
				class="absolute right-0 bottom-0 rounded-tl bg-green-600/90 px-1 py-0.5 text-[9px] font-bold text-white"
			>
				{albumLibraryStatus.inLibrary}/{albumLibraryStatus.total}
			</div>
		{/if}
	</div>

	<!-- Album Info -->
	<div class="flex min-w-0 flex-1 flex-col justify-center">
		<div class="flex items-center gap-2">
			<span class="truncate font-medium text-white">{album.title}</span>
			{#if album.explicit}
				<span
					class="flex-shrink-0 rounded bg-neutral-700 px-1 py-0.5 text-[10px] font-medium text-neutral-400"
					>E</span
				>
			{/if}
		</div>
		<div class="flex items-center gap-1 text-sm text-neutral-400">
			{#if onArtistClick}
				<button
					type="button"
					onclick={handleArtistClick}
					class="truncate hover:text-white hover:underline"
				>
					{artistName}
				</button>
			{:else}
				<span class="truncate">{artistName}</span>
			{/if}
			{#if year}
				<span class="flex-shrink-0 text-neutral-600">&middot;</span>
				<span class="flex-shrink-0">{year}</span>
			{/if}
			{#if album.numberOfTracks}
				<span class="flex-shrink-0 text-neutral-600">&middot;</span>
				<span class="flex-shrink-0">{album.numberOfTracks} tracks</span>
			{/if}
		</div>
	</div>

	<!-- Download Button or Arrow -->
	{#if onDownload}
		<div
			class="flex items-center"
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}
		>
			<DownloadButton onDownload={handleDownload} {downloading} size="sm" />
		</div>
	{/if}

	<!-- Arrow indicator (always visible) -->
	<svg
		class="h-4 w-4 flex-shrink-0 text-neutral-600 transition-colors group-hover:text-neutral-400"
		fill="none"
		stroke="currentColor"
		viewBox="0 0 24 24"
	>
		<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
	</svg>
</div>
