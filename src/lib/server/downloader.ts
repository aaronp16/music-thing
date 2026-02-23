/**
 * Download service with progress tracking
 */

import { createWriteStream } from 'fs';
import { mkdir, access, constants, unlink, copyFile, readdir } from 'fs/promises';
import path from 'path';
import { env } from './env';
import {
	getStreamUrlWithFallback,
	getCoverUrl,
	getArtistImageUrl,
	getAlbum,
	getArtistInfo,
	type Track,
	type Album,
	type AlbumWithTracks,
	type Quality as HifiQuality
} from './hifi-client';
import {
	embedMetadata,
	extractMetadata,
	saveMetadataJSON,
	mergeMetadata,
	enrichTrackWithMetadata
} from './metadata';
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
	return name.replace(/[<>:"/\\|*]/g, '_').trim();
}

/**
 * Get file extension for a quality level
 */
function getExtension(quality: Quality): string {
	const option = QUALITY_OPTIONS.find((o) => o.value === quality);
	return option?.extension || 'flac';
}

/**
 * Generate file path for a track
 */
function getFilePath(
	track: Track,
	quality: Quality = DEFAULT_QUALITY,
	hasMultipleVolumes = false
): string {
	const artistName = sanitize(track.artist?.name || track.artists?.[0]?.name || 'Unknown Artist');
	const albumTitle = sanitize(track.album?.title || 'Unknown Album');
	const trackNum = String(track.trackNumber || 1).padStart(2, '0');
	const trackTitle = sanitize(track.title);
	const ext = getExtension(quality);

	// Check for multi-disk - always create disk folders if album has multiple volumes
	const diskNum = track.volumeNumber || 1;
	const diskFolder = hasMultipleVolumes || diskNum > 1 ? `Disk ${diskNum}` : null;

	// Build path - include disk folder if multiple volumes OR disk > 1
	const folderPath = diskFolder ? path.join(albumTitle, diskFolder) : albumTitle;

	return path.join(env.MUSIC_DIR, artistName, folderPath, `${trackNum} - ${trackTitle}.${ext}`);
}

/**
 * Get album folder path (for cover art)
 */
function getAlbumPath(track: Track): string {
	const artistName = sanitize(track.artist?.name || track.artists?.[0]?.name || 'Unknown Artist');
	const albumTitle = sanitize(track.album?.title || 'Unknown Album');

	// For multi-disk albums, put cover in the main album folder
	return path.join(env.MUSIC_DIR, artistName, albumTitle);
}

/**
 * Get artist folder path (for artist image)
 */
function getArtistPath(track: Track): string {
	const artistName = sanitize(track.artist?.name || track.artists?.[0]?.name || 'Unknown Artist');
	return path.join(env.MUSIC_DIR, artistName);
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

/**
 * Get temp file path for a download
 * Returns null if temp downloads are disabled (dev mode)
 */
function getTempFilePath(jobId: string, trackId: number, ext: string): string | null {
	if (!env.TEMP_DIR) return null;
	return path.join(env.TEMP_DIR, `${jobId}-${trackId}.${ext}`);
}

/**
 * Move file from temp to final destination (cross-device safe)
 * Uses copy + delete since temp and music dirs are on different filesystems
 */
async function moveFile(src: string, dest: string): Promise<void> {
	await copyFile(src, dest);
	await unlink(src);
}

/**
 * Safely delete a temp file (ignores errors)
 */
async function cleanupTempFile(tempPath: string | null): Promise<void> {
	if (!tempPath) return;
	try {
		await unlink(tempPath);
	} catch {
		// Ignore cleanup errors
	}
}

/**
 * Initialize temp directory on startup
 * - Creates the directory if it doesn't exist
 * - Cleans up any orphaned files from previous sessions
 */
export async function initTempDir(): Promise<void> {
	if (!env.TEMP_DIR) return;

	try {
		// Create temp directory
		await mkdir(env.TEMP_DIR, { recursive: true });

		// Clean up any existing files (orphaned from crashed downloads)
		const files = await readdir(env.TEMP_DIR);
		for (const file of files) {
			try {
				await unlink(path.join(env.TEMP_DIR, file));
			} catch {
				// Ignore individual file cleanup errors
			}
		}

		console.log(
			`[downloader] Temp directory initialized: ${env.TEMP_DIR} (cleaned ${files.length} orphaned files)`
		);
	} catch (err) {
		console.error('[downloader] Failed to initialize temp directory:', err);
	}
}

// Initialize temp directory on module load
initTempDir();

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
	totalTracks?: number,
	hasMultipleVolumes = false
): Promise<DownloadProgress> {
	const filePath = getFilePath(track, quality, hasMultipleVolumes);
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

	// Determine if using temp download (production) or direct (dev)
	const ext = getExtension(quality);
	let tempFilePath = getTempFilePath(jobId, track.id, ext);

	try {
		progressState.status = 'downloading';
		onProgress(progressState);

		// Get stream URL first to determine actual quality (may fallback)
		const { url: streamUrl, actualQuality } = await getStreamUrlWithFallback(track.id, quality);

		// Update file path if quality changed due to fallback
		const actualFilePath =
			actualQuality !== quality ? getFilePath(track, actualQuality, hasMultipleVolumes) : filePath;

		// Update temp file path if quality changed
		if (actualQuality !== quality && tempFilePath) {
			const actualExt = getExtension(actualQuality);
			tempFilePath = getTempFilePath(jobId, track.id, actualExt);
		}

		// Determine where to write the download
		const downloadPath = tempFilePath || actualFilePath;

		// Create directory for download destination
		await mkdir(path.dirname(downloadPath), { recursive: true });

		// Download with progress
		const response = await fetch(streamUrl);

		if (!response.ok) {
			throw new Error(`Failed to download: ${response.statusText}`);
		}

		const totalBytes = parseInt(response.headers.get('content-length') || '0');
		progressState.totalBytes = totalBytes;

		// Stream to file (temp or final depending on environment)
		const writer = createWriteStream(downloadPath);
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
			// Reserve last 5% for metadata embedding + move
			progressState.progress = totalBytes > 0 ? Math.round((bytesDownloaded / totalBytes) * 90) : 0;
			onProgress(progressState);
		}

		writer.end();

		// Wait for write to complete
		await new Promise<void>((resolve, reject) => {
			writer.on('finish', resolve);
			writer.on('error', reject);
		});

		// Fetch extended metadata (MusicBrainz only - lyrics are separate)
		const artistName =
			track.artists?.map((a) => a.name).join(', ') || track.artist?.name || 'Unknown Artist';

		const enrichedMetadata = await enrichTrackWithMetadata({
			artist: artistName,
			title: track.title,
			isrc: track.isrc
		});

		// Embed metadata (basic + enriched) into audio file
		try {
			const basicMetadata = extractMetadata(track, totalTracks);
			const finalMetadata = mergeMetadata(basicMetadata, enrichedMetadata);

			// Check if cover art exists for embedding
			if (await fileExists(coverPath)) {
				finalMetadata.coverArtPath = coverPath;
			}

			await embedMetadata(downloadPath, finalMetadata);

			// Save sidecar JSON (without coverArtPath)
			await saveMetadataJSON(downloadPath, finalMetadata);
		} catch (metadataError) {
			// Log but don't fail the download if metadata embedding fails
			console.error('Failed to embed metadata:', metadataError);
		}

		// If using temp downloads, move to final destination
		if (tempFilePath) {
			// Create final directory
			await mkdir(path.dirname(actualFilePath), { recursive: true });
			// Move file (copy + delete for cross-device)
			await moveFile(tempFilePath, actualFilePath);
		}

		// Note: Lyrics are no longer fetched during download - use separate "Fetch Lyrics" button

		progressState.status = 'complete';
		progressState.progress = 100;
		onProgress(progressState);

		return progressState;
	} catch (error) {
		// Clean up temp file on error
		await cleanupTempFile(tempFilePath);

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

	// Generate a unique temp file name for cover art
	const tempCoverPath = env.TEMP_DIR
		? path.join(env.TEMP_DIR, `cover-${track.album?.id || Date.now()}.jpg`)
		: null;

	try {
		const coverUuid = track.album?.cover;
		if (!coverUuid) return;

		const coverUrl = getCoverUrl(coverUuid, 1280);
		const response = await fetch(coverUrl);

		if (!response.ok) return;

		// Determine download path (temp or final)
		const downloadPath = tempCoverPath || coverPath;

		// Create directory for download destination
		await mkdir(path.dirname(downloadPath), { recursive: true });

		const buffer = await response.arrayBuffer();
		const writer = createWriteStream(downloadPath);
		writer.write(Buffer.from(buffer));
		writer.end();

		await new Promise<void>((resolve, reject) => {
			writer.on('finish', resolve);
			writer.on('error', reject);
		});

		// If using temp downloads, move to final destination
		if (tempCoverPath) {
			await mkdir(albumPath, { recursive: true });
			await moveFile(tempCoverPath, coverPath);
		}
	} catch {
		// Clean up temp file on error
		await cleanupTempFile(tempCoverPath);
		// Ignore cover art errors
	}
}

/**
 * Download artist image (artist.jpg) to the artist folder
 * Fetches artist info from the API to get the picture UUID
 */
async function downloadArtistImage(track: Track): Promise<void> {
	const artistPath = getArtistPath(track);
	const artistImagePath = path.join(artistPath, 'artist.jpg');

	// Skip if already exists
	if (await fileExists(artistImagePath)) {
		return;
	}

	// Get artist ID
	const artistId = track.artist?.id || track.artists?.[0]?.id;
	if (!artistId) return;

	// Generate a unique temp file name for artist image
	const tempArtistImagePath = env.TEMP_DIR
		? path.join(env.TEMP_DIR, `artist-${artistId}.jpg`)
		: null;

	try {
		// Fetch artist info to get the picture UUID
		const artistInfo = await getArtistInfo(artistId);
		const pictureUuid = artistInfo.artist?.picture;
		if (!pictureUuid) return;

		const artistImageUrl = getArtistImageUrl(pictureUuid, 750);
		const response = await fetch(artistImageUrl);

		if (!response.ok) return;

		// Determine download path (temp or final)
		const downloadPath = tempArtistImagePath || artistImagePath;

		// Create directory for download destination
		await mkdir(path.dirname(downloadPath), { recursive: true });

		const buffer = await response.arrayBuffer();
		const writer = createWriteStream(downloadPath);
		writer.write(Buffer.from(buffer));
		writer.end();

		await new Promise<void>((resolve, reject) => {
			writer.on('finish', resolve);
			writer.on('error', reject);
		});

		// If using temp downloads, move to final destination
		if (tempArtistImagePath) {
			await mkdir(artistPath, { recursive: true });
			await moveFile(tempArtistImagePath, artistImagePath);
		}
	} catch {
		// Clean up temp file on error
		await cleanupTempFile(tempArtistImagePath);
		// Ignore artist image errors
	}
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Start downloading a single track
 */
export async function startTrackDownload(
	track: Track,
	quality: Quality = DEFAULT_QUALITY
): Promise<string> {
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
			// Download cover art and artist image first
			await downloadCoverArt(track);
			await downloadArtistImage(track);

			// Download track (no totalTracks for single track downloads)
			await downloadTrack(
				track,
				jobId,
				(progress) => {
					job.progress.set(track.id, progress);
					notifyProgress(jobId, progress);
				},
				quality
			);
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
export async function startAlbumDownload(
	albumId: number,
	quality: Quality = DEFAULT_QUALITY,
	selectedTrackIds?: number[]
): Promise<string> {
	const jobId = generateJobId();

	// Fetch album with tracks
	const album = await getAlbum(albumId);
	const allTracks = album.tracks || [];
	const hasMultipleVolumes = (album.numberOfVolumes || 1) > 1;

	if (allTracks.length === 0) {
		throw new Error('Album has no tracks');
	}

	// Filter tracks based on selection
	const tracks =
		selectedTrackIds && selectedTrackIds.length > 0
			? allTracks.filter((t) => selectedTrackIds.includes(t.id))
			: allTracks;

	if (tracks.length === 0) {
		throw new Error('No tracks selected');
	}

	const totalTracks = tracks.length;

	// Enrich tracks with album info
	const enrichedTracks: Track[] = tracks.map((t) => ({
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
			// Download cover art and artist image first
			if (enrichedTracks.length > 0) {
				await downloadCoverArt(enrichedTracks[0]);
				await downloadArtistImage(enrichedTracks[0]);
			}

			// Download tracks one by one
			for (let i = 0; i < enrichedTracks.length; i++) {
				job.currentTrackIndex = i;
				const track = enrichedTracks[i];

				await downloadTrack(
					track,
					jobId,
					(progress) => {
						job.progress.set(track.id, progress);
						notifyProgress(jobId, progress);
					},
					quality,
					totalTracks,
					hasMultipleVolumes
				);
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
