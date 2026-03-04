<script lang="ts">
	import { libraryRefresh } from '$lib/stores/libraryRefresh';

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

	$effect(() => {
		fetchStats();
		const interval = setInterval(fetchStats, 30000);
		return () => clearInterval(interval);
	});

	$effect(() => {
		libraryRefresh.subscribe(() => {
			fetchStats();
		});
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
	const totalFormatted = $derived(stats !== null ? formatBytes(stats.total) : '');
	const usedFormatted = $derived(stats !== null ? formatBytes(stats.used) : '');

	// Calculate percentages for each segment
	const musicPercent = $derived(stats !== null ? (stats.musicDirSize / stats.total) * 100 : 0);
	const otherUsedPercent = $derived(
		stats !== null ? ((stats.used - stats.musicDirSize) / stats.total) * 100 : 0
	);
	const freePercent = $derived(stats !== null ? (stats.free / stats.total) * 100 : 0);
</script>

{#if stats}
	<div
		class="flex flex-col gap-1"
		title="Music Library: {musicSizeFormatted}
Disk Used: {usedFormatted} / {totalFormatted} ({usedPercent.toFixed(1)}%)
Disk Free: {freeFormatted}
Path: {stats.path}"
	>
		<!-- Compact text: music used · disk free -->
		<div class="text-[10px] text-neutral-400">
			{musicSizeFormatted} used · {freeFormatted} free
		</div>

		<!-- Multi-segment progress bar -->
		<div class="flex h-1.5 w-full overflow-hidden rounded-full bg-neutral-700">
			<!-- Music library segment (green) -->
			<div
				class="h-full bg-green-500 transition-all duration-300"
				style="width: {musicPercent}%"
			></div>
			<!-- Other used space segment (yellow/amber) -->
			<div
				class="h-full bg-amber-500 transition-all duration-300"
				style="width: {otherUsedPercent}%"
			></div>
			<!-- Free space is just the empty bg-neutral-700 background -->
		</div>
	</div>
{:else if loading}
	<div class="h-8 w-20 animate-pulse rounded bg-neutral-800"></div>
{/if}
