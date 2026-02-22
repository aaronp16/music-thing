<script lang="ts">
	type SearchType = 'tracks' | 'albums' | 'artists';

	interface Props {
		onSearch: (query: string, type: SearchType) => void;
		loading?: boolean;
		placeholder?: string;
		initialQuery?: string;
		initialType?: SearchType;
	}

	let { 
		onSearch, 
		loading = false, 
		placeholder = 'What do you want to listen to?',
		initialQuery = '',
		initialType = 'tracks'
	}: Props = $props();

	let query = $state(initialQuery);
	let searchType: SearchType = $state(initialType);
	
	// Track if this is the initial mount to avoid triggering search on load
	let hasInteracted = $state(false);

	// Update state when initial values change (e.g., from URL)
	$effect(() => {
		if (initialQuery !== undefined) {
			query = initialQuery;
		}
	});

	$effect(() => {
		if (initialType !== undefined) {
			searchType = initialType;
		}
	});

	// Re-run search when type changes (if there's a query)
	function handleTypeChange(newType: SearchType) {
		searchType = newType;
		hasInteracted = true;
		if (query.trim()) {
			onSearch(query.trim(), newType);
		}
	}

	function handleSubmit(e: Event) {
		e.preventDefault();
		if (query.trim()) {
			onSearch(query.trim(), searchType);
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			handleSubmit(e);
		}
	}
</script>

<div class="w-full">
	<form onsubmit={handleSubmit} class="flex flex-col gap-4">
		<!-- Search input with icon -->
		<div class="relative">
			<div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
				{#if loading}
					<svg class="h-5 w-5 animate-spin text-neutral-400" viewBox="0 0 24 24" fill="none">
						<circle
							class="opacity-25"
							cx="12"
							cy="12"
							r="10"
							stroke="currentColor"
							stroke-width="4"
						></circle>
						<path
							class="opacity-75"
							fill="currentColor"
							d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
						></path>
					</svg>
				{:else}
					<svg class="h-5 w-5 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
					</svg>
				{/if}
			</div>
			<input
				type="text"
				bind:value={query}
				onkeydown={handleKeydown}
				placeholder={placeholder}
				class="w-full rounded-full border-0 bg-neutral-800 py-3 pl-12 pr-4 text-white placeholder-neutral-500 ring-1 ring-neutral-700 transition-all focus:bg-neutral-750 focus:outline-none focus:ring-2 focus:ring-blue-500"
				disabled={loading}
			/>
		</div>

		<!-- Type selector pills -->
		<div class="flex gap-2">
			<button
				type="button"
				onclick={() => handleTypeChange('tracks')}
				class="rounded-full px-4 py-1.5 text-sm font-medium transition-all {searchType === 'tracks' 
					? 'bg-white text-black' 
					: 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700 hover:text-white'}"
			>
				Tracks
			</button>
			<button
				type="button"
				onclick={() => handleTypeChange('albums')}
				class="rounded-full px-4 py-1.5 text-sm font-medium transition-all {searchType === 'albums' 
					? 'bg-white text-black' 
					: 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700 hover:text-white'}"
			>
				Albums
			</button>
			<button
				type="button"
				onclick={() => handleTypeChange('artists')}
				class="rounded-full px-4 py-1.5 text-sm font-medium transition-all {searchType === 'artists' 
					? 'bg-white text-black' 
					: 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700 hover:text-white'}"
			>
				Artists
			</button>
		</div>
	</form>
</div>
