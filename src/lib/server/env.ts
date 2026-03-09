/**
 * Environment configuration with defaults
 */

/**
 * Default API providers in priority order
 */
export const DEFAULT_API_PROVIDERS = [
	'https://api.monochrome.tf',
	'https://triton.squid.wtf'
	// Broken - all return 403 "Upstream API error" on /track/
	// 'https://wolf.qqdl.site',
	// 'https://maus.qqdl.site',
	// 'https://vogel.qqdl.site',
	// 'https://katze.qqdl.site',
	// 'https://hund.qqdl.site',
	// 'https://eu-central.monochrome.tf',
	// 'https://us-west.monochrome.tf',
	// 'https://tidal.kinoplus.online'
];

/**
 * Parse API providers from environment variable or use defaults
 * Supports comma-separated list: API_PROVIDERS="https://a.com,https://b.com"
 */
function getApiProviders(): string[] {
	const envProviders = process.env.API_PROVIDERS;
	if (envProviders) {
		return envProviders
			.split(',')
			.map((p) => p.trim())
			.filter(Boolean);
	}
	// Legacy single provider support
	if (process.env.API_BASE_URL) {
		return [process.env.API_BASE_URL];
	}
	return DEFAULT_API_PROVIDERS;
}

/**
 * Get temp directory for downloads
 * - Production: Use /tmp/music-thing to avoid music client scanning issues
 * - Development: null (download directly to MUSIC_DIR)
 */
function getTempDir(): string | null {
	if (process.env.NODE_ENV === 'production') {
		return '/tmp/music-thing';
	}
	return null;
}

export const env = {
	API_PROVIDERS: getApiProviders(),
	MUSIC_DIR: process.env.MUSIC_DIR || './music',
	TEMP_DIR: getTempDir()
};
