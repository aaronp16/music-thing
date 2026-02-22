<script lang="ts">
	import type { Track, Quality } from '$lib/types';
	import { formatDuration, getCoverUrl } from '$lib/types';
	import { libraryIndex } from '$lib/stores/libraryIndex';
	import DownloadButton from './DownloadButton.svelte';

	interface Props {
		track: Track;
		onDownload: (track: Track, quality: Quality) => void;
		downloading?: boolean;
		onArtistClick?: (artistId: number, artistName: string) => void;
		onAlbumClick?: (albumId: number, albumTitle: string) => void;
	}

	let { track, onDownload, downloading = false, onArtistClick, onAlbumClick }: Props = $props();

	// Subscribe to library index for reactivity
	const libraryState = $derived($libraryIndex);

	const coverUrl = $derived(getCoverUrl(track.album.cover, 640));
	const duration = $derived(formatDuration(track.duration));
	const artistName = $derived(track.artists?.map((a) => a.name).join(', ') || track.artist.name);
	
	function sanitize(name: string): string {
		return name.replace(/[<>:"/\\|?*]/g, '_').trim();
	}
	
	// Check if track is in library (reactive)
	// Key format: artist|album|disk|trackname
	// For single-disk albums, disk is 0. For multi-disk, use volumeNumber.
	const inLibrary = $derived.by(() => {
		const albumVolumes = track.album.numberOfVolumes || 1;
		const diskNum = albumVolumes > 1 ? (track.volumeNumber || 1) : 0;
		const key = `${sanitize(artistName).toLowerCase()}|${sanitize(track.album.title).toLowerCase()}|${diskNum}|${sanitize(track.title).toLowerCase()}`;
		return libraryState.tracks.has(key);
	});

	function handleDownload(quality: Quality) {
		onDownload(track, quality);
	}

	function handleArtistClick(e: Event) {
		e.stopPropagation();
		if (onArtistClick) {
			// Use primary artist for navigation
			const artist = track.artist;
			onArtistClick(artist.id, artist.name);
		}
	}

	function handleAlbumClick(e: Event) {
		e.stopPropagation();
		if (onAlbumClick) {
			onAlbumClick(track.album.id, track.album.title);
		}
	}
</script>

<div
	class="flex gap-4 rounded-lg bg-neutral-800 p-3 transition-colors hover:bg-neutral-750"
>
	<!-- Cover Art -->
	<div class="h-16 w-16 flex-shrink-0 overflow-hidden rounded-md bg-neutral-700">
		{#if coverUrl}
			<img src={coverUrl} alt={track.album.title} class="h-full w-full object-cover" />
		{/if}
	</div>

	<!-- Track Info -->
	<div class="flex min-w-0 flex-1 flex-col justify-center">
		<div class="flex items-center gap-2">
			<span class="truncate font-medium text-white">{track.title}</span>
			{#if track.explicit}
				<span
					class="flex-shrink-0 rounded bg-neutral-600 px-1.5 py-0.5 text-xs font-medium text-neutral-300"
					>E</span
				>
			{/if}
			{#if inLibrary}
				<span class="flex-shrink-0 rounded bg-green-900 px-1.5 py-0.5 text-xs font-medium text-green-300">
					In Library
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
		<div class="flex items-center gap-1 text-sm text-neutral-500">
			{#if onAlbumClick}
				<button
					type="button"
					onclick={handleAlbumClick}
					class="truncate text-left transition-colors hover:text-blue-400 hover:underline"
				>
					{track.album.title}
				</button>
			{:else}
				<span class="truncate">{track.album.title}</span>
			{/if}
			<span class="flex-shrink-0">&middot; {duration}</span>
		</div>
	</div>

	<!-- Download Button -->
	<div class="flex items-center">
		<DownloadButton onDownload={handleDownload} {downloading} />
	</div>
</div>
