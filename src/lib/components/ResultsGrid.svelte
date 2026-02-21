<script lang="ts">
	import type { Track, Album, Quality } from '$lib/types';
	import TrackCard from './TrackCard.svelte';
	import AlbumCard from './AlbumCard.svelte';

	type SearchType = 'tracks' | 'albums';

	interface Props {
		tracks?: Track[];
		albums?: Album[];
		type: SearchType;
		onDownloadTrack: (track: Track, quality: Quality) => void;
		onDownloadAlbum: (album: Album, quality: Quality) => void;
		downloadingIds?: Set<number>;
	}

	let {
		tracks = [],
		albums = [],
		type,
		onDownloadTrack,
		onDownloadAlbum,
		downloadingIds = new Set()
	}: Props = $props();

	const isEmpty = $derived(type === 'tracks' ? tracks.length === 0 : albums.length === 0);
</script>

<div class="flex flex-col gap-2">
	{#if isEmpty}
		<div class="py-8 text-center text-neutral-500">
			No results found. Try a different search.
		</div>
	{:else if type === 'tracks'}
		{#each tracks as track (track.id)}
			<TrackCard
				{track}
				onDownload={onDownloadTrack}
				downloading={downloadingIds.has(track.id)}
			/>
		{/each}
	{:else}
		{#each albums as album (album.id)}
			<AlbumCard
				{album}
				onDownload={onDownloadAlbum}
				downloading={downloadingIds.has(album.id)}
			/>
		{/each}
	{/if}
</div>
