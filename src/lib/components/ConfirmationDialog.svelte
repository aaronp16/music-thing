é<script lang="ts">
	interface Props {
		isOpen: boolean;
		title: string;
		message: string;
		confirmLabel?: string;
		cancelLabel?: string;
		danger?: boolean;
		onConfirm: () => void;
		onCancel: () => void;
	}

	let {
		isOpen = false,
		title,
		message,
		confirmLabel = 'Confirm',
		cancelLabel = 'Cancel',
		danger = false,
		onConfirm,
		onCancel
	}: Props = $props();

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			onCancel();
		}
	}

	function handleBackdropClick() {
		onCancel();
	}

	function handleConfirm() {
		onConfirm();
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
		role="dialog"
		aria-modal="true"
		aria-labelledby="dialog-title"
	>
		<div
			class="w-full max-w-md rounded-xl border border-neutral-700 bg-neutral-800 p-6 shadow-2xl"
			onclick={(e) => e.stopPropagation()}
		>
			<h2 id="dialog-title" class="mb-2 text-lg font-semibold text-white">{title}</h2>
			<p class="mb-6 text-sm text-neutral-400">{message}</p>
			<div class="flex justify-end gap-3">
				<button
					onclick={onCancel}
					class="rounded-lg px-4 py-2 text-sm font-medium text-neutral-300 transition-colors hover:bg-neutral-700"
				>
					{cancelLabel}
				</button>
				<button
					onclick={handleConfirm}
					class="rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors {danger
						? 'bg-red-600 hover:bg-red-700'
						: 'bg-green-600 hover:bg-green-700'}"
				>
					{confirmLabel}
				</button>
			</div>
		</div>
	</div>
{/if}
