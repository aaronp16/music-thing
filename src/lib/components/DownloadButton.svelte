<script lang="ts">
	import { QUALITY_OPTIONS, type Quality } from '$lib/types';
	import { selectedQuality } from '$lib/stores/quality';

	interface Props {
		onDownload: (quality: Quality) => void;
		downloading?: boolean;
		disabled?: boolean;
		compact?: boolean;
	}

	let { onDownload, downloading = false, disabled = false, compact = false }: Props = $props();
	
	const isDisabled = $derived(downloading || disabled);

	let dropdownOpen = $state(false);

	function handleDownloadClick() {
		onDownload($selectedQuality);
	}

	function handleQualitySelect(quality: Quality) {
		$selectedQuality = quality;
		dropdownOpen = false;
	}

	function toggleDropdown(e: Event) {
		e.stopPropagation();
		dropdownOpen = !dropdownOpen;
	}

	function handleClickOutside() {
		dropdownOpen = false;
	}

	// Get current quality label
	const currentOption = $derived(
		QUALITY_OPTIONS.find((q) => q.value === $selectedQuality) || QUALITY_OPTIONS[0]
	);
</script>

<svelte:window onclick={handleClickOutside} />

<div class="relative">
	<div class="flex">
		<!-- Main download button -->
		<button
			onclick={handleDownloadClick}
			disabled={isDisabled}
			class="flex cursor-pointer items-center gap-1.5 rounded-l-lg bg-green-600 text-white transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50 {compact ? 'px-2 py-1' : 'px-3 py-1.5'}"
		>
			{#if downloading}
				<svg class="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
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
				<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
				</svg>
				{#if !compact}
					<span class="text-sm font-medium">{currentOption.label}</span>
				{/if}
			{/if}
		</button>

		<!-- Dropdown toggle -->
		<button
			onclick={toggleDropdown}
			disabled={isDisabled}
			class="cursor-pointer rounded-r-lg border-l border-green-700 bg-green-600 text-white transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50 {compact ? 'px-1 py-1' : 'px-1.5 py-1.5'}"
			aria-label="Select quality"
		>
			<svg
				class="h-4 w-4 transition-transform"
				class:rotate-180={dropdownOpen}
				fill="none"
				stroke="currentColor"
				viewBox="0 0 24 24"
			>
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
			</svg>
		</button>
	</div>

	<!-- Dropdown menu -->
	{#if dropdownOpen}
		<div
			class="absolute right-0 top-full z-10 mt-1 w-44 overflow-hidden rounded-lg border border-neutral-700 bg-neutral-800 shadow-lg"
			role="menu"
			tabindex="-1"
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.key === 'Escape' && (dropdownOpen = false)}
		>
			{#each QUALITY_OPTIONS as option}
				<button
					onclick={() => handleQualitySelect(option.value)}
					class="flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors hover:bg-neutral-700"
					class:bg-neutral-700={$selectedQuality === option.value}
					role="menuitem"
				>
					<div>
						<div class="font-medium text-white">{option.label}</div>
						<div class="text-xs text-neutral-400">{option.description}</div>
					</div>
					{#if $selectedQuality === option.value}
						<svg class="h-4 w-4 text-green-500" fill="currentColor" viewBox="0 0 24 24">
							<path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
						</svg>
					{/if}
				</button>
			{/each}
		</div>
	{/if}
</div>
