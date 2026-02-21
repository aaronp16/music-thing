/**
 * Global quality selection store
 */

import { writable } from 'svelte/store';
import { DEFAULT_QUALITY, type Quality } from '$lib/types';

export const selectedQuality = writable<Quality>(DEFAULT_QUALITY);
