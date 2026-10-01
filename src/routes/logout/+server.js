import { redirect } from '@sveltejs/kit';
import { COOKIE } from '$lib/server/auth.js';

export function GET({ cookies }) {
	cookies.delete(COOKIE, { path: '/' });
	throw redirect(303, '/login');
}
