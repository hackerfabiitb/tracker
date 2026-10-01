import { store } from '$lib/server/store.js';

// There is no writable disk on Vercel, so a backup is a download of the
// whole tree rather than a copy saved next to it.
export async function GET() {
	const d = new Date();
	const pad = (n) => String(n).padStart(2, '0');
	const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
	return new Response(JSON.stringify(await store.get(), null, 2), {
		headers: {
			'content-type': 'application/json',
			'content-disposition': `attachment; filename="data-${stamp}.json"`
		}
	});
}
