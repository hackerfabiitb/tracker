// Every date the UI renders goes through here. Absolute dates are YYYY-MM-DD
// throughout; only the near-term relative wording differs.

const pad = (n) => String(n).padStart(2, '0');

export function fmtTime(d) {
	return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Absolute dates are always YYYY-MM-DD, in local time. */
export function fmtDate(d) {
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** overdue / today / tmrw while that reads better, else YYYY-MM-DD. */
export function formatDue(due) {
	if (!due) return '';
	const d = new Date(due);
	const now = new Date();
	now.setHours(0, 0, 0, 0);
	const diff = d.getTime() - now.getTime();
	const t = fmtTime(d);
	if (diff < 0) return `overdue ${t}`;
	if (diff < 86400000) return `today ${t}`;
	if (diff < 172800000) return `tmrw ${t}`;
	return `${fmtDate(d)} ${t}`;
}

export function formatTS(iso) {
	if (!iso) return '';
	const d = new Date(iso);
	return `${fmtDate(d)} ${fmtTime(d)}`;
}

/**
 * ISO string -> the value an <input type="datetime-local"> expects, which is
 * local time with no zone suffix. Going through toISOString() here would shift
 * the displayed time by the UTC offset.
 */
export function toLocalInput(iso) {
	if (!iso) return '';
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return '';
	return `${fmtDate(d)}T${fmtTime(d)}`;
}

/**
 * Parse what formatTS renders, so a field can both display and accept
 * YYYY-MM-DD HH:MM. A native datetime input cannot be forced to that format,
 * it follows the browser locale, so the board uses text fields and this.
 *
 * Returns an ISO string, null for empty, or undefined when it cannot parse,
 * which the caller treats as "reject and put the old value back".
 */
export function fromDisplay(value) {
	const v = (value ?? '').trim();
	if (!v) return null;

	const m = v.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2}))?$/);
	if (!m) return undefined;

	const [, y, mo, d, h = '0', mi = '0'] = m;
	const dt = new Date(+y, +mo - 1, +d, +h, +mi);
	if (Number.isNaN(dt.getTime())) return undefined;

	// Date rolls impossible values over: 2026-02-31 becomes 3 March. Compare the
	// parts back so that is rejected rather than silently shifted.
	if (dt.getFullYear() !== +y || dt.getMonth() !== +mo - 1 || dt.getDate() !== +d) return undefined;
	if (+h > 23 || +mi > 59) return undefined;

	return dt.toISOString();
}

/** The inverse: a datetime-local value back to an ISO string, or null. */
export function fromLocalInput(value) {
	if (!value) return null;
	const d = new Date(value);
	return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
