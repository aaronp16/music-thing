<script lang="ts">
	import './layout.css';
	import Toast from '$lib/components/Toast.svelte';
	import DiskSpace from '$lib/components/DiskSpace.svelte';
	import DownloadsHeaderIndicator from '$lib/components/DownloadsHeaderIndicator.svelte';
	import DownloadsModal from '$lib/components/DownloadsModal.svelte';

	interface Props {
		data: { slogan: string };
		children: import('svelte').Snippet;
	}

	let { data, children }: Props = $props();

	let isDownloadsModalOpen = $state(false);

	function openDownloadsModal() {
		isDownloadsModalOpen = true;
	}

	function closeDownloadsModal() {
		isDownloadsModalOpen = false;
	}
</script>

<svelte:head>
	<title>Music Thing</title>
</svelte:head>

<div class="flex h-screen flex-col bg-neutral-900 text-white">
	<!-- Main Content -->
	<main class="flex min-h-0 flex-1">
		{@render children()}
	</main>
</div>

<!-- Toast notifications -->
<Toast />

<!-- Downloads Modal -->
<DownloadsModal isOpen={isDownloadsModalOpen} onClose={closeDownloadsModal} />
