<script lang="ts">
	import './layout.css';
	import Toast from '$lib/components/Toast.svelte';
	import DiskSpace from '$lib/components/DiskSpace.svelte';

	interface Props {
		data: { slogan: string };
		children: import('svelte').Snippet;
	}

	let { data, children }: Props = $props();
</script>

<svelte:head>
	<title>Music Thing</title>
</svelte:head>

<div class="flex h-screen flex-col bg-neutral-900 text-white">
	<!-- Header -->
	<header class="flex h-14 flex-shrink-0 items-center justify-between border-b border-neutral-800 px-4">
		<div class="flex items-center gap-3">
			<h1 class="text-xl font-bold">Music Thing</h1>
			<span class="text-sm text-neutral-500 italic">{data.slogan}</span>
		</div>
		<DiskSpace />
	</header>

	<!-- Main Content -->
	<main class="flex min-h-0 flex-1">
		{@render children()}
	</main>
</div>

<!-- Toast notifications -->
<Toast />
