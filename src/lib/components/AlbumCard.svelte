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
	const duration = $derived(album.duration ? formatDuration(album.duration) : null);
	const artistName = $derived(album.artists?.map((a) => a.name).join(', ') || album.artist?.name || 'Unknown Artist');
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
	class="flex w-full cursor-pointer items-center gap-4 rounded-lg bg-neutral-800 p-3 text-left transition-colors hover:bg-neutral-750"
>
	<!-- Cover Art -->
	<div class="h-16 w-16 flex-shrink-0 overflow-hidden rounded-md bg-neutral-700">
		{#if coverUrl}
			<img src={coverUrl} alt={album.title} class="h-full w-full object-cover" />
		{/if}
	</div>

	<!-- Album Info -->
	<div class="flex min-w-0 flex-1 flex-col justify-center">
		<div class="flex items-center gap-2">
			<span class="truncate font-medium text-white">{album.title}</span>
			{#if album.explicit}
				<span class="flex-shrink-0 rounded bg-neutral-600 px-1.5 py-0.5 text-xs font-medium text-neutral-300">E</span>
			{/if}
			{#if albumLibraryStatus.complete}
				<span class="flex-shrink-0 rounded bg-green-900 px-1.5 py-0.5 text-xs font-medium text-green-300">
					In Library
				</span>
			{:else if albumLibraryStatus.inLibrary > 0}
				<span class="flex-shrink-0 rounded bg-green-900/50 px-1.5 py-0.5 text-xs font-medium text-green-400">
					{albumLibraryStatus.inLibrary}/{albumLibraryStatus.total}
				</span>
			{/if}
		</div>
		{#if onArtistClick}
			<button
				type="button"
				onclick={handleArtistClick}
				class="truncate text-left text-sm text-neutral-400 transition-colors hover:text-blue-400 hover:underline"
			>
				{artistName}
			</button>
		{:else}
			<span class="truncate text-sm text-neutral-400">{artistName}</span>
		{/if}
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

	<!-- Download Button or Arrow -->
	{#if onDownload}
		<div class="flex items-center" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()}>
			<DownloadButton onDownload={handleDownload} {downloading} />
		</div>
	{:else}
		<svg
			class="h-5 w-5 flex-shrink-0 text-neutral-500"
			fill="none"
			stroke="currentColor"
			viewBox="0 0 24 24"
		>
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
		</svg>
	{/if}
</div>
