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

	const resultCount = $derived(
		type === 'tracks' ? tracks.length : 
		type === 'albums' ? albums.length : 
		artists.length
	);

	const typeLabel = $derived(
		type === 'tracks' ? 'Tracks' : 
		type === 'albums' ? 'Albums' : 
		'Artists'
	);

	// Stagger delay per item, capped at 15 items to avoid too long delays
	function getStaggerDelay(index: number): string {
		const delay = Math.min(index, 15) * 30;
		return `${delay}ms`;
	}
</script>

<div class="flex flex-col gap-4">
	{#if isEmpty}
		<div class="flex flex-col items-center justify-center py-16 text-center">
			<svg class="mb-4 h-16 w-16 text-neutral-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
			</svg>
			<p class="text-lg font-medium text-neutral-400">No results found</p>
			<p class="mt-1 text-sm text-neutral-500">Try a different search term</p>
		</div>
	{:else}
		<!-- Results header -->
		<div class="flex items-center justify-between animate-fade-in">
			<h2 class="text-lg font-semibold text-white">{typeLabel}</h2>
			<span class="text-sm text-neutral-500">{resultCount} results</span>
		</div>

		<!-- Results list -->
		<div class="flex flex-col gap-1.5">
			{#if type === 'tracks'}
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
	{/if}
</div>
