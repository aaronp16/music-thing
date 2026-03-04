<script lang="ts">
	interface MenuItem {
		label: string;
		icon?: 'delete' | 'info' | 'metadata';
		danger?: boolean;
		onClick: () => void;
	}

	interface Props {
		items: MenuItem[];
	}

	let { items }: Props = $props();

	let isOpen = $state(false);

	const iconPaths = {
		delete:
			'M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16',
		info: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
		metadata:
			'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z'
	};

	function toggle(e: Event) {
		e.stopPropagation();
		isOpen = !isOpen;
	}

	function handleItemClick(item: MenuItem) {
		isOpen = false;
		item.onClick();
	}

	function handleClickOutside() {
		isOpen = false;
	}
</script>

<svelte:window onclick={handleClickOutside} />

<div class="relative">
	<button
		onclick={toggle}
		class="flex h-6 w-6 items-center justify-center rounded text-neutral-500 transition-colors hover:bg-neutral-700 hover:text-white"
		aria-label="Menu"
		aria-expanded={isOpen}
	>
		<svg class="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
			<circle cx="12" cy="5" r="1.5" />
			<circle cx="12" cy="12" r="1.5" />
			<circle cx="12" cy="19" r="1.5" />
		</svg>
	</button>

	{#if isOpen}
		<div
			class="absolute top-full right-0 z-20 mt-1 w-44 overflow-hidden rounded-lg border border-neutral-700 bg-neutral-800 shadow-lg"
			role="menu"
		>
			{#each items as item (item.label)}
				<button
					onclick={() => handleItemClick(item)}
					class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-neutral-700 {item.danger
						? 'text-red-400'
						: 'text-neutral-200'}"
					role="menuitem"
				>
					{#if item.icon}
						<svg
							class="h-4 w-4 flex-shrink-0"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d={iconPaths[item.icon]}
							/>
						</svg>
					{/if}
					{item.label}
				</button>
			{/each}
		</div>
	{/if}
</div>
