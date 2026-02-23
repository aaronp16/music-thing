<script lang="ts">
	type ButtonVariant = 'blue' | 'purple' | 'neutral';

	interface Props {
		onclick: () => void;
		disabled?: boolean;
		loading?: boolean;
		variant?: ButtonVariant;
		title?: string;
		children?: import('svelte').Snippet;
	}

	let {
		onclick,
		disabled = false,
		loading = false,
		variant = 'neutral',
		title,
		children
	}: Props = $props();

	const variantClasses = {
		blue: 'bg-blue-900/50 text-blue-300 hover:bg-blue-800/60 hover:text-white',
		purple: 'bg-purple-900/50 text-purple-300 hover:bg-purple-800/60 hover:text-white',
		neutral: 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-white'
	};
</script>

<button
	{onclick}
	{disabled}
	{title}
	class="rounded-full px-3 py-1.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 {variantClasses[
		variant
	]}"
>
	{#if loading}
		<svg class="mr-1 inline-block h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
			<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"
			></circle>
			<path
				class="opacity-75"
				fill="currentColor"
				d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
			></path>
		</svg>
	{:else}
		<svg class="mr-1 inline-block h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
			<path
				stroke-linecap="round"
				stroke-linejoin="round"
				stroke-width="2"
				d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
			/>
		</svg>
	{/if}
	{@render children?.()}
</button>
