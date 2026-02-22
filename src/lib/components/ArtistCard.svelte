<script lang="ts">
	import type { Artist } from '$lib/types';

	interface Props {
		artist: Artist;
		onArtistClick?: (artistId: number, artistName: string) => void;
	}

	let { artist, onArtistClick }: Props = $props();

	// Get artist picture URL
	// Note: Artist images only support specific sizes (160, 320, 480, 750) - not 640
	function getArtistPicture(picture: string | undefined, size: 160 | 320 | 480 | 750 = 320): string {
		if (!picture) return '';
		const slug = picture.replace(/-/g, '/');
		return `https://resources.tidal.com/images/${slug}/${size}x${size}.jpg`;
	}

	function handleClick() {
		if (onArtistClick) {
			onArtistClick(artist.id, artist.name);
		}
	}
</script>

<button
	type="button"
	onclick={handleClick}
	class="group flex w-full items-center gap-4 rounded-lg bg-neutral-800 p-3 text-left transition-colors hover:bg-neutral-750"
>
	<!-- Artist Photo -->
	<div class="h-16 w-16 flex-shrink-0 overflow-hidden rounded-full bg-neutral-700">
		{#if artist.picture}
			<img
				src={getArtistPicture(artist.picture)}
				alt={artist.name}
				class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-110"
			/>
		{:else}
			<div class="flex h-full w-full items-center justify-center">
				<svg class="h-8 w-8 text-neutral-600" fill="currentColor" viewBox="0 0 24 24">
					<path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
				</svg>
			</div>
		{/if}
	</div>

	<!-- Artist Info -->
	<div class="flex min-w-0 flex-1 flex-col justify-center">
		<span class="truncate font-medium text-white group-hover:text-blue-400">{artist.name}</span>
		<span class="text-sm text-neutral-500">Artist</span>
	</div>

	<!-- Arrow indicator -->
	<div class="flex-shrink-0 text-neutral-600 transition-colors group-hover:text-neutral-400">
		<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
		</svg>
	</div>
</button>
