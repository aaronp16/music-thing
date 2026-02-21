/**
 * Downloads store - manages active download state for the UI
 */

import { writable, derived } from 'svelte/store';
import { toasts } from './toasts';
import { DEFAULT_QUALITY, type Quality } from '$lib/types';

// =============================================================================
// Types
// =============================================================================

export interface PendingTrack {
	id: number;
	title: string;
	trackNumber: number;
}

export interface DownloadItem {
	id: string;
	jobId: string;
	trackId: number;
	trackTitle: string;
	artistName: string;
	albumTitle: string;
	status: 'pending' | 'downloading' | 'complete' | 'error' | 'skipped';
	progress: number;
	bytesDownloaded: number;
	totalBytes: number;
	error?: string;
}

export interface DownloadJob {
	jobId: string;
	type: 'track' | 'album';
	albumId?: number;
	albumTitle?: string;
	items: Map<number, DownloadItem>;
	startedAt: number;
}

// =============================================================================
// Store
// =============================================================================

function createDownloadsStore() {
	const { subscribe, update } = writable<Map<string, DownloadJob>>(new Map());

	return {
		subscribe,

		/**
		 * Start a new download job and connect to SSE
		 */
		startDownload: async (
			type: 'track' | 'album',
			id: number,
			track?: { id: number; title: string; artist: { name: string }; album: { title: string } },
			quality: Quality = DEFAULT_QUALITY
		) => {
			// Call download API
			const response = await fetch('/api/download', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ type, id, track, quality })
			});

			if (!response.ok) {
				const error = await response.json();
				throw new Error(error.error || 'Failed to start download');
			}

			const { jobId, pendingTracks, albumTitle, artistName } = await response.json();

			// Create job entry
			const job: DownloadJob = {
				jobId,
				type,
				albumId: type === 'album' ? id : undefined,
				albumTitle,
				items: new Map(),
				startedAt: Date.now()
			};

			// For albums, pre-populate all tracks as pending
			if (type === 'album' && pendingTracks && pendingTracks.length > 0) {
				for (const t of pendingTracks) {
					const pendingItem: DownloadItem = {
						id: `${jobId}-${t.id}`,
						jobId,
						trackId: t.id,
						trackTitle: t.title,
						artistName: artistName || 'Unknown',
						albumTitle: albumTitle || 'Unknown',
						status: 'pending',
						progress: 0,
						bytesDownloaded: 0,
						totalBytes: 0
					};
					job.items.set(t.id, pendingItem);
				}
			}

			update((jobs) => {
				jobs.set(jobId, job);
				return new Map(jobs);
			});

			// Connect to SSE for progress updates
			const eventSource = new EventSource(`/api/progress/${jobId}`);

			// Track which tracks we've already shown toasts for
			const toastedTracks = new Set<number>();

			eventSource.onmessage = (event) => {
				const data = JSON.parse(event.data);

				if (data.type === 'progress') {
					update((jobs) => {
						const job = jobs.get(jobId);
						if (job) {
							const previousItem = job.items.get(data.trackId);
							const previousStatus = previousItem?.status;

							const item: DownloadItem = {
								id: data.id,
								jobId,
								trackId: data.trackId,
								trackTitle: data.trackTitle,
								artistName: data.artistName,
								albumTitle: data.albumTitle,
								status: data.status,
								progress: data.progress,
								bytesDownloaded: data.bytesDownloaded,
								totalBytes: data.totalBytes,
								error: data.error
							};
							job.items.set(data.trackId, item);

							// Update album title if we have it
							if (!job.albumTitle && data.albumTitle) {
								job.albumTitle = data.albumTitle;
							}

							// Show toast on status change (only once per track)
							if (!toastedTracks.has(data.trackId)) {
								if (data.status === 'complete' && previousStatus !== 'complete') {
									toastedTracks.add(data.trackId);
									toasts.success(`Downloaded: ${data.trackTitle}`);
								} else if (data.status === 'error' && previousStatus !== 'error') {
									toastedTracks.add(data.trackId);
									toasts.error(`Failed: ${data.trackTitle}${data.error ? ` - ${data.error}` : ''}`);
								}
							}
						}
						return new Map(jobs);
					});
				} else if (data.type === 'done') {
					eventSource.close();
				}
			};

			eventSource.onerror = () => {
				eventSource.close();
			};

			return jobId;
		},

		/**
		 * Remove a completed/errored job from the list
		 */
		removeJob: (jobId: string) => {
			update((jobs) => {
				jobs.delete(jobId);
				return new Map(jobs);
			});
		},

		/**
		 * Clear all completed jobs
		 */
		clearCompleted: () => {
			update((jobs) => {
				for (const [jobId, job] of jobs) {
					const allDone = Array.from(job.items.values()).every(
						(item) => item.status === 'complete' || item.status === 'error' || item.status === 'skipped'
					);
					if (allDone && job.items.size > 0) {
						jobs.delete(jobId);
					}
				}
				return new Map(jobs);
			});
		}
	};
}

export const downloads = createDownloadsStore();

// =============================================================================
// Derived Stores
// =============================================================================

/**
 * All download items as a flat array (for display)
 */
export const downloadItems = derived(downloads, ($downloads) => {
	const items: DownloadItem[] = [];
	for (const job of $downloads.values()) {
		for (const item of job.items.values()) {
			items.push(item);
		}
	}
	// Sort: downloading first, then pending, then by most recent
	return items.sort((a, b) => {
		const statusOrder = { downloading: 0, pending: 1, error: 2, skipped: 3, complete: 4 };
		const statusA = statusOrder[a.status];
		const statusB = statusOrder[b.status];
		if (statusA !== statusB) return statusA - statusB;
		
		const jobA = $downloads.get(a.jobId);
		const jobB = $downloads.get(b.jobId);
		return (jobB?.startedAt || 0) - (jobA?.startedAt || 0);
	});
});

/**
 * Currently downloading track IDs (for disabling buttons)
 */
export const downloadingTrackIds = derived(downloads, ($downloads) => {
	const ids = new Set<number>();
	for (const job of $downloads.values()) {
		for (const item of job.items.values()) {
			if (item.status === 'pending' || item.status === 'downloading') {
				ids.add(item.trackId);
			}
		}
	}
	return ids;
});

/**
 * Currently downloading album IDs (for disabling buttons)
 */
export const downloadingAlbumIds = derived(downloads, ($downloads) => {
	const ids = new Set<number>();
	for (const job of $downloads.values()) {
		if (job.type === 'album' && job.albumId) {
			const hasActiveDownloads = Array.from(job.items.values()).some(
				(item) => item.status === 'pending' || item.status === 'downloading'
			);
			if (hasActiveDownloads || job.items.size === 0) {
				ids.add(job.albumId);
			}
		}
	}
	return ids;
});

/**
 * Check if there are any active downloads
 */
export const hasActiveDownloads = derived(downloads, ($downloads) => {
	for (const job of $downloads.values()) {
		for (const item of job.items.values()) {
			if (item.status === 'pending' || item.status === 'downloading') {
				return true;
			}
		}
	}
	return false;
});
