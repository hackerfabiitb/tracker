<script>
	import { appState } from '$lib/data-store.svelte.js';
	import { formatDue, formatTS } from '$lib/datetime.js';
	import TaskForm from '$lib/TaskForm.svelte';

	let sortCol = $state('priority');
	let sortDir = $state(1);
	let hideDone = $state(false);
	let editingTask = $state(null);
	let dialog = $state(null);

	const PRIORITY_ORDER = { urgent: 0, high: 1, low: 2 };

	function priorityRank(task) {
		if (task.completed) return 3;
		return PRIORITY_ORDER[task.priority] ?? 2;
	}

	const allTasks = $derived.by(() => {
		const tasks = [];
		for (const g of appState.groups) {
			for (const p of g.projects) {
				for (const t of p.tasks) {
					tasks.push({ ...t, projectId: p.id, projectName: p.name, groupId: g.id, groupName: g.name });
				}
			}
		}
		return tasks;
	});

	let sorted = $derived.by(() => {
		let tasks = hideDone ? allTasks.filter((t) => !t.completed) : [...allTasks];
		tasks.sort((a, b) => {
			let cmp = 0;
			if (sortCol === 'title') cmp = a.title.localeCompare(b.title);
			else if (sortCol === 'priority') cmp = priorityRank(a) - priorityRank(b);
			else if (sortCol === 'project') cmp = a.projectName.localeCompare(b.projectName);
			else if (sortCol === 'group') cmp = a.groupName.localeCompare(b.groupName);
			else if (sortCol === 'due') {
				const da = a.due ? new Date(a.due).getTime() : Infinity;
				const db = b.due ? new Date(b.due).getTime() : Infinity;
				cmp = da - db;
			} else if (sortCol === 'notifyAt') {
				const da = a.notifyAt ? new Date(a.notifyAt).getTime() : Infinity;
				const db = b.notifyAt ? new Date(b.notifyAt).getTime() : Infinity;
				cmp = da - db;
			} else if (sortCol === 'createdAt') {
				cmp = new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime();
			}
			return cmp * sortDir;
		});
		return tasks;
	});

	function setSort(col) {
		if (sortCol === col) sortDir = -sortDir;
		else { sortCol = col; sortDir = 1; }
	}

	function arrow(col) {
		if (sortCol !== col) return '';
		return sortDir === 1 ? ' ▴' : ' ▾';
	}

	function findTaskInState(taskId) {
		for (const g of appState.groups) {
			for (const p of g.projects) {
				const t = p.tasks.find((t) => t.id === taskId);
				if (t) return t;
			}
		}
		return null;
	}

	function toggleComplete(task) {
		const t = findTaskInState(task.id);
		if (!t) return;
		t.completed = t.completed ? null : new Date().toISOString();
		fetch(`/api/tasks/${t.id}`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ completed: t.completed })
		});
	}

	function deleteTask(id) {
		for (const g of appState.groups) {
			for (const p of g.projects) {
				const idx = p.tasks.findIndex((t) => t.id === id);
				if (idx !== -1) {
					p.tasks.splice(idx, 1);
					fetch(`/api/tasks/${id}`, { method: 'DELETE' });
					return;
				}
			}
		}
	}

	// The row itself opens the editor, so anything already clickable inside it
	// has to keep its own behaviour: the done checkbox, delete, the project link.
	function onRowClick(e, id) {
		if (e.target.closest('input, button, a')) return;
		openEdit(id);
	}

	function onRowKey(e, id) {
		if (e.target !== e.currentTarget) return;
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			openEdit(id);
		}
	}

	// Rows are flattened copies, so edit the live task from the store instead.
	function openEdit(id) {
		const live = findTaskInState(id);
		if (!live) return;
		editingTask = live;
		dialog?.showModal();
	}

	function closeEdit() {
		dialog?.close();
	}

	// A native dialog does not close on a backdrop click; the target is the
	// dialog itself only when the click misses the content inside it.
	function onDialogClick(e) {
		if (e.target === dialog) closeEdit();
	}
</script>

<main>
	<div class="toolbar">
		<h2 class="page-title">Table</h2>
		<label class="hide-done">
			<input type="checkbox" bind:checked={hideDone} />
			hide done
		</label>
	</div>

	{#if sorted.length === 0}
		<p class="empty">No tasks.</p>
	{:else}
		<div class="table-wrap">
		<table>
			<thead>
				<tr>
					<th class="col-check"></th>
					<th class="col-priority sortable" onclick={() => setSort('priority')}
						><span class="th-full">Priority</span><span class="th-short">Pri</span>{arrow('priority')}</th
					>
					<th class="col-due sortable" onclick={() => setSort('due')}>Due{arrow('due')}</th>
					<th class="col-group sortable" onclick={() => setSort('group')}>Group{arrow('group')}</th>
					<th class="col-project sortable" onclick={() => setSort('project')}>Project{arrow('project')}</th>
					<th class="col-title sortable" onclick={() => setSort('title')}>Title{arrow('title')}</th>
					<th class="col-ts sortable" onclick={() => setSort('notifyAt')}>Notify{arrow('notifyAt')}</th>
					<th class="col-ts">Completed</th>
					<th class="col-ts sortable" onclick={() => setSort('createdAt')}>Created{arrow('createdAt')}</th>
					<th class="col-actions"></th>
				</tr>
			</thead>
			<tbody>
				{#each sorted as task (task.id)}
					<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions, a11y_no_noninteractive_tabindex -->
					<tr
						class:done={!!task.completed}
						tabindex="0"
						onclick={(e) => onRowClick(e, task.id)}
						onkeydown={(e) => onRowKey(e, task.id)}
					>
						<td class="col-check">
							<input
								type="checkbox"
								checked={!!task.completed}
								onchange={() => toggleComplete(task)}
							/>
						</td>
						<td class="col-priority">
							{#if !task.completed}
								<span class="badge badge-{task.priority}" title={task.priority}
									><span class="badge-text">{task.priority}</span></span
								>
							{/if}
						</td>
						<td
							class="col-due"
							class:overdue={task.due && !task.completed && new Date(task.due) < new Date()}
						>{formatDue(task.due)}</td>
						<td class="col-group">{task.groupName}</td>
						<td class="col-project">
							<a href="/board/{task.groupId}">{task.projectName}</a>
						</td>
						<td class="col-title">{task.title}</td>
						<td class="col-ts">{formatTS(task.notifyAt)}</td>
						<td class="col-ts">{formatTS(task.completed)}</td>
						<td class="col-ts">{formatTS(task.createdAt)}</td>
						<td class="col-actions">
							<button
								class="row-btn"
								title="Delete task"
								aria-label="Delete task"
								onclick={() => deleteTask(task.id)}>×</button
							>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
		</div>
	{/if}

	<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
	<dialog bind:this={dialog} class="edit-dialog" onclose={() => (editingTask = null)} onclick={onDialogClick}>
		{#if editingTask}
			<h3 class="dialog-title">Edit task</h3>
			{#key editingTask.id}
				<TaskForm task={editingTask} onDone={closeEdit} onCancel={closeEdit} />
			{/key}
		{/if}
	</dialog>
</main>

<style>
	main {
		padding: 16px;
	}
	.toolbar {
		display: flex;
		align-items: baseline;
		gap: 16px;
		margin-bottom: 12px;
	}
	.page-title {
		font-size: 18px;
		font-weight: 600;
	}
	.hide-done {
		font-size: 13px;
		color: var(--muted);
		display: flex;
		align-items: center;
		gap: 5px;
		cursor: pointer;
	}
	.empty {
		color: var(--muted);
	}
	.table-wrap {
		overflow-x: auto;
		-webkit-overflow-scrolling: touch;
	}
	table {
		border-collapse: collapse;
		width: 100%;
		min-width: 500px;
		font-size: 14px;
	}
	thead th {
		text-align: left;
		padding: 5px 10px;
		font-size: 11px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--muted);
		border-bottom: 1px solid var(--border);
		white-space: nowrap;
	}
	th.sortable {
		cursor: pointer;
		user-select: none;
	}
	th.sortable:hover {
		color: var(--text);
	}
	tbody tr {
		border-bottom: 1px solid var(--border);
		cursor: pointer;
	}
	tbody tr:hover {
		background: var(--surface);
	}
	tbody tr:focus-visible {
		outline: 1px solid var(--accent);
		outline-offset: -1px;
	}
	tbody tr:hover .row-btn {
		visibility: visible;
	}
	tbody td {
		padding: 5px 10px;
		vertical-align: middle;
		/* Everything but the title is context, so let the title carry the row. */
		color: var(--muted);
	}
	tbody .col-title {
		color: var(--text);
	}
	tr.done td {
		color: var(--muted);
	}
	tr.done .col-title {
		text-decoration: line-through;
	}
	.col-check {
		width: 24px;
		padding-right: 4px;
	}
	.col-check input {
		cursor: pointer;
	}
	/* Each column shrinks to its own content and the title column absorbs the
	   slack. Under automatic table layout, width:1% on a nowrap cell means
	   "as narrow as the text allows". */
	.col-priority,
	.col-due,
	.col-ts,
	.col-group,
	.col-project {
		width: 1%;
		white-space: nowrap;
	}
	.col-title {
		width: auto;
	}
	.col-due,
	.col-ts {
		font-size: 12px;
	}
	.col-due.overdue {
		color: var(--c-urgent);
	}
	.col-actions {
		width: 1%;
		white-space: nowrap;
		padding-left: 4px;
		text-align: right;
	}
	.row-btn {
		visibility: hidden;
		background: none;
		border: none;
		cursor: pointer;
		color: var(--muted);
		font-size: 15px;
		padding: 0 3px;
		line-height: 1;
	}
	.row-btn:hover {
		color: var(--text);
	}
	@media (hover: none) {
		.row-btn { visibility: visible; }
	}

	.edit-dialog {
		width: min(480px, calc(100vw - 32px));
		max-height: calc(100vh - 64px);
		overflow-y: auto;
		padding: 20px;
		border: 1px solid var(--border);
		border-radius: 10px;
		background: var(--bg);
		color: var(--text);
	}
	.edit-dialog::backdrop {
		background: rgb(0 0 0 / 0.6);
	}
	.dialog-title {
		font-size: 16px;
		font-weight: 600;
		margin-bottom: 16px;
	}
	.col-project a {
		color: inherit;
		text-decoration: none;
	}
	.col-project a:hover {
		color: var(--accent);
	}
	.badge {
		display: inline-block;
		font-size: 11px;
		font-weight: 600;
		padding: 1px 6px;
		border-radius: 3px;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--badge-color);
		background: color-mix(in srgb, var(--badge-color) 12%, transparent);
	}
	.badge-urgent {
		--badge-color: var(--c-urgent);
	}
	.badge-high {
		--badge-color: var(--c-high);
	}
	.badge-low {
		--badge-color: var(--muted);
	}
	.th-short {
		display: none;
	}

	/* Narrow screens: the priority reads as a colour alone, which costs a
	   fraction of the width the word needs. The title attribute keeps it
	   readable on long press and to a screen reader. */
	@media (max-width: 600px) {
		.th-full {
			display: none;
		}
		.th-short {
			display: inline;
		}
		.badge-text {
			display: none;
		}
		.badge {
			width: 11px;
			height: 11px;
			padding: 0;
			background: var(--badge-color);
		}
	}
</style>
