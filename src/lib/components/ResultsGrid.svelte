<script lang="ts">
	import type { Track, Album, Quality, Artist } from '$lib/types';
	import TrackCard from './TrackCard.svelte';
	import AlbumCard from './AlbumCard.svelte';
	import ArtistCard from './ArtistCard.svelte';

	type SearchType = 'tracks' | 'albums' | 'artists';

	interface Props {
		tracks?: Track[];
		albums?: Album[];
		artists?: Artist[];
		type: SearchType;
		onDownloadTrack: (track: Track, quality: Quality) => void;
		onDownloadAlbum?: (album: Album, quality: Quality) => void;
		downloadingIds?: Set<number>;
		onArtistClick?: (artistId: number, artistName: string) => void;
		onAlbumClick?: (albumId: number, albumTitle: string) => void;
	}

	let {
		tracks = [],
		albums = [],
		artists = [],
		type,
		onDownloadTrack,
		onDownloadAlbum,
		downloadingIds = new Set(),
		onArtistClick,
		onAlbumClick
	}: Props = $props();

	const isEmpty = $derived(
		type === 'tracks' ? tracks.length === 0 : 
		type === 'albums' ? albums.length === 0 : 
		artists.length === 0
	);

	// Stagger delay per item, capped at 15 items to avoid too long delays
	function getStaggerDelay(index: number): string {
		const delay = Math.min(index, 15) * 30;
		return `${delay}ms`;
	}
</script>

<div class="flex flex-col gap-2">
	{#if isEmpty}
		<div class="py-8 text-center text-neutral-500">
			No results found. Try a different search.
		</div>
	{:else if type === 'tracks'}
		{#each tracks as track, i (track.id)}
			<div class="animate-fade-in" style="animation-delay: {getStaggerDelay(i)}">
				<TrackCard
					{track}
					onDownload={onDownloadTrack}
					downloading={downloadingIds.has(track.id)}
					{onArtistClick}
					{onAlbumClick}
				/>
			</div>
		{/each}
	{:else if type === 'albums'}
		{#each albums as album, i (album.id)}
			<div class="animate-fade-in" style="animation-delay: {getStaggerDelay(i)}">
				<AlbumCard
					{album}
					{onArtistClick}
					{onAlbumClick}
					onDownload={onDownloadAlbum}
					downloading={downloadingIds.has(album.id)}
				/>
			</div>
		{/each}
	{:else if type === 'artists'}
		{#each artists as artist, i (artist.id)}
			<div class="animate-fade-in" style="animation-delay: {getStaggerDelay(i)}">
				<ArtistCard
					{artist}
					{onArtistClick}
				/>
			</div>
		{/each}
	{/if}
</div>
