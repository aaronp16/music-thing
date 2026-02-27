<script lang="ts">
	interface Props {
		trackPath: string;
		onMetadataClick?: () => void;
	}

	let { trackPath, onMetadataClick }: Props = $props();
</script>

<div class="flex items-center gap-1">
	<button
		onclick={onMetadataClick}
		class="flex items-center gap-1 rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] font-medium text-neutral-400 hover:bg-neutral-700"
		title="View metadata"
	>
		<svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
			<path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6l4 2" />
		</svg>
	</button>
</div>
