import { writable } from 'svelte/store';

function createLibraryRefreshStore() {
	const { subscribe, set } = writable(0);

	return {
		subscribe,
		trigger: () => set(Date.now())
	};
}

export const libraryRefresh = createLibraryRefreshStore();
