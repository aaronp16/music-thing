<script lang="ts">
	import PillButton from './PillButton.svelte';

	interface Props {
		isOpen: boolean;
		trackPath: string | null;
		onClose: () => void;
	}

	let { isOpen = false, trackPath = null, onClose }: Props = $props();

	let lyrics = $state<{ plain?: string; synced?: string; title?: string } | null>(null);
	let loading = $state(false);
	let error = $state<string | null>(null);
	let view = $state<'plain' | 'synced'>('synced');
	let fetchingLyrics = $state(false);
	let lyricsMessage = $state<string | null>(null);

	interface LRCLine {
		time: string;
		text: string;
	}

	// Fetch lyrics when trackPath changes
	$effect(() => {
		if (trackPath && isOpen) {
			loadLyrics(trackPath);
		} else {
			lyrics = null;
			error = null;
			lyricsMessage = null;
		}
	});

	async function loadLyrics(path: string) {
		loading = true;
		error = null;

		try {
			const response = await fetch(`/api/track/metadata?path=${encodeURIComponent(path)}`);

			if (!response.ok) {
				throw new Error('Failed to load lyrics');
			}

			const data = await response.json();

			lyrics = {
				plain: data.embedded?.lyrics,
				synced: data.embedded?.syncedLyrics,
				title: data.embedded?.title
			};

			// Default to synced if available, otherwise plain
			if (lyrics.synced) {
				view = 'synced';
			} else if (lyrics.plain) {
				view = 'plain';
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load lyrics';
		} finally {
			loading = false;
		}
	}

	async function fetchLyrics() {
		if (!trackPath || fetchingLyrics) return;

		fetchingLyrics = true;
		lyricsMessage = null;

		try {
			const response = await fetch('/api/lyrics/fetch', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ trackPath })
			});

			if (!response.ok) {
				throw new Error('Failed to fetch lyrics');
			}

			const result = await response.json();

			if (result.found) {
				lyricsMessage = 'Lyrics downloaded successfully';
				// Reload lyrics to show updated data
				await loadLyrics(trackPath);
			} else {
				lyricsMessage = result.message || 'No lyrics found';
			}

			// Clear message after 3 seconds
			setTimeout(() => {
				lyricsMessage = null;
			}, 3000);
		} catch (err) {
			lyricsMessage = err instanceof Error ? err.message : 'Failed to fetch lyrics';
		} finally {
			fetchingLyrics = false;
		}
	}

	function parseLRC(lrc: string): LRCLine[] {
		return lrc
			.split('\n')
			.filter((line) => line.trim())
			.map((line) => {
				const match = line.match(/\[(\d{2}:\d{2}\.\d{2})\]\s*(.+)/);
				if (match) {
					return { time: match[1], text: match[2] };
				}
				return { time: '', text: line };
			})
			.filter((line) => line.text);
	}

	let parsedLyrics = $derived(lyrics?.synced ? parseLRC(lyrics.synced) : []);

	function handleClose() {
		onClose();
	}
</script>

<!-- Backdrop -->
{#if isOpen}
	<div
		class="fixed inset-0 z-40 bg-black/50 transition-opacity"
		onclick={handleClose}
		role="button"
		tabindex="-1"
	></div>
{/if}

<!-- Panel -->
<div
	class="fixed top-0 right-0 bottom-0 z-50 w-full transform bg-neutral-900 shadow-2xl transition-transform duration-300 ease-in-out sm:w-[500px] md:w-[600px] {isOpen
		? 'translate-x-0'
		: 'translate-x-full'}"
>
	<!-- Header -->
	<div class="flex items-center justify-between border-b border-neutral-800 px-6 py-4">
		<h2 class="text-xl font-bold text-white">Lyrics</h2>
		<div class="flex items-center gap-2">
			{#if !lyrics?.plain && !lyrics?.synced}
				<PillButton
					onclick={fetchLyrics}
					disabled={fetchingLyrics || loading}
					loading={fetchingLyrics}
					variant="purple"
					title="Download lyrics from LRCLIB"
				>
					Download
				</PillButton>
			{/if}
			<button
				onclick={handleClose}
				class="rounded-lg p-2 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-white"
				aria-label="Close"
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
	</div>

	<!-- Lyrics Message Toast -->
	{#if lyricsMessage}
		<div class="animate-fade-in absolute top-20 right-6 left-6 z-10">
			<div
				class="rounded-lg bg-purple-900/90 px-4 py-3 text-center text-sm text-purple-100 shadow-lg"
			>
				{lyricsMessage}
			</div>
		</div>
	{/if}

	<!-- Content -->
	<div class="h-full overflow-y-auto pb-20">
		{#if loading}
			<div class="flex items-center justify-center py-16">
				<svg class="h-10 w-10 animate-spin text-neutral-500" viewBox="0 0 24 24" fill="none">
					<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"
					></circle>
					<path
						class="opacity-75"
						fill="currentColor"
						d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
					></path>
				</svg>
			</div>
		{:else if error}
			<div class="p-6">
				<div class="rounded-lg bg-red-900/50 p-4 text-center text-red-200">
					<p>{error}</p>
				</div>
			</div>
		{:else if lyrics && (lyrics.plain || lyrics.synced)}
			<div class="space-y-6 p-6">
				<!-- Track Title -->
				{#if lyrics.title}
					<h3 class="text-lg font-semibold text-white">{lyrics.title}</h3>
				{/if}

				<!-- Tabs (if both plain and synced available) -->
				{#if lyrics.plain && lyrics.synced}
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

				<!-- Lyrics Content -->
				<div class="lyrics-content">
					{#if view === 'plain' && lyrics.plain}
						<pre
							class="font-sans text-base leading-relaxed whitespace-pre-wrap text-neutral-200">{lyrics.plain}</pre>
					{:else if view === 'synced' && lyrics.synced}
						<div class="space-y-2">
							{#each parsedLyrics as line}
								<div class="flex gap-4">
									{#if line.time}
										<span class="w-20 shrink-0 font-mono text-sm text-neutral-500">{line.time}</span
										>
										<span class="flex-1 text-base text-neutral-200">{line.text}</span>
									{:else}
										<span class="text-sm text-neutral-600 italic">{line.text}</span>
									{/if}
								</div>
							{/each}
						</div>
					{/if}
				</div>
			</div>
		{:else}
			<div class="flex flex-col items-center justify-center py-16 text-center">
				<svg
					class="mb-4 h-16 w-16 text-neutral-700"
					fill="none"
					stroke="currentColor"
					viewBox="0 0 24 24"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="1"
						d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
					/>
				</svg>
				<p class="text-neutral-500">No lyrics available</p>
				<p class="mt-2 text-sm text-neutral-600">Click "Download" to fetch lyrics</p>
			</div>
		{/if}
	</div>
</div>
