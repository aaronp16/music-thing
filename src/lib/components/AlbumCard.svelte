<script lang="ts">
	import type { Album, Quality } from '$lib/types';
	import { formatDuration, getCoverUrl } from '$lib/types';
	import DownloadButton from './DownloadButton.svelte';

	interface Props {
		album: Album;
		onDownload: (album: Album, quality: Quality) => void;
		downloading?: boolean;
	}

	let { album, onDownload, downloading = false }: Props = $props();

	const coverUrl = $derived(getCoverUrl(album.cover, 640));
	const duration = $derived(album.duration ? formatDuration(album.duration) : null);
	const artistName = $derived(album.artists?.map((a) => a.name).join(', ') || album.artist?.name || 'Unknown Artist');
	const year = $derived(album.releaseDate ? new Date(album.releaseDate).getFullYear() : null);

	function handleDownload(quality: Quality) {
		onDownload(album, quality);
	}
</script>

<div
	class="flex gap-4 rounded-lg bg-neutral-800 p-3 transition-colors hover:bg-neutral-750"
>
	<!-- Cover Art -->
	<div class="h-20 w-20 flex-shrink-0 overflow-hidden rounded-md bg-neutral-700">
		{#if coverUrl}
			<img src={coverUrl} alt={album.title} class="h-full w-full object-cover" />
		{/if}
	</div>

	<!-- Album Info -->
	<div class="flex min-w-0 flex-1 flex-col justify-center">
		<span class="truncate font-medium text-white">{album.title}</span>
		<span class="truncate text-sm text-neutral-400">{artistName}</span>
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

	<!-- Download Button -->
	<div class="flex items-center">
		<DownloadButton onDownload={handleDownload} {downloading} />
	</div>
</div>
