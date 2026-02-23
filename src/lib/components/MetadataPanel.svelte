<script lang="ts">
	import PillButton from './PillButton.svelte';

	interface Props {
		isOpen: boolean;
		trackPath: string | null;
		onClose: () => void;
	}

	let { isOpen = false, trackPath = null, onClose }: Props = $props();

	let metadata = $state<any>(null);
	let loading = $state(false);
	let error = $state<string | null>(null);
	let enriching = $state(false);
	let enrichMessage = $state<string | null>(null);

	// Fetch metadata when trackPath changes
	$effect(() => {
		if (trackPath && isOpen) {
			loadMetadata(trackPath);
		} else {
			metadata = null;
			error = null;
			enrichMessage = null;
		}
	});

	async function loadMetadata(path: string) {
		loading = true;
		error = null;

		try {
			const response = await fetch(`/api/track/metadata?path=${encodeURIComponent(path)}`);

			if (!response.ok) {
				throw new Error('Failed to load metadata');
			}

			metadata = await response.json();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load metadata';
		} finally {
			loading = false;
		}
	}

	async function enrichMetadata() {
		if (!trackPath || enriching) return;

		enriching = true;
		enrichMessage = null;

		try {
			const response = await fetch('/api/track/enrich', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ trackPath })
			});

			if (!response.ok) {
				throw new Error('Failed to enrich metadata');
			}

			const result = await response.json();

			if (result.enriched) {
				enrichMessage = `Downloaded with ${result.confidence.toFixed(0)}% confidence`;
				// Reload metadata to show updated data
				await loadMetadata(trackPath);
			} else {
				enrichMessage = result.message || 'No metadata found';
			}

			// Clear message after 3 seconds
			setTimeout(() => {
				enrichMessage = null;
			}, 3000);
		} catch (err) {
			enrichMessage = err instanceof Error ? err.message : 'Enrichment failed';
		} finally {
			enriching = false;
		}
	}

	function formatDate(dateStr: string | undefined): string {
		if (!dateStr) return 'N/A';
		try {
			return new Date(dateStr).toLocaleDateString();
		} catch {
			return dateStr;
		}
	}

	function formatFileSize(bytes: number): string {
		if (bytes < 1024) return bytes + ' B';
		if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
		return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
	}

	function formatDuration(seconds: number | undefined): string {
		if (!seconds) return 'N/A';
		const mins = Math.floor(seconds / 60);
		const secs = Math.floor(seconds % 60);
		return `${mins}:${secs.toString().padStart(2, '0')}`;
	}

	function handleClose() {
		onClose();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			handleClose();
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- Backdrop -->
{#if isOpen}
	<div
		class="fixed inset-0 z-40 bg-black/50 transition-opacity"
		onclick={handleClose}
		role="button"
		tabindex="-1"
	></div>
{/if}

<!-- Panel -->
<div
	class="fixed top-0 right-0 bottom-0 z-50 w-full transform bg-neutral-900 shadow-2xl transition-transform duration-300 ease-in-out sm:w-[500px] md:w-[600px] {isOpen
		? 'translate-x-0'
		: 'translate-x-full'}"
>
	<!-- Header -->
	<div class="flex items-center justify-between border-b border-neutral-800 px-6 py-4">
		<h2 class="text-xl font-bold text-white">Track Metadata</h2>
		<div class="flex items-center gap-2">
			<PillButton
				onclick={enrichMetadata}
				disabled={enriching || loading}
				loading={enriching}
				variant="blue"
				title="Download metadata from MusicBrainz"
			>
				Metadata
			</PillButton>
			<button
				onclick={handleClose}
				class="rounded-lg p-2 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-white"
				aria-label="Close"
			>
				<svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M6 18L18 6M6 6l12 12"
					/>
				</svg>
			</button>
		</div>
	</div>

	<!-- Enrichment Message Toast -->
	{#if enrichMessage}
		<div class="animate-fade-in absolute top-20 right-6 left-6 z-10">
			<div class="rounded-lg bg-blue-900/90 px-4 py-3 text-center text-sm text-blue-100 shadow-lg">
				{enrichMessage}
			</div>
		</div>
	{/if}

	<!-- Content -->
	<div class="h-full overflow-y-auto pb-20">
		{#if loading}
			<div class="flex items-center justify-center py-16">
				<svg class="h-10 w-10 animate-spin text-neutral-500" viewBox="0 0 24 24" fill="none">
					<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"
					></circle>
					<path
						class="opacity-75"
						fill="currentColor"
						d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
					></path>
				</svg>
			</div>
		{:else if error}
			<div class="p-6">
				<div class="rounded-lg bg-red-900/50 p-4 text-center text-red-200">
					<p>{error}</p>
				</div>
			</div>
		{:else if metadata}
			<div class="space-y-6 p-6">
				<!-- Basic Information -->
				<section>
					<h3 class="mb-3 text-sm font-semibold tracking-wider text-neutral-400 uppercase">
						Basic Information
					</h3>
					<dl class="space-y-2">
						<div class="flex justify-between">
							<dt class="text-neutral-500">Title</dt>
							<dd class="text-right font-medium text-white">{metadata.embedded.title || 'N/A'}</dd>
						</div>
						<div class="flex justify-between">
							<dt class="text-neutral-500">Artist</dt>
							<dd class="text-right font-medium text-white">{metadata.embedded.artist || 'N/A'}</dd>
						</div>
						<div class="flex justify-between">
							<dt class="text-neutral-500">Album Artist</dt>
							<dd class="text-right font-medium text-white">
								{metadata.embedded.albumArtist || 'N/A'}
							</dd>
						</div>
						<div class="flex justify-between">
							<dt class="text-neutral-500">Album</dt>
							<dd class="text-right font-medium text-white">{metadata.embedded.album || 'N/A'}</dd>
						</div>
						<div class="flex justify-between">
							<dt class="text-neutral-500">Track #</dt>
							<dd class="text-right font-medium text-white">
								{metadata.embedded.trackNumber ||
									'N/A'}{#if metadata.embedded.totalTracks}/{metadata.embedded.totalTracks}{/if}
							</dd>
						</div>
						<div class="flex justify-between">
							<dt class="text-neutral-500">Disc #</dt>
							<dd class="text-right font-medium text-white">
								{metadata.embedded.discNumber || 'N/A'}{#if metadata.embedded.totalDiscs}/{metadata
										.embedded.totalDiscs}{/if}
							</dd>
						</div>
						<div class="flex justify-between">
							<dt class="text-neutral-500">Year</dt>
							<dd class="text-right font-medium text-white">
								{metadata.embedded.year ||
									metadata.embedded.date?.split('-')[0] ||
									metadata.sidecar?.year ||
									'N/A'}
							</dd>
						</div>
					</dl>
				</section>

				<!-- Release Information -->
				<section>
					<h3 class="mb-3 text-sm font-semibold tracking-wider text-neutral-400 uppercase">
						Release Information
					</h3>
					<dl class="space-y-2">
						<div class="flex justify-between">
							<dt class="text-neutral-500">Label</dt>
							<dd class="text-right font-medium text-white">
								{metadata.embedded.label || metadata.sidecar?.label || 'N/A'}
							</dd>
						</div>
						<div class="flex justify-between">
							<dt class="text-neutral-500">Catalog #</dt>
							<dd class="text-right font-medium text-white">
								{metadata.embedded.catalogNumber || metadata.sidecar?.catalogNumber || 'N/A'}
							</dd>
						</div>
						<div class="flex justify-between">
							<dt class="text-neutral-500">Release Date</dt>
							<dd class="text-right font-medium text-white">
								{formatDate(metadata.embedded.releaseDate || metadata.sidecar?.releaseDate)}
							</dd>
						</div>
						<div class="flex justify-between">
							<dt class="text-neutral-500">Original Date</dt>
							<dd class="text-right font-medium text-white">
								{formatDate(metadata.embedded.originalDate || metadata.sidecar?.originalDate)}
							</dd>
						</div>
						<div class="flex justify-between">
							<dt class="text-neutral-500">Country</dt>
							<dd class="text-right font-medium text-white">
								{metadata.embedded.releaseCountry || metadata.sidecar?.releaseCountry || 'N/A'}
							</dd>
						</div>
						<div class="flex justify-between">
							<dt class="text-neutral-500">ISRC</dt>
							<dd class="text-right font-mono text-sm text-white">
								{metadata.embedded.isrc || metadata.sidecar?.isrc || 'N/A'}
							</dd>
						</div>
						<div class="flex justify-between">
							<dt class="text-neutral-500">Barcode</dt>
							<dd class="text-right font-mono text-sm text-white">
								{metadata.embedded.barcode || metadata.sidecar?.barcode || 'N/A'}
							</dd>
						</div>
					</dl>
				</section>

				<!-- Credits -->
				{#if metadata.embedded.composer || metadata.embedded.lyricist || metadata.embedded.producer || metadata.embedded.engineer}
					<section>
						<h3 class="mb-3 text-sm font-semibold tracking-wider text-neutral-400 uppercase">
							Credits
						</h3>
						<dl class="space-y-2">
							{#if metadata.embedded.composer}
								<div class="flex justify-between">
									<dt class="text-neutral-500">Composer</dt>
									<dd class="text-right font-medium text-white">
										{metadata.embedded.composer}
									</dd>
								</div>
							{/if}
							{#if metadata.embedded.lyricist}
								<div class="flex justify-between">
									<dt class="text-neutral-500">Lyricist</dt>
									<dd class="text-right font-medium text-white">
										{metadata.embedded.lyricist}
									</dd>
								</div>
							{/if}
							{#if metadata.embedded.producer}
								<div class="flex justify-between">
									<dt class="text-neutral-500">Producer</dt>
									<dd class="text-right font-medium text-white">
										{metadata.embedded.producer}
									</dd>
								</div>
							{/if}
							{#if metadata.embedded.engineer}
								<div class="flex justify-between">
									<dt class="text-neutral-500">Engineer</dt>
									<dd class="text-right font-medium text-white">
										{metadata.embedded.engineer}
									</dd>
								</div>
							{/if}
						</dl>
					</section>
				{/if}

				<!-- Audio Format -->
				<section>
					<h3 class="mb-3 text-sm font-semibold tracking-wider text-neutral-400 uppercase">
						Audio Format
					</h3>
					<dl class="space-y-2">
						<div class="flex justify-between">
							<dt class="text-neutral-500">Codec</dt>
							<dd class="text-right font-medium text-white uppercase">
								{metadata.format.codec || 'N/A'}
							</dd>
						</div>
						<div class="flex justify-between">
							<dt class="text-neutral-500">Sample Rate</dt>
							<dd class="text-right font-medium text-white">
								{metadata.format.sampleRate ? `${metadata.format.sampleRate / 1000} kHz` : 'N/A'}
							</dd>
						</div>
						<div class="flex justify-between">
							<dt class="text-neutral-500">Bit Depth</dt>
							<dd class="text-right font-medium text-white">
								{metadata.format.bitsPerSample ? `${metadata.format.bitsPerSample} bit` : 'N/A'}
							</dd>
						</div>
						<div class="flex justify-between">
							<dt class="text-neutral-500">Bitrate</dt>
							<dd class="text-right font-medium text-white">
								{metadata.format.bitrate
									? `${Math.round(metadata.format.bitrate / 1000)} kbps`
									: 'N/A'}
							</dd>
						</div>
						<div class="flex justify-between">
							<dt class="text-neutral-500">Duration</dt>
							<dd class="text-right font-medium text-white">
								{formatDuration(metadata.format.duration)}
							</dd>
						</div>
						<div class="flex justify-between">
							<dt class="text-neutral-500">File Size</dt>
							<dd class="text-right font-medium text-white">
								{formatFileSize(metadata.fileSize)}
							</dd>
						</div>
					</dl>
				</section>

				<!-- MusicBrainz Links -->
				{#if metadata.embedded.mbid_recording || metadata.embedded.mbid_release || metadata.embedded.mbid_artist}
					<section>
						<h3 class="mb-3 text-sm font-semibold tracking-wider text-neutral-400 uppercase">
							MusicBrainz
						</h3>
						<div class="space-y-2">
							{#if metadata.embedded.mbid_recording}
								<a
									href="https://musicbrainz.org/recording/{metadata.embedded.mbid_recording}"
									target="_blank"
									rel="noopener noreferrer"
									class="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300"
								>
									<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
										/>
									</svg>
									View Recording
								</a>
							{/if}
							{#if metadata.embedded.mbid_release}
								<a
									href="https://musicbrainz.org/release/{metadata.embedded.mbid_release}"
									target="_blank"
									rel="noopener noreferrer"
									class="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300"
								>
									<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
										/>
									</svg>
									View Release
								</a>
							{/if}
							{#if metadata.embedded.mbid_artist}
								<a
									href="https://musicbrainz.org/artist/{metadata.embedded.mbid_artist}"
									target="_blank"
									rel="noopener noreferrer"
									class="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300"
								>
									<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
										/>
									</svg>
									View Artist
								</a>
							{/if}
						</div>
					</section>
				{/if}

				<!-- Enrichment Info -->
				{#if metadata.sidecar && metadata.sidecar.enrichedAt}
					<section class="rounded-lg bg-neutral-800/50 p-4">
						<p class="text-sm text-neutral-400">
							Enriched from
							<span class="font-medium text-neutral-300">{metadata.sidecar.enrichedFrom}</span>
							on {formatDate(metadata.sidecar.enrichedAt)}
						</p>
						{#if metadata.sidecar.matchConfidence !== undefined}
							<p class="mt-1 text-sm text-neutral-500">
								Match confidence: {Math.round(metadata.sidecar.matchConfidence * 100)}%
							</p>
						{/if}
					</section>
				{/if}
			</div>
		{:else}
			<div class="flex flex-col items-center justify-center py-16 text-center">
				<svg
					class="mb-4 h-16 w-16 text-neutral-700"
					fill="none"
					stroke="currentColor"
					viewBox="0 0 24 24"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="1"
						d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
					/>
				</svg>
				<p class="text-neutral-500">Select a track to view its metadata</p>
			</div>
		{/if}
	</div>
</div>
