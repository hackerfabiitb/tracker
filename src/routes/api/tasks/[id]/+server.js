import { json } from '@sveltejs/kit';
import { store } from '$lib/server/store.js';

export async function PATCH({ params, request }) {
	const patch = await request.json();
	const result = await store.updateTask(params.id, patch);
	if (!result) return json({ error: 'not found' }, { status: 404 });
	return json(result);
}

export async function DELETE({ params }) {
	const ok = await store.deleteTask(params.id);
	if (!ok) return json({ error: 'not found' }, { status: 404 });
	return new Response(null, { status: 204 });
}
