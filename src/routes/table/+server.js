import { redirect } from '@sveltejs/kit';

// The table moved to / when it became the default view. Kept so an existing
// bookmark or home-screen shortcut does not 404.
export function GET() {
	redirect(308, '/');
}
