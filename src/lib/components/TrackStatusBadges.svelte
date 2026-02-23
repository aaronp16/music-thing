<script lang="ts">
	interface Props {
		trackPath: string;
		onMetadataClick?: () => void;
		onLyricsClick?: () => void;
	}

	let { trackPath, onMetadataClick, onLyricsClick }: Props = $props();

	let hasMetadata = $state(false);
	let hasLyrics = $state(false);
	let checking = $state(false);

	// Check track status on mount and when trackPath changes
	$effect(() => {
		if (trackPath) {
			checkTrackStatus();
		}
	});

	async function checkTrackStatus() {
		checking = true;
		try {
			const response = await fetch(`/api/track/metadata?path=${encodeURIComponent(trackPath)}`);
			if (!response.ok) {
				hasMetadata = false;
				hasLyrics = false;
				return;
			}

			const metadata = await response.json();

			// Has enriched metadata if sidecar JSON exists with enrichedAt field
			hasMetadata = !!(metadata.sidecar && metadata.sidecar.enrichedAt);

			// Has lyrics if embedded lyrics or sidecar lyrics files exist
			hasLyrics = !!(
				metadata.embedded?.lyrics ||
				metadata.embedded?.syncedLyrics ||
				metadata.lyrics?.plain ||
				metadata.lyrics?.synced
			);
		} catch (err) {
			console.error('Failed to check track status:', err);
			hasMetadata = false;
			hasLyrics = false;
		} finally {
			checking = false;
		}
	}
</script>

{#if !checking}
	<div class="flex items-center gap-1">
		<!-- Lyrics Badge -->
		<button
			onclick={onLyricsClick}
			class="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors {hasLyrics
				? 'bg-purple-900/50 text-purple-400 hover:bg-purple-900/70'
				: 'bg-neutral-800 text-neutral-500 hover:bg-neutral-700'}"
			title={hasLyrics ? 'Has lyrics' : 'No lyrics'}
		>
			{#if hasLyrics}
				<svg class="h-2.5 w-2.5" fill="currentColor" viewBox="0 0 20 20">
					<path
						fill-rule="evenodd"
						d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
						clip-rule="evenodd"
					/>
				</svg>
			{:else}
				<svg class="h-2.5 w-2.5" fill="currentColor" viewBox="0 0 20 20">
					<path
						fill-rule="evenodd"
						d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
						clip-rule="evenodd"
					/>
				</svg>
			{/if}
			<span>L</span>
		</button>

		<!-- Metadata Badge -->
		<button
			onclick={onMetadataClick}
			class="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors {hasMetadata
				? 'bg-blue-900/50 text-blue-400 hover:bg-blue-900/70'
				: 'bg-neutral-800 text-neutral-500 hover:bg-neutral-700'}"
			title={hasMetadata ? 'Has enriched metadata' : 'No enriched metadata'}
		>
			{#if hasMetadata}
				<svg class="h-2.5 w-2.5" fill="currentColor" viewBox="0 0 20 20">
					<path
						fill-rule="evenodd"
						d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
						clip-rule="evenodd"
					/>
				</svg>
			{:else}
				<svg class="h-2.5 w-2.5" fill="currentColor" viewBox="0 0 20 20">
					<path
						fill-rule="evenodd"
						d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
						clip-rule="evenodd"
					/>
				</svg>
			{/if}
			<span>M</span>
		</button>
	</div>
{/if}
