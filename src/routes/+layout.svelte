<script>
	import '../app.css';
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { appState } from '$lib/data-store.svelte.js';

	let { data, children } = $props();

	// Initialize store from SSR data on first load
	appState.groups = data.groups;
	appState.settings = data.settings;

	let addingGroup = $state(false);
	let newGroupName = $state('');
	let renamingGroup = $state(null); // group id being renamed
	let renameDraft = $state('');

	// Double click renames. The first of the two clicks still follows the link,
	// so you land on the group you are renaming, which is where you want to be.
	function startRename(e, group) {
		e.preventDefault(); // stops the dblclick selecting the label text
		renamingGroup = group.id;
		renameDraft = group.name;
	}

	async function commitRename(id) {
		const name = renameDraft.trim();
		renamingGroup = null;
		const group = appState.groups.find((g) => g.id === id);
		if (!group || !name || name === group.name) return;

		group.name = name;
		await fetch(`/api/groups/${id}`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name })
		});
	}

	// Others edit the same data, so pick up their changes whenever this tab
	// comes back into view. Pages look tasks up by id, so swapping the tree
	// underneath them is safe.
	onMount(() => {
		async function refresh() {
			if (document.visibilityState !== 'visible' || page.url.pathname === '/login') return;
			try {
				const res = await fetch('/api/data');
				// An expired session redirects to the login page's HTML
				if (!res.ok || res.redirected) return;
				appState.groups = (await res.json()).groups;
			} catch {}
		}
		document.addEventListener('visibilitychange', refresh);
		return () => document.removeEventListener('visibilitychange', refresh);
	});

	async function submitGroup(e) {
		e.preventDefault();
		const name = newGroupName.trim();
		if (!name) {
			addingGroup = false;
			return;
		}
		const res = await fetch('/api/groups', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name })
		});
		const newGroup = await res.json();
		appState.groups.push(newGroup);
		newGroupName = '';
		addingGroup = false;
	}
</script>

{#if page.url.pathname !== '/login'}
<nav>
	<a href="/" class:active={page.url.pathname === '/'}>Table</a>
	{#each appState.groups as group (group.id)}
		{#if renamingGroup === group.id}
			<!-- svelte-ignore a11y_autofocus -->
			<input
				class="nav-input"
				bind:value={renameDraft}
				onblur={() => commitRename(group.id)}
				onkeydown={(e) => {
					if (e.key === 'Enter') e.currentTarget.blur();
					if (e.key === 'Escape') { renamingGroup = null; }
				}}
				autofocus
			/>
		{:else}
			<a
				href="/board/{group.id}"
				class:active={page.params.groupId === group.id}
				ondblclick={(e) => startRename(e, group)}
				title="Double click to rename">{group.name}</a
			>
		{/if}
	{/each}
	{#if addingGroup}
		<form class="nav-form" onsubmit={submitGroup}>
			<!-- svelte-ignore a11y_autofocus -->
			<input
				class="nav-input"
				bind:value={newGroupName}
				placeholder="Group name…"
				onkeydown={(e) => { if (e.key === 'Escape') addingGroup = false; }}
				onblur={() => (addingGroup = false)}
				autofocus
			/>
		</form>
	{:else}
		<button class="nav-btn" onclick={() => { addingGroup = true; newGroupName = ''; }}>+ group</button>
	{/if}
	<span class="spacer"></span>
	<a href="/add" class="nav-add">+ Add</a>
	<a href="/api/backup" class="nav-btn" download>⬇ backup</a>
	<a href="/logout" class="nav-btn">logout</a>
</nav>
{/if}

{@render children()}
