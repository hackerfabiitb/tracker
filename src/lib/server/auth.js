import { env } from '$env/dynamic/private';
import { createHash, createHmac, timingSafeEqual } from 'crypto';

export const SESSION_DAYS = 90;
export const COOKIE = 'session';

/**
 * Vercel always serves HTTPS, but `npm run dev` is plain HTTP, and a Secure
 * cookie is silently dropped over HTTP -- which makes a successful login look
 * like it did nothing.
 */
export function isSecureRequest(request) {
	const forwarded = request.headers.get('x-forwarded-proto');
	if (forwarded) return forwarded.split(',')[0].trim() === 'https';

	const origin = request.headers.get('origin');
	if (origin) return origin.startsWith('https:');

	return false;
}

export function cookieOpts(secure) {
	return {
		path: '/',
		httpOnly: true,
		sameSite: 'strict',
		secure,
		maxAge: SESSION_DAYS * 86_400
	};
}

/**
 * SvelteKit's built-in origin check only inspects form posts. Comparing the
 * Origin host against the Host header covers the JSON API too.
 */
export function isSameOrigin(request) {
	const origin = request.headers.get('origin');
	if (!origin) return false;
	const host = request.headers.get('host');
	if (!host) return false;
	try {
		return new URL(origin).host === host;
	} catch {
		return false;
	}
}

// USERS is a JSON object of email -> password, e.g.
//   USERS={"alice@example.com":"hunter2","bob@example.com":"swordfish"}
// Emails are matched case-insensitively.
let _users = null;
function users() {
	if (!_users) {
		_users = new Map();
		try {
			for (const [email, password] of Object.entries(JSON.parse(env.USERS ?? '{}'))) {
				_users.set(email.trim().toLowerCase(), String(password));
			}
		} catch {
			console.error('USERS is not valid JSON; nobody can log in');
		}
	}
	return _users;
}

// Hashing both sides first gives equal-length buffers, so the compare stays
// constant-time whatever the password lengths.
function digest(s) {
	return createHash('sha256').update(String(s)).digest();
}

/** Returns the normalised email if the credentials match, else null. */
export function checkLogin(email, password) {
	const key = String(email ?? '').trim().toLowerCase();
	const expected = users().get(key);
	// Compare against something even for unknown emails, so response time
	// does not reveal which emails exist.
	const match = timingSafeEqual(digest(password ?? ''), digest(expected ?? '\0no-such-user'));
	return match && expected !== undefined ? key : null;
}

function sign(secret, payload) {
	return createHmac('sha256', secret).update(payload).digest('hex');
}

export function makeToken(secret, email) {
	const expiry = Date.now() + SESSION_DAYS * 86_400_000;
	const payload = `${encodeURIComponent(email)}|${expiry}`;
	return `${payload}|${sign(secret, payload)}`;
}

/**
 * Returns the session's email, or null. A user removed from USERS is logged
 * out on their next request, even with an unexpired cookie.
 */
export function verifyToken(secret, token) {
	const [user, expiry, mac] = (token ?? '').split('|');
	if (!user || !expiry || !mac || !secret) return null;
	const expected = sign(secret, `${user}|${expiry}`);
	if (mac.length !== expected.length) return null;
	try {
		if (!timingSafeEqual(Buffer.from(mac, 'hex'), Buffer.from(expected, 'hex'))) return null;
	} catch {
		return null;
	}
	if (Number(expiry) <= Date.now()) return null;
	const email = decodeURIComponent(user);
	return users().has(email) ? email : null;
}
