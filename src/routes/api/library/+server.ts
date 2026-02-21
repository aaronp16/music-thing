/**
 * Library API endpoint - returns the folder structure of downloaded music
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { scanLibrary } from '$lib/server/library';

export const GET: RequestHandler = async () => {
	try {
		const library = await scanLibrary();
		return json(library);
	} catch (error) {
		console.error('Library scan failed:', error);
		return json(
			{ error: 'Failed to scan library' },
			{ status: 500 }
		);
	}
};
