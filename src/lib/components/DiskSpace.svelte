<script lang="ts">
	interface DiskStats {
		total: number;
		free: number;
		used: number;
		musicDirSize: number;
		path: string;
	}

	let stats = $state<DiskStats | null>(null);
	let loading = $state(true);

	async function fetchStats() {
		try {
			const response = await fetch('/api/stats');
			if (response.ok) {
				stats = await response.json();
			}
		} catch {
			// Silently fail - not critical
		} finally {
			loading = false;
		}
	}

	// Fetch on mount and refresh every 30 seconds
	$effect(() => {
		fetchStats();
		const interval = setInterval(fetchStats, 30000);
		return () => clearInterval(interval);
	});

	function formatBytes(bytes: number): string {
		if (bytes === 0) return '0 B';
		const k = 1024;
		const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
	}

	const usedPercent = $derived(stats !== null ? (stats.used / stats.total) * 100 : 0);
	const freeFormatted = $derived(stats !== null ? formatBytes(stats.free) : '');
	const musicSizeFormatted = $derived(stats !== null ? formatBytes(stats.musicDirSize) : '');

	// Color based on usage
	const barColor = $derived(
		usedPercent > 90 ? 'bg-red-500' : usedPercent > 75 ? 'bg-yellow-500' : 'bg-green-500'
	);
</script>

{#if stats}
	<div class="flex items-center gap-3 text-sm" title="Music: {musicSizeFormatted} | Free: {freeFormatted}">
		<!-- Disk icon -->
		<svg class="h-4 w-4 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
			<path
				stroke-linecap="round"
				stroke-linejoin="round"
				stroke-width="2"
				d="M4 7v10c0 2 1 3 3 3h10c2 0 3-1 3-3V7c0-2-1-3-3-3H7c-2 0-3 1-3 3z"
			/>
			<circle cx="12" cy="13" r="3" stroke-width="2" />
			<path stroke-linecap="round" stroke-width="2" d="M8 7h8" />
		</svg>

		<!-- Bar -->
		<div class="flex items-center gap-2">
			<div class="h-2 w-24 overflow-hidden rounded-full bg-neutral-700">
				<div
					class="h-full transition-all duration-300 {barColor}"
					style="width: {usedPercent}%"
				></div>
			</div>
			<span class="text-neutral-400">{freeFormatted} free</span>
		</div>

		<!-- Music size badge -->
		<span class="rounded bg-neutral-800 px-2 py-0.5 text-xs text-neutral-300">
			{musicSizeFormatted}
		</span>
	</div>
{:else if loading}
	<div class="h-4 w-32 animate-pulse rounded bg-neutral-800"></div>
{/if}
