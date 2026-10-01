import { json } from '@sveltejs/kit';
import { store } from '$lib/server/store.js';

export async function POST({ request }) {
	const { groupId, name } = await request.json();
	if (!groupId || !name?.trim()) return json({ error: 'groupId and name required' }, { status: 400 });
	const result = await store.addProject(groupId, name.trim());
	if (!result) return json({ error: 'group not found' }, { status: 404 });
	return json(result, { status: 201 });
}
