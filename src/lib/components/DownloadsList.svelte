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
				return 'bg-amber-500';
			default:
				return 'bg-neutral-600';
		}
	}
</script>

<div class="flex h-full flex-col">
	{#if $downloadItems.length > 0}
		<!-- Header -->
		<div class="mb-3 flex items-center justify-between text-xs text-neutral-500">
			<span>{$downloadItems.length} item{$downloadItems.length !== 1 ? 's' : ''}</span>
			{#if !$hasActiveDownloads}
				<button
					onclick={() => downloads.clearCompleted()}
					class="rounded-full bg-neutral-800 px-2 py-1 text-neutral-400 transition-colors hover:bg-neutral-700 hover:text-white"
				>
					Clear all
				</button>
			{/if}
		</div>

		<!-- Download items -->
		<div class="min-h-0 flex-1 space-y-1.5 overflow-y-auto">
			{#each $downloadItems as item (item.id)}
				<div 
					class="rounded-lg p-3 transition-colors {item.status === 'pending' ? 'bg-neutral-800/30' : 'bg-neutral-800/50'}"
				>
					<div class="mb-2 flex items-start justify-between gap-3">
						<div class="min-w-0 flex-1">
							<div class="truncate text-sm font-medium {item.status === 'pending' ? 'text-neutral-500' : 'text-white'}">
								{item.trackTitle}
							</div>
							<div class="truncate text-xs {item.status === 'pending' ? 'text-neutral-600' : 'text-neutral-500'}">
								{item.artistName} &middot; {item.albumTitle}
							</div>
						</div>
						<div class="flex flex-shrink-0 items-center gap-2">
							{#if item.status === 'downloading'}
								<span class="text-xs font-medium text-blue-400">{item.progress}%</span>
							{:else if item.status === 'complete'}
								<svg class="h-4 w-4 text-green-500" fill="currentColor" viewBox="0 0 24 24">
									<path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
								</svg>
							{:else if item.status === 'error'}
								<svg class="h-4 w-4 text-red-500" fill="currentColor" viewBox="0 0 24 24">
									<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
								</svg>
							{:else if item.status === 'skipped'}
								<span class="rounded bg-amber-900/50 px-1.5 py-0.5 text-[10px] font-medium text-amber-400">Exists</span>
							{:else if item.status === 'pending'}
								<span class="text-xs text-neutral-600">Waiting</span>
							{/if}
						</div>
					</div>

					<!-- Progress bar -->
					<div class="h-1 overflow-hidden rounded-full bg-neutral-700">
						<div
							class="h-full transition-all duration-300 {getStatusColor(item.status)}"
							style="width: {item.progress}%"
						></div>
					</div>
					
					{#if item.status === 'downloading' && item.totalBytes > 0}
						<div class="mt-1 text-right text-[10px] text-neutral-500">
							{formatBytes(item.bytesDownloaded)} / {formatBytes(item.totalBytes)}
						</div>
					{/if}
					
					{#if item.status === 'error' && item.error}
						<div class="mt-1 truncate text-xs text-red-400">{item.error}</div>
					{/if}
				</div>
			{/each}
		</div>
	{:else}
		<div class="flex flex-1 flex-col items-center justify-center py-12 text-center">
			<svg class="mb-3 h-12 w-12 text-neutral-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
			</svg>
			<p class="text-sm text-neutral-400">No downloads</p>
			<p class="mt-1 text-xs text-neutral-500">Downloads will appear here</p>
		</div>
	{/if}
</div>
