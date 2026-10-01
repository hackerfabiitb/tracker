import { env } from '$env/dynamic/private';
import { error } from '@sveltejs/kit';
import { Redis } from '@upstash/redis';

// The whole tree is one JSON document under one key, so an export is still a
// single file. Keys are prefixed so the app can share a Redis database with
// another app without colliding.
const prefix = () => env.REDIS_PREFIX || 'tracker:';
const dataKey = () => `${prefix()}data`;
const versionKey = () => `${prefix()}version`;

// Serverless instances come and go, so nothing is cached between requests:
// Redis is the only copy of the data.
let _redis = null;
function redis() {
	if (!_redis) {
		_redis = new Redis({
			url: env.UPSTASH_REDIS_REST_URL,
			token: env.UPSTASH_REDIS_REST_TOKEN,
			automaticDeserialization: false
		});
	}
	return _redis;
}

// Several people edit at once, so a plain read-modify-write would let one
// person's save silently overwrite another's. Each write only lands if the
// version is unchanged since the read; otherwise the edit is replayed on
// fresh data.
const COMPARE_AND_SET = `
if (redis.call('GET', KEYS[2]) or '0') ~= ARGV[1] then return 0 end
redis.call('SET', KEYS[1], ARGV[2])
redis.call('INCR', KEYS[2])
return 1
`;
const MAX_ATTEMPTS = 12;

async function read() {
	const [raw, version] = await redis().mget(dataKey(), versionKey());
	return { data: raw ? JSON.parse(raw) : { groups: [] }, version: version ?? '0' };
}

/**
 * Runs `fn` against the current tree and saves the result. `fn` returns null
 * or false to signal "not found", in which case nothing is written.
 */
async function mutate(fn) {
	for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
		const { data, version } = await read();
		const result = fn(data);
		if (result === null || result === false) return result;
		const ok = await redis().eval(
			COMPARE_AND_SET,
			[dataKey(), versionKey()],
			[String(version), JSON.stringify(data)]
		);
		if (Number(ok) === 1) return result;
		// Random backoff, so colliding writers stop retrying in lockstep
		await new Promise((r) => setTimeout(r, Math.random() * 50 * (attempt + 1)));
	}
	throw error(503, 'Too many simultaneous edits, try again');
}

function findProject(data, projectId) {
	for (const g of data.groups) {
		const p = g.projects.find((p) => p.id === projectId);
		if (p) return p;
	}
	return null;
}

function slugify(name) {
	return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

// Group ids double as board URLs, so two groups with the same name need
// distinct ids.
function uniqueGroupId(data, name) {
	const base = slugify(name) || 'group';
	let id = base;
	for (let n = 2; data.groups.some((g) => g.id === id); n++) id = `${base}-${n}`;
	return id;
}

const SETTINGS = { notesMaxLines: 3 };

export const store = {
	get: async () => (await read()).data,
	getSettings: () => SETTINGS,

	// Groups
	addGroup(name) {
		return mutate((data) => {
			const group = { id: uniqueGroupId(data, name), name, projects: [] };
			data.groups.push(group);
			return group;
		});
	},
	updateGroup(id, patch) {
		return mutate((data) => {
			const g = data.groups.find((g) => g.id === id);
			if (!g) return null;
			if (patch.name !== undefined) g.name = patch.name;
			return g;
		});
	},
	deleteGroup(id) {
		return mutate((data) => {
			const idx = data.groups.findIndex((g) => g.id === id);
			if (idx === -1) return false;
			data.groups.splice(idx, 1);
			return true;
		});
	},

	// Projects
	addProject(groupId, name) {
		return mutate((data) => {
			const g = data.groups.find((g) => g.id === groupId);
			if (!g) return null;
			const project = { id: crypto.randomUUID(), name, tasks: [] };
			g.projects.push(project);
			return project;
		});
	},
	updateProject(id, patch) {
		return mutate((data) => {
			const p = findProject(data, id);
			if (!p) return null;
			if (patch.name !== undefined) p.name = patch.name;
			return p;
		});
	},
	deleteProject(id) {
		return mutate((data) => {
			for (const g of data.groups) {
				const idx = g.projects.findIndex((p) => p.id === id);
				if (idx !== -1) {
					g.projects.splice(idx, 1);
					return true;
				}
			}
			return false;
		});
	},

	// Tasks
	addTask(projectId, fields) {
		return mutate((data) => {
			const p = findProject(data, projectId);
			if (!p) return null;
			const task = {
				id: crypto.randomUUID(),
				title: fields.title ?? '',
				priority: fields.priority ?? 'low',
				due: fields.due ?? null,
				notifyAt: fields.notifyAt ?? null,
				createdAt: new Date().toISOString(),
				completed: null,
				notes: fields.notes ?? ''
			};
			p.tasks.push(task);
			return task;
		});
	},
	updateTask(id, patch) {
		return mutate((data) => {
			for (const g of data.groups) {
				for (const p of g.projects) {
					const idx = p.tasks.findIndex((t) => t.id === id);
					if (idx === -1) continue;
					const t = p.tasks[idx];
					const allowed = ['title', 'priority', 'due', 'notifyAt', 'completed', 'notes'];
					for (const key of allowed) {
						if (patch[key] !== undefined) t[key] = patch[key];
					}
					// The edit form can reassign a task, so a projectId that differs
					// from where it currently sits means move it rather than edit it.
					if (patch.projectId !== undefined && patch.projectId !== p.id) {
						const target = findProject(data, patch.projectId);
						if (!target) return null;
						p.tasks.splice(idx, 1);
						target.tasks.push(t);
					}
					return t;
				}
			}
			return null;
		});
	},
	deleteTask(id) {
		return mutate((data) => {
			for (const g of data.groups) {
				for (const p of g.projects) {
					const idx = p.tasks.findIndex((t) => t.id === id);
					if (idx !== -1) {
						p.tasks.splice(idx, 1);
						return true;
					}
				}
			}
			return false;
		});
	}
};
