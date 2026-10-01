import { json } from '@sveltejs/kit';
import { store } from '$lib/server/store.js';

export async function POST({ request }) {
	const { name } = await request.json();
	if (!name?.trim()) return json({ error: 'name required' }, { status: 400 });
	return json(await store.addGroup(name.trim()), { status: 201 });
}
