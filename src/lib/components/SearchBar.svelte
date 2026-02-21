<script lang="ts">
	type SearchType = 'tracks' | 'albums';

	interface Props {
		onSearch: (query: string, type: SearchType) => void;
		loading?: boolean;
		placeholder?: string;
	}

	let { onSearch, loading = false, placeholder = 'Search for music...' }: Props = $props();

	let query = $state('');
	let searchType: SearchType = $state('tracks');

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
	<form onsubmit={handleSubmit} class="flex flex-col gap-3">
		<div class="flex gap-2">
			<input
				type="text"
				bind:value={query}
				onkeydown={handleKeydown}
				placeholder={placeholder}
				class="flex-1 rounded-lg border border-neutral-700 bg-neutral-800 px-4 py-2 text-white placeholder-neutral-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
				disabled={loading}
			/>
			<button
				type="submit"
				disabled={loading || !query.trim()}
				class="rounded-lg bg-blue-600 px-4 py-2 font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
			>
				{#if loading}
					<svg class="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
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
					Search
				{/if}
			</button>
		</div>

		<div class="flex gap-4">
			<label class="flex cursor-pointer items-center gap-2">
				<input
					type="radio"
					name="searchType"
					value="tracks"
					bind:group={searchType}
					class="h-4 w-4 accent-blue-600"
				/>
				<span class="text-sm text-neutral-300">Tracks</span>
			</label>
			<label class="flex cursor-pointer items-center gap-2">
				<input
					type="radio"
					name="searchType"
					value="albums"
					bind:group={searchType}
					class="h-4 w-4 accent-blue-600"
				/>
				<span class="text-sm text-neutral-300">Albums</span>
			</label>
		</div>
	</form>
</div>
