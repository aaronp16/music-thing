import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ parent }) => {
	const { slogan } = await parent();
	return {
		placeholder: slogan
	};
};
