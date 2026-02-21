/**
 * Download service with progress tracking
 */

import { createWriteStream } from 'fs';
import { mkdir, access, constants } from 'fs/promises';
import path from 'path';
import { env } from './env';
import { getStreamUrlWithFallback, getCoverUrl, getAlbum, type Track, type Album, type AlbumWithTracks, type Quality as HifiQuality } from './hifi-client';
import { embedMetadata, extractMetadata } from './metadata';
import { QUALITY_OPTIONS, DEFAULT_QUALITY, type Quality } from '$lib/types';

// =============================================================================
// Types
// =============================================================================

export interface DownloadProgress {
	id: string;
	trackId: number;
	trackTitle: string;
	artistName: string;
	albumTitle: string;
	status: 'pending' | 'downloading' | 'complete' | 'error' | 'skipped';
	progress: number; // 0-100
	bytesDownloaded: number;
	totalBytes: number;
	error?: string;
}

export interface DownloadJob {
	id: string;
	type: 'track' | 'album';
	tracks: Track[];
	albumInfo?: Album;
	currentTrackIndex: number;
	progress: Map<number, DownloadProgress>;
}

// =============================================================================
// State
// =============================================================================

// Active download jobs
const activeJobs = new Map<string, DownloadJob>();

// Progress listeners (for SSE)
const progressListeners = new Map<string, Set<(progress: DownloadProgress) => void>>();

// =============================================================================
// Helpers
// =============================================================================

/**
 * Sanitize filename/folder name
 */
function sanitize(name: string): string {
	return name.replace(/[<>:"/\\|?*]/g, '_').trim();
}

/**
 * Get file extension for a quality level
 */
function getExtension(quality: Quality): string {
	const option = QUALITY_OPTIONS.find(o => o.value === quality);
	return option?.extension || 'flac';
}

/**
 * Generate file path for a track
 */
function getFilePath(track: Track, quality: Quality = DEFAULT_QUALITY): string {
	const artistName = sanitize(track.artist?.name || track.artists?.[0]?.name || 'Unknown Artist');
	const albumTitle = sanitize(track.album?.title || 'Unknown Album');
	const trackNum = String(track.trackNumber || 1).padStart(2, '0');
	const trackTitle = sanitize(track.title);
	const ext = getExtension(quality);
	
	return path.join(
		env.MUSIC_DIR,
		artistName,
		albumTitle,
		`${trackNum} - ${trackTitle}.${ext}`
	);
}

/**
 * Get album folder path
 */
function getAlbumPath(track: Track): string {
	const artistName = sanitize(track.artist?.name || track.artists?.[0]?.name || 'Unknown Artist');
	const albumTitle = sanitize(track.album?.title || 'Unknown Album');
	
	return path.join(env.MUSIC_DIR, artistName, albumTitle);
}

/**
 * Check if file already exists
 */
async function fileExists(filePath: string): Promise<boolean> {
	try {
		await access(filePath, constants.F_OK);
		return true;
	} catch {
		return false;
	}
}

/**
 * Generate unique job ID
 */
function generateJobId(): string {
	return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Notify progress listeners
 */
function notifyProgress(jobId: string, progress: DownloadProgress) {
	const listeners = progressListeners.get(jobId);
	if (listeners) {
		for (const listener of listeners) {
			listener(progress);
		}
	}
}

/**
 * Format bytes to human readable
 */
export function formatBytes(bytes: number): string {
	if (bytes === 0) return '0 B';
	const k = 1024;
	const sizes = ['B', 'KB', 'MB', 'GB'];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

// =============================================================================
// Download Logic
// =============================================================================

/**
 * Download a single track with progress tracking
 */
async function downloadTrack(
	track: Track,
	jobId: string,
	onProgress: (progress: DownloadProgress) => void,
	quality: Quality = DEFAULT_QUALITY,
	totalTracks?: number
): Promise<DownloadProgress> {
	const filePath = getFilePath(track, quality);
	const albumPath = getAlbumPath(track);
	const coverPath = path.join(albumPath, 'cover.jpg');
	
	const progressState: DownloadProgress = {
		id: `${jobId}-${track.id}`,
		trackId: track.id,
		trackTitle: track.title,
		artistName: track.artist?.name || track.artists?.[0]?.name || 'Unknown',
		albumTitle: track.album?.title || 'Unknown',
		status: 'pending',
		progress: 0,
		bytesDownloaded: 0,
		totalBytes: 0
	};
	
	try {
		progressState.status = 'downloading';
		onProgress(progressState);
		
		// Create directory
		await mkdir(albumPath, { recursive: true });
		
		// Get stream URL (with automatic quality fallback)
		const { url: streamUrl, actualQuality } = await getStreamUrlWithFallback(track.id, quality);
		
		// Update file path if quality changed due to fallback
		const actualFilePath = actualQuality !== quality ? getFilePath(track, actualQuality) : filePath;
		
		// Download with progress
		const response = await fetch(streamUrl);
		
		if (!response.ok) {
			throw new Error(`Failed to download: ${response.statusText}`);
		}
		
		const totalBytes = parseInt(response.headers.get('content-length') || '0');
		progressState.totalBytes = totalBytes;
		
		// Stream to file
		const writer = createWriteStream(actualFilePath);
		const reader = response.body?.getReader();
		
		if (!reader) {
			throw new Error('No response body');
		}
		
		let bytesDownloaded = 0;
		
		while (true) {
			const { done, value } = await reader.read();
			
			if (done) break;
			
			writer.write(Buffer.from(value));
			bytesDownloaded += value.length;
			
			progressState.bytesDownloaded = bytesDownloaded;
			// Reserve last 5% for metadata embedding
			progressState.progress = totalBytes > 0 ? Math.round((bytesDownloaded / totalBytes) * 95) : 0;
			onProgress(progressState);
		}
		
		writer.end();
		
		// Wait for write to complete
		await new Promise<void>((resolve, reject) => {
			writer.on('finish', resolve);
			writer.on('error', reject);
		});
		
		// Embed metadata
		try {
			const metadata = extractMetadata(track, totalTracks);
			// Check if cover art exists for embedding
			if (await fileExists(coverPath)) {
				metadata.coverArtPath = coverPath;
			}
			await embedMetadata(actualFilePath, metadata);
		} catch (metadataError) {
			// Log but don't fail the download if metadata embedding fails
			console.error('Failed to embed metadata:', metadataError);
		}
		
		progressState.status = 'complete';
		progressState.progress = 100;
		onProgress(progressState);
		
		return progressState;
		
	} catch (error) {
		progressState.status = 'error';
		progressState.error = error instanceof Error ? error.message : 'Download failed';
		onProgress(progressState);
		return progressState;
	}
}

/**
 * Download cover art for an album
 */
async function downloadCoverArt(track: Track): Promise<void> {
	const albumPath = getAlbumPath(track);
	const coverPath = path.join(albumPath, 'cover.jpg');
	
	// Skip if already exists
	if (await fileExists(coverPath)) {
		return;
	}
	
	try {
		const coverUuid = track.album?.cover;
		if (!coverUuid) return;
		
		const coverUrl = getCoverUrl(coverUuid, 1280);
		const response = await fetch(coverUrl);
		
		if (!response.ok) return;
		
		await mkdir(albumPath, { recursive: true });
		
		const buffer = await response.arrayBuffer();
		const writer = createWriteStream(coverPath);
		writer.write(Buffer.from(buffer));
		writer.end();
		
		await new Promise<void>((resolve, reject) => {
			writer.on('finish', resolve);
			writer.on('error', reject);
		});
	} catch {
		// Ignore cover art errors
	}
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Start downloading a single track
 */
export async function startTrackDownload(track: Track, quality: Quality = DEFAULT_QUALITY): Promise<string> {
	const jobId = generateJobId();
	
	const job: DownloadJob = {
		id: jobId,
		type: 'track',
		tracks: [track],
		currentTrackIndex: 0,
		progress: new Map()
	};
	
	activeJobs.set(jobId, job);
	
	// Start download in background
	(async () => {
		try {
			// Download cover art first
			await downloadCoverArt(track);
			
			// Download track (no totalTracks for single track downloads)
			await downloadTrack(track, jobId, (progress) => {
				job.progress.set(track.id, progress);
				notifyProgress(jobId, progress);
			}, quality);
		} finally {
			// Keep job around for a bit so client can get final status
			setTimeout(() => {
				activeJobs.delete(jobId);
				progressListeners.delete(jobId);
			}, 30000);
		}
	})();
	
	return jobId;
}

/**
 * Start downloading an album (sequential track downloads)
 */
export async function startAlbumDownload(albumId: number, quality: Quality = DEFAULT_QUALITY): Promise<string> {
	const jobId = generateJobId();
	
	// Fetch album with tracks
	const album = await getAlbum(albumId);
	const tracks = album.tracks || [];
	
	if (tracks.length === 0) {
		throw new Error('Album has no tracks');
	}
	
	const totalTracks = tracks.length;
	
	// Enrich tracks with album info
	const enrichedTracks: Track[] = tracks.map(t => ({
		...t,
		album: {
			id: album.id,
			title: album.title,
			cover: album.cover,
			numberOfTracks: album.numberOfTracks,
			releaseDate: album.releaseDate
		}
	}));
	
	const job: DownloadJob = {
		id: jobId,
		type: 'album',
		tracks: enrichedTracks,
		albumInfo: album,
		currentTrackIndex: 0,
		progress: new Map()
	};
	
	activeJobs.set(jobId, job);
	
	// Start downloads in background (sequential)
	(async () => {
		try {
			// Download cover art first
			if (enrichedTracks.length > 0) {
				await downloadCoverArt(enrichedTracks[0]);
			}
			
			// Download tracks one by one
			for (let i = 0; i < enrichedTracks.length; i++) {
				job.currentTrackIndex = i;
				const track = enrichedTracks[i];
				
				await downloadTrack(track, jobId, (progress) => {
					job.progress.set(track.id, progress);
					notifyProgress(jobId, progress);
				}, quality, totalTracks);
			}
		} finally {
			// Keep job around for a bit
			setTimeout(() => {
				activeJobs.delete(jobId);
				progressListeners.delete(jobId);
			}, 30000);
		}
	})();
	
	return jobId;
}

/**
 * Get current job status
 */
export function getJobStatus(jobId: string): DownloadJob | undefined {
	return activeJobs.get(jobId);
}

/**
 * Subscribe to progress updates for a job
 */
export function subscribeToProgress(
	jobId: string,
	listener: (progress: DownloadProgress) => void
): () => void {
	if (!progressListeners.has(jobId)) {
		progressListeners.set(jobId, new Set());
	}
	
	progressListeners.get(jobId)!.add(listener);
	
	// Send current progress state immediately
	const job = activeJobs.get(jobId);
	if (job) {
		for (const progress of job.progress.values()) {
			listener(progress);
		}
	}
	
	// Return unsubscribe function
	return () => {
		progressListeners.get(jobId)?.delete(listener);
	};
}
