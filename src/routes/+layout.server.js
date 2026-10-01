import { store } from '$lib/server/store.js';

export async function load({ locals }) {
	// The layout also renders /login, which is public; send it nothing.
	if (!locals.user) return { groups: [], settings: store.getSettings() };
	return { groups: (await store.get()).groups, settings: store.getSettings() };
}
