import { json } from '@sveltejs/kit';
import { store } from '$lib/server/store.js';

export async function POST({ request }) {
	const { projectId, ...fields } = await request.json();
	if (!projectId || !fields.title?.trim()) return json({ error: 'projectId and title required' }, { status: 400 });
	fields.title = fields.title.trim();
	const result = await store.addTask(projectId, fields);
	if (!result) return json({ error: 'project not found' }, { status: 404 });
	return json(result, { status: 201 });
}
