<script lang="ts">
	import { downloadItems, downloads, hasActiveDownloads } from '$lib/stores/downloads';
	import type { DownloadItem } from '$lib/stores/downloads';

	function formatBytes(bytes: number): string {
		if (bytes === 0) return '0 B';
		const k = 1024;
		const sizes = ['B', 'KB', 'MB', 'GB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
	}

	function getStatusColor(status: DownloadItem['status']): string {
		switch (status) {
			case 'downloading':
				return 'bg-blue-500';
			case 'complete':
				return 'bg-green-500';
			case 'error':
				return 'bg-red-500';
			case 'skipped':
				return 'bg-yellow-500';
			default:
				return 'bg-neutral-500';
		}
	}

	function getStatusText(item: DownloadItem): string {
		switch (item.status) {
			case 'pending':
				return 'Waiting...';
			case 'downloading':
				return `${item.progress}% (${formatBytes(item.bytesDownloaded)} / ${formatBytes(item.totalBytes)})`;
			case 'complete':
				return 'Complete';
			case 'error':
				return item.error || 'Error';
			case 'skipped':
				return 'Already exists';
			default:
				return '';
		}
	}
</script>

{#if $downloadItems.length > 0}
	<div class="border-t border-neutral-800 bg-neutral-900 p-4">
		<div class="mb-3 flex items-center justify-between">
			<h3 class="font-semibold text-white">Downloads</h3>
			{#if !$hasActiveDownloads}
				<button
					onclick={() => downloads.clearCompleted()}
					class="text-sm text-neutral-400 transition-colors hover:text-white"
				>
					Clear all
				</button>
			{/if}
		</div>

		<div class="flex max-h-48 flex-col gap-2 overflow-y-auto">
			{#each $downloadItems as item (item.id)}
				<div class="rounded-lg bg-neutral-800 p-3">
					<div class="mb-1 flex items-center justify-between">
						<div class="min-w-0 flex-1">
							<div class="truncate text-sm font-medium text-white">
								{item.trackTitle}
							</div>
							<div class="truncate text-xs text-neutral-400">
								{item.artistName} - {item.albumTitle}
							</div>
						</div>
						<div class="ml-3 flex-shrink-0 text-xs text-neutral-400">
							{getStatusText(item)}
						</div>
					</div>

					<!-- Progress bar -->
					<div class="h-1.5 overflow-hidden rounded-full bg-neutral-700">
						<div
							class="h-full transition-all duration-300 {getStatusColor(item.status)}"
							style="width: {item.progress}%"
						></div>
					</div>
				</div>
			{/each}
		</div>
	</div>
{/if}
