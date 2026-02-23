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
	const inLibrary = $derived.by(() => {
		const albumVolumes = track.album.numberOfVolumes || 1;
		const diskNum = albumVolumes > 1 ? track.volumeNumber || 1 : 0;
		const key = `${sanitize(artistName).toLowerCase()}|${sanitize(track.album.title).toLowerCase()}|${diskNum}|${sanitize(track.title).toLowerCase()}`;
		return libraryState.tracks.has(key);
	});

	function handleDownload(quality: Quality) {
		onDownload(track, quality);
	}

	function handleArtistClick(e: Event) {
		e.stopPropagation();
		if (onArtistClick) {
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

<div class="group flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-neutral-800/70">
	<!-- Cover Art -->
	<div class="h-12 w-12 flex-shrink-0 overflow-hidden rounded bg-neutral-800">
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
					class="flex-shrink-0 rounded bg-neutral-700 px-1 py-0.5 text-[10px] font-medium text-neutral-400"
					>E</span
				>
			{/if}
			{#if inLibrary}
				<svg class="h-4 w-4 flex-shrink-0 text-green-500" fill="currentColor" viewBox="0 0 24 24">
					<path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
				</svg>
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
			<span class="flex-shrink-0 text-neutral-600">&middot;</span>
			{#if onAlbumClick}
				<button
					type="button"
					onclick={handleAlbumClick}
					class="truncate hover:text-white hover:underline"
				>
					{track.album.title}
				</button>
			{:else}
				<span class="truncate">{track.album.title}</span>
			{/if}
		</div>
	</div>

	<!-- Duration -->
	<span class="flex-shrink-0 text-sm text-neutral-500">{duration}</span>

	<!-- Download Button -->
	<div class="flex items-center">
		<DownloadButton onDownload={handleDownload} {downloading} size="sm" />
	</div>
</div>
