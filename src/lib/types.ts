/**
 * Shared types for the frontend
 */

export interface Artist {
	id: number;
	name: string;
	picture?: string;
}

export interface Album {
	id: number;
	title: string;
	cover: string;
	numberOfTracks?: number;
	duration?: number;
	releaseDate?: string;
	artist?: Artist;
	artists?: Artist[];
}

export interface Track {
	id: number;
	title: string;
	duration: number;
	trackNumber: number;
	volumeNumber: number;
	explicit: boolean;
	artist: Artist;
	artists: Artist[];
	album: Album;
}

export interface SearchResult<T> {
	items: T[];
	totalNumberOfItems: number;
	limit: number;
	offset: number;
}

/**
 * Audio quality options
 */
export type Quality = 'LOSSLESS' | 'HIGH' | 'LOW';

export const QUALITY_OPTIONS: { value: Quality; label: string; description: string; extension: string }[] = [
	{ value: 'LOSSLESS', label: 'FLAC', description: '16-bit/44.1kHz', extension: 'flac' },
	{ value: 'HIGH', label: 'AAC 320', description: '320kbps', extension: 'm4a' },
	{ value: 'LOW', label: 'AAC 96', description: '96kbps', extension: 'm4a' }
];

export const DEFAULT_QUALITY: Quality = 'LOSSLESS';

/**
 * Format duration in seconds to mm:ss
 */
export function formatDuration(seconds: number): string {
	const mins = Math.floor(seconds / 60);
	const secs = seconds % 60;
	return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Get cover art URL from cover UUID
 */
export function getCoverUrl(coverUuid: string, size: 80 | 640 | 1280 = 640): string {
	if (!coverUuid) return '';
	const path = coverUuid.replace(/-/g, '/');
	return `https://resources.tidal.com/images/${path}/${size}x${size}.jpg`;
}
