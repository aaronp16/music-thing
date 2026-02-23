<script lang="ts">
	import { downloadItems } from '$lib/stores/downloads';

	interface Props {
		onClick: () => void;
	}

	let { onClick }: Props = $props();

	// Get current downloading item
	const currentDownload = $derived(
		$downloadItems.find(i => i.status === 'downloading')
	);

	// Count active/pending downloads
	const activeCount = $derived(
		$downloadItems.filter(i => i.status === 'downloading' || i.status === 'pending').length
	);

	// Total items in queue
	const totalCount = $derived($downloadItems.length);

	// Progress of current download
	const currentProgress = $derived(currentDownload?.progress || 0);

	// Calculate overall queue position (completed + current)
	const completedCount = $derived(
		$downloadItems.filter(i => i.status === 'complete' || i.status === 'skipped').length
	);
	const queuePosition = $derived(completedCount + (currentDownload ? 1 : 0));
</script>

{#if totalCount > 0}
	<button
		onclick={onClick}
		class="group relative flex items-center gap-2 rounded-full bg-neutral-800 pl-3 pr-3 py-1.5 transition-all hover:bg-neutral-750 min-w-[140px]"
		title="View downloads"
	>
		<!-- Progress background fill -->
		<div
			class="absolute inset-0 rounded-full bg-blue-500/20 transition-all duration-300"
			style="width: {currentProgress}%"
		></div>

		<!-- Content -->
		<div class="relative z-10 flex items-center gap-2 w-full">
			<!-- Download icon with spinner if active -->
			{#if activeCount > 0}
				<svg class="h-4 w-4 text-blue-400 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
				</svg>
			{:else}
				<svg class="h-4 w-4 text-green-500" fill="currentColor" viewBox="0 0 24 24">
					<path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
				</svg>
			{/if}

			<!-- Text -->
			<span class="text-xs font-medium text-white">
				{queuePosition}/{totalCount}
				{#if activeCount > 0}
					downloading
				{:else}
					complete
				{/if}
			</span>

			<!-- Chevron -->
			<svg class="h-3 w-3 text-neutral-400 group-hover:text-white transition-colors ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
			</svg>
		</div>
	</button>
{/if}
