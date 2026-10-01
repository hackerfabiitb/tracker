import { env } from '$env/dynamic/private';
import { fail, redirect } from '@sveltejs/kit';
import { checkLogin, makeToken, cookieOpts, COOKIE } from '$lib/server/auth.js';

export const actions = {
	default: async ({ request, cookies, locals, url }) => {
		const data = await request.formData();
		const email = String(data.get('email') ?? '');
		const user = checkLogin(email, data.get('password'));

		if (!user) return fail(401, { error: 'Wrong email or password', email });

		const secret = env.SESSION_SECRET ?? '';
		cookies.set(COOKIE, makeToken(secret, user), cookieOpts(locals.secureCookie));

		const next = url.searchParams.get('next') ?? '/';
		// '//evil.com' is protocol-relative, so a leading slash alone is not enough
		throw redirect(303, next.startsWith('/') && !next.startsWith('//') ? next : '/');
	}
};
