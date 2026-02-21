/**
 * Environment configuration with defaults
 */

/**
 * Default API providers in priority order
 */
export const DEFAULT_API_PROVIDERS = [
	'https://triton.squid.wtf',
	'https://api.monochrome.tf',
	'https://wolf.qqdl.site'
];

/**
 * Parse API providers from environment variable or use defaults
 * Supports comma-separated list: API_PROVIDERS="https://a.com,https://b.com"
 */
function getApiProviders(): string[] {
	const envProviders = process.env.API_PROVIDERS;
	if (envProviders) {
		return envProviders.split(',').map((p) => p.trim()).filter(Boolean);
	}
	// Legacy single provider support
	if (process.env.API_BASE_URL) {
		return [process.env.API_BASE_URL];
	}
	return DEFAULT_API_PROVIDERS;
}

export const env = {
	API_PROVIDERS: getApiProviders(),
	MUSIC_DIR: process.env.MUSIC_DIR || './music'
};
