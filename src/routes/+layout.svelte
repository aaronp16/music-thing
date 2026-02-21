<script lang="ts">
	import './layout.css';
	import Toast from '$lib/components/Toast.svelte';
	import DiskSpace from '$lib/components/DiskSpace.svelte';

	let { children } = $props();
</script>

<svelte:head>
	<title>music-thing</title>
</svelte:head>

<div class="flex h-screen flex-col bg-neutral-900 text-white">
	<!-- Header -->
	<header class="flex h-14 flex-shrink-0 items-center justify-between border-b border-neutral-800 px-4">
		<h1 class="text-xl font-bold">music-thing</h1>
		<DiskSpace />
	</header>

	<!-- Main Content -->
	<main class="flex min-h-0 flex-1">
		{@render children()}
	</main>
</div>

<!-- Toast notifications -->
<Toast />
