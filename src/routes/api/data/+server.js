import { json } from '@sveltejs/kit';
import { store } from '$lib/server/store.js';

export async function GET() {
	return json(await store.get());
}
