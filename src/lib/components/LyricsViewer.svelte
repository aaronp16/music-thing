<script lang="ts">
	interface Props {
		plainLyrics?: string;
		syncedLyrics?: string;
		trackTitle?: string;
		onClose: () => void;
	}

	let { plainLyrics, syncedLyrics, trackTitle, onClose }: Props = $props();

	let view = $state<'plain' | 'synced'>(syncedLyrics ? 'synced' : 'plain');

	interface LRCLine {
		time: string;
		text: string;
	}

	/**
	 * Parse LRC format lyrics
	 * Format: [mm:ss.xx] Lyrics text
	 */
	function parseLRC(lrc: string): LRCLine[] {
		return lrc
			.split('\n')
			.filter((line) => line.trim())
			.map((line) => {
				// Match LRC timestamp format: [mm:ss.xx]
				const match = line.match(/\[(\d{2}:\d{2}\.\d{2})\]\s*(.+)/);
				if (match) {
					return { time: match[1], text: match[2] };
				}
				// Handle lines without timestamps (metadata lines)
				return { time: '', text: line };
			})
			.filter((line) => line.text); // Remove empty lines
	}

	let parsedLyrics = $derived(syncedLyrics ? parseLRC(syncedLyrics) : []);
</script>

<!-- Modal backdrop -->
<div
	class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
	onclick={onClose}
	role="dialog"
	aria-modal="true"
	aria-labelledby="lyrics-title"
>
	<!-- Modal content -->
	<div
		class="relative flex h-[80vh] w-[90vw] max-w-3xl flex-col overflow-hidden rounded-lg border border-neutral-700 bg-neutral-900 shadow-2xl"
		onclick={(e) => e.stopPropagation()}
	>
		<!-- Header -->
		<div class="flex items-center justify-between border-b border-neutral-700 px-6 py-4">
			<h2 id="lyrics-title" class="text-xl font-semibold text-white">
				{trackTitle || 'Lyrics'}
			</h2>
			<button
				onclick={onClose}
				class="rounded-full p-1 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-white"
				aria-label="Close lyrics viewer"
			>
				<svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M6 18L18 6M6 6l12 12"
					/>
				</svg>
			</button>
		</div>

		<!-- Tabs (if both plain and synced available) -->
		{#if plainLyrics && syncedLyrics}
			<div class="flex border-b border-neutral-800">
				<button
					onclick={() => (view = 'plain')}
					class="flex-1 px-4 py-2 text-sm font-medium transition-colors {view === 'plain'
						? 'border-b-2 border-blue-500 text-blue-400'
						: 'text-neutral-400 hover:text-white'}"
				>
					Plain Text
				</button>
				<button
					onclick={() => (view = 'synced')}
					class="flex-1 px-4 py-2 text-sm font-medium transition-colors {view === 'synced'
						? 'border-b-2 border-blue-500 text-blue-400'
						: 'text-neutral-400 hover:text-white'}"
				>
					Synced (LRC)
				</button>
			</div>
		{/if}

		<!-- Lyrics content -->
		<div class="flex-1 overflow-y-auto p-6">
			{#if view === 'plain' && plainLyrics}
				<pre
					class="font-sans text-base leading-relaxed whitespace-pre-wrap text-neutral-200">{plainLyrics}</pre>
			{:else if view === 'synced' && syncedLyrics}
				<div class="space-y-2">
					{#each parsedLyrics as line}
						<div class="flex gap-4">
							{#if line.time}
								<span class="w-20 shrink-0 font-mono text-sm text-neutral-500">{line.time}</span>
								<span class="flex-1 text-base text-neutral-200">{line.text}</span>
							{:else}
								<!-- Metadata line (no timestamp) -->
								<span class="text-sm text-neutral-600 italic">{line.text}</span>
							{/if}
						</div>
					{/each}
				</div>
			{:else}
				<div class="flex h-full items-center justify-center">
					<p class="text-neutral-500">No lyrics available</p>
				</div>
			{/if}
		</div>
	</div>
</div>
