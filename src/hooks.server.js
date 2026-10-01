import { env } from '$env/dynamic/private';
import { error, redirect } from '@sveltejs/kit';
import {
	makeToken,
	verifyToken,
	isSameOrigin,
	isSecureRequest,
	cookieOpts,
	COOKIE
} from '$lib/server/auth.js';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export async function handle({ event, resolve }) {
	if (MUTATING.has(event.request.method) && !isSameOrigin(event.request)) {
		throw error(403, 'Cross-site request forbidden');
	}

	event.locals.secureCookie = isSecureRequest(event.request);

	const secret = env.SESSION_SECRET ?? '';
	event.locals.user = verifyToken(secret, event.cookies.get(COOKIE));

	if (event.url.pathname === '/login') return resolve(event);

	if (!event.locals.user) {
		const next = event.url.pathname === '/' ? '' : `?next=${encodeURIComponent(event.url.pathname)}`;
		throw redirect(303, `/login${next}`);
	}

	// Rolling session: refresh cookie on every request
	const response = await resolve(event);
	response.headers.append(
		'set-cookie',
		event.cookies.serialize(
			COOKIE,
			makeToken(secret, event.locals.user),
			cookieOpts(event.locals.secureCookie)
		)
	);
	return response;
}
