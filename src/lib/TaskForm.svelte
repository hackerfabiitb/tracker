<script>
	import { appState } from '$lib/data-store.svelte.js';
	import { toLocalInput, fromLocalInput, formatTS } from '$lib/datetime.js';

	// task === null creates a task, otherwise edits that one in place.
	let { task = null, onDone = () => {}, onCancel = null } = $props();

	const editing = !!task;

	function locate(taskId) {
		for (const g of appState.groups) {
			for (const p of g.projects) {
				if (p.tasks.some((t) => t.id === taskId)) return { groupId: g.id, projectId: p.id };
			}
		}
		return null;
	}

	const origin = task ? locate(task.id) : null;
	const firstGroup = appState.groups[0];

	let groupId = $state(origin?.groupId ?? firstGroup?.id ?? '');
	let projectId = $state(origin?.projectId ?? firstGroup?.projects[0]?.id ?? '');
	let title = $state(task?.title ?? '');
	let notes = $state(task?.notes ?? '');
	let priority = $state(task?.priority ?? 'urgent');
	let due = $state(toLocalInput(task?.due));
	let notifyAt = $state(toLocalInput(task?.notifyAt));
	let flash = $state('');
	let saving = $state(false);

	const projects = $derived(appState.groups.find((g) => g.id === groupId)?.projects ?? []);

	// Picking a group selects its first project rather than leaving a stale one
	// from the previous group. Deliberately not an $effect, which would also run
	// while an edit is initialising and throw away the task's own project.
	function selectGroup(id) {
		if (groupId === id) return;
		groupId = id;
		projectId = appState.groups.find((g) => g.id === id)?.projects[0]?.id ?? '';
	}

	function findLive(taskId) {
		for (const g of appState.groups) {
			for (const p of g.projects) {
				const idx = p.tasks.findIndex((t) => t.id === taskId);
				if (idx !== -1) return { project: p, idx };
			}
		}
		return null;
	}

	function payload() {
		return {
			title: title.trim(),
			priority,
			notes,
			due: fromLocalInput(due),
			notifyAt: fromLocalInput(notifyAt)
		};
	}

	async function submit(e) {
		e.preventDefault();
		if (!title.trim() || !projectId || saving) return;
		saving = true;
		try {
			await (editing ? saveTask() : createTask());
		} finally {
			saving = false;
		}
	}

	async function createTask() {
		const res = await fetch('/api/tasks', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ projectId, ...payload() })
		});
		if (!res.ok) {
			flash = 'Could not add that task';
			return;
		}
		const created = await res.json();
		const target = projects.find((p) => p.id === projectId);
		if (target) target.tasks.push(created);

		// Keep group, project and priority so a run of related tasks stays quick.
		title = '';
		notes = '';
		due = '';
		notifyAt = '';
		flash = 'Added!';
		setTimeout(() => (flash = ''), 1500);
		onDone(created);
	}

	async function saveTask() {
		const res = await fetch(`/api/tasks/${task.id}`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ ...payload(), projectId })
		});
		if (!res.ok) {
			flash = 'Could not save that task';
			return;
		}
		const updated = await res.json();

		// Mirror the move locally so the board and table agree without a reload.
		const live = findLive(task.id);
		if (live) {
			if (live.project.id === projectId) {
				Object.assign(live.project.tasks[live.idx], updated);
			} else {
				live.project.tasks.splice(live.idx, 1);
				const target = projects.find((p) => p.id === projectId);
				if (target) target.tasks.push(updated);
			}
		}
		onDone(updated);
	}
</script>

{#if appState.groups.length === 0}
	<p class="empty">No groups yet, create one from the nav first.</p>
{:else}
	<form onsubmit={submit}>
		{#if flash}
			<div class="flash">{flash}</div>
		{/if}

		<label class="field">
			<span class="label">Task</span>
			<!-- svelte-ignore a11y_autofocus -->
			<input
				class="input"
				type="text"
				bind:value={title}
				placeholder="What needs doing?"
				autofocus={!editing}
				required
			/>
		</label>

		<label class="field">
			<span class="label">Notes <span class="optional">(optional)</span></span>
			<textarea
				class="input notes"
				bind:value={notes}
				rows="3"
				placeholder="Markdown: **bold**, *italic*, 1. list, [link](url)"
			></textarea>
		</label>

		<div class="field">
			<span class="label">Priority</span>
			<div class="priority-row">
				{#each ['urgent', 'high', 'low'] as p}
					<label class="priority-opt priority-{p}" class:selected={priority === p}>
						<input type="radio" bind:group={priority} value={p} />
						{p}
					</label>
				{/each}
			</div>
		</div>

		<div class="field">
			<span class="label">Group</span>
			<div class="chips">
				{#each appState.groups as g (g.id)}
					<button
						type="button"
						class="chip"
						class:selected={groupId === g.id}
						onclick={() => selectGroup(g.id)}>{g.name}</button
					>
				{/each}
			</div>
		</div>

		<div class="field">
			<span class="label">Project</span>
			{#if projects.length === 0}
				<p class="hint">That group has no projects yet.</p>
			{:else}
				<div class="chips">
					{#each projects as p (p.id)}
						<button
							type="button"
							class="chip"
							class:selected={projectId === p.id}
							onclick={() => (projectId = p.id)}>{p.name}</button
						>
					{/each}
				</div>
			{/if}
		</div>

		<label class="field">
			<span class="label">Due <span class="optional">(optional)</span></span>
			<input class="input" type="datetime-local" bind:value={due} />
		</label>

		<label class="field">
			<span class="label">Notify at <span class="optional">(optional)</span></span>
			<input class="input" type="datetime-local" bind:value={notifyAt} />
		</label>

		{#if editing && task.createdAt}
			<div class="field">
				<span class="label">Created</span>
				<span class="readonly">{formatTS(task.createdAt)}</span>
			</div>
		{/if}

		<div class="actions">
			{#if onCancel}
				<button class="cancel" type="button" onclick={onCancel}>Cancel</button>
			{/if}
			<button class="submit" type="submit" disabled={saving || !projectId}>
				{editing ? 'Save changes' : 'Add task'}
			</button>
		</div>
	</form>
{/if}

<style>
	.empty,
	.hint {
		color: var(--muted);
		font-size: 14px;
		margin: 0;
	}
	.flash {
		background: color-mix(in srgb, var(--c-done) 15%, transparent);
		color: var(--c-done);
		padding: 8px 12px;
		border-radius: 6px;
		font-size: 14px;
	}
	form {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.label {
		font-size: 12px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--muted);
	}
	.optional {
		font-weight: 400;
		text-transform: none;
		letter-spacing: 0;
	}
	.readonly {
		font-size: 14px;
		color: var(--muted);
	}
	.input {
		font-size: 15px;
		padding: 10px 12px;
		border: 1px solid var(--border);
		border-radius: 6px;
		background: var(--surface);
		color: var(--text);
		outline: none;
		width: 100%;
	}
	.input:focus {
		border-color: var(--accent);
	}
	.notes {
		font-family: inherit;
		line-height: 1.5;
		resize: vertical;
		min-height: 68px;
	}

	/* Group and project pickers: one tap, with no dropdown to open first. */
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.chip {
		padding: 7px 12px;
		border: 1px solid var(--border);
		border-radius: 999px;
		background: var(--surface);
		color: var(--muted);
		font: inherit;
		font-size: 14px;
		cursor: pointer;
		white-space: nowrap;
	}
	.chip:hover {
		color: var(--text);
		border-color: var(--muted);
	}
	.chip.selected {
		border-color: var(--accent);
		color: var(--text);
		background: color-mix(in srgb, var(--accent) 18%, transparent);
	}

	.priority-row {
		display: flex;
		gap: 8px;
	}
	.priority-opt {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 9px 4px;
		border: 1px solid var(--border);
		border-radius: 6px;
		font-size: 13px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		cursor: pointer;
		color: var(--muted);
	}
	.priority-opt input {
		display: none;
	}
	.priority-urgent.selected {
		border-color: var(--c-urgent);
		color: var(--c-urgent);
		background: color-mix(in srgb, var(--c-urgent) 12%, transparent);
	}
	.priority-high.selected {
		border-color: var(--c-high);
		color: var(--c-high);
		background: color-mix(in srgb, var(--c-high) 12%, transparent);
	}
	.priority-low.selected {
		border-color: var(--border);
		color: var(--text);
		background: var(--border);
	}

	.actions {
		display: flex;
		gap: 8px;
		margin-top: 4px;
	}
	.submit {
		flex: 1;
		padding: 13px;
		background: var(--accent);
		color: white;
		border: none;
		border-radius: 6px;
		font-size: 15px;
		font-weight: 600;
		cursor: pointer;
	}
	.submit:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.submit:active {
		opacity: 0.85;
	}
	.cancel {
		padding: 13px 16px;
		background: none;
		border: 1px solid var(--border);
		border-radius: 6px;
		color: var(--muted);
		font-size: 15px;
		cursor: pointer;
	}
	.cancel:hover {
		color: var(--text);
	}
</style>
