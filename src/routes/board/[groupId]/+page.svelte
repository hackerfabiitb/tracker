<script>
  import { page } from '$app/state';
  import { appState } from '$lib/data-store.svelte.js';
  import { formatTS, fromDisplay } from '$lib/datetime.js';

  const PRIORITIES = ["urgent", "high", "low"];

  // Columns share the width evenly until they would get too narrow to read,
  // after which they hold this width and the board scrolls sideways instead.
  const COL_MIN = 200;
  const LABEL_W = 30; // .row-label
  const GHOST_W = 120; // keeps "+ project" reachable without scrolling

  let boardWidth = $state(0);

  const group = $derived(appState.groups.find((g) => g.id === page.params.groupId));
  const settings = $derived(appState.settings);

  const colWidth = $derived.by(() => {
    const n = group?.projects.length ?? 0;
    if (!n || !boardWidth) return COL_MIN;
    return Math.max(COL_MIN, Math.floor((boardWidth - LABEL_W - GHOST_W) / n));
  });

  let addingIn = $state(null); // `${projectId}-${priority}`
  let newTitle = $state("");
  let addingProject = $state(false);
  let newProjectName = $state("");
  let expandedDone = $state(new Set());
  let editingNotes = $state(null); // task.id currently being edited
  let notesDraft = $state("");
  let titleFocusVal = ""; // original value on focus, for Escape/empty revert

  function autoresize(node, value) {
    function resize() {
      node.style.height = "auto";
      node.style.height = node.scrollHeight + "px";
    }
    resize();
    node.addEventListener("input", resize);
    return {
      update() {
        resize();
      },
      destroy() {
        node.removeEventListener("input", resize);
      },
    };
  }

  function onTitleFocus(e) {
    titleFocusVal = e.currentTarget.value;
  }

  function findTaskInGroup(taskId) {
    if (!group) return null;
    for (const p of group.projects) {
      const t = p.tasks.find((t) => t.id === taskId);
      if (t) return t;
    }
    return null;
  }

  function saveTitle(e, taskId) {
    const newVal = e.currentTarget.value.trim();
    if (!newVal) {
      e.currentTarget.value = titleFocusVal;
      return;
    }
    if (newVal === titleFocusVal) return;
    const task = findTaskInGroup(taskId);
    if (task) task.title = newVal;
    fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newVal }),
    });
  }

  function handleTitleKey(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      e.currentTarget.blur();
    }
    if (e.key === "Escape") {
      e.currentTarget.value = titleFocusVal;
      e.currentTarget.blur();
    }
  }

  function renderMd(raw) {
    if (!raw) return "";
    let s = raw
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    s = s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/\*(.+?)\*/g, "<em>$1</em>");
    s = s.replace(
      /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener">$1</a>',
    );
    s = s.replace(/((?:^\d+\. .+$\n?)+)/gm, (block) => {
      const items = block
        .trim()
        .split("\n")
        .map((l) => `<li>${l.replace(/^\d+\. /, "")}</li>`)
        .join("");
      return `<ol>${items}</ol>`;
    });
    s = s.replace(/\n/g, "<br>");
    return s;
  }

  function startEditNotes(task) {
    editingNotes = task.id;
    notesDraft = task.notes ?? "";
  }

  function saveNotes(taskId) {
    if (editingNotes !== taskId) return;
    const task = findTaskInGroup(taskId);
    if (task) task.notes = notesDraft;
    editingNotes = null;
    fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes: notesDraft }),
    });
  }

  function tasksFor(project, priority) {
    return project.tasks.filter(
      (t) => t.completed === null && t.priority === priority,
    );
  }

  function doneTasks(project) {
    return project.tasks.filter((t) => t.completed !== null);
  }

  function toggleDoneExpand(projectId) {
    const next = new Set(expandedDone);
    next.has(projectId) ? next.delete(projectId) : next.add(projectId);
    expandedDone = next;
  }

  function toggleComplete(task) {
    task.completed = task.completed ? null : new Date().toISOString();
    fetch(`/api/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed: task.completed }),
    });
  }

  function deleteTask(id) {
    if (!group) return;
    for (const p of group.projects) {
      const idx = p.tasks.findIndex((t) => t.id === id);
      if (idx !== -1) {
        p.tasks.splice(idx, 1);
        break;
      }
    }
    fetch(`/api/tasks/${id}`, { method: "DELETE" });
  }

  async function submitTask(projectId, priority) {
    const title = newTitle.trim();
    if (!title) {
      addingIn = null;
      return;
    }
    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, title, priority }),
    });
    const newTask = await res.json();
    const p = group?.projects.find((p) => p.id === projectId);
    if (p) p.tasks.push(newTask);
    newTitle = "";
    addingIn = null;
  }

  function handleWheel(e) {
    if (e.shiftKey) {
      e.preventDefault();
      e.currentTarget.scrollLeft += e.deltaY;
    }
  }

  async function submitProject(e) {
    e.preventDefault();
    const name = newProjectName.trim();
    if (!name) {
      addingProject = false;
      return;
    }
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ groupId: group.id, name }),
    });
    const newProject = await res.json();
    group.projects.push(newProject);
    newProjectName = "";
    addingProject = false;
  }

  // due and notifyAt are editable straight from the card; createdAt is not.
  // These are text fields, not datetime inputs, because a native picker renders
  // in the browser's locale and cannot be pinned to YYYY-MM-DD.
  let metaFocusVal = "";

  function onMetaFocus(e) {
    metaFocusVal = e.currentTarget.value;
  }

  function onMetaKey(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      e.currentTarget.blur();
    }
    if (e.key === "Escape") {
      e.currentTarget.value = metaFocusVal;
      e.currentTarget.blur();
    }
  }

  function saveDateField(e, task, field) {
    const el = e.currentTarget;
    if (el.value === metaFocusVal) return;

    const iso = fromDisplay(el.value);
    if (iso === undefined) {
      el.value = metaFocusVal; // unparseable, keep what was there
      return;
    }
    task[field] = iso;
    el.value = formatTS(iso); // normalise "2026-9-7" to the canonical form
    fetch(`/api/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: iso }),
    });
  }

  // ── Renaming a project from its column header ───────────────
  let nameFocusVal = "";

  function onNameFocus(e) {
    nameFocusVal = e.currentTarget.value;
  }

  function onNameKey(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      e.currentTarget.blur();
    }
    if (e.key === "Escape") {
      e.currentTarget.value = nameFocusVal;
      e.currentTarget.blur();
    }
  }

  function saveProjectName(e, projectId) {
    const el = e.currentTarget;
    const name = el.value.trim();
    if (!name) {
      el.value = nameFocusVal; // a project with no name is unusable
      return;
    }
    if (name === nameFocusVal) return;

    const project = group?.projects.find((p) => p.id === projectId);
    if (project) project.name = name;
    fetch(`/api/projects/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
  }

  // ── Dragging a card to another project or priority ──────────
  let dropKey = $state(null);

  function onDragStart(e, taskId) {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", taskId);
    // Drag the whole card, not the little grip that started it.
    const card = e.currentTarget.closest(".task-card");
    if (card) e.dataTransfer.setDragImage(card, 12, 12);
  }

  function onDragEnd() {
    dropKey = null;
  }

  function onDragOver(e, projectId, priority) {
    e.preventDefault(); // without this the cell refuses the drop
    e.dataTransfer.dropEffect = "move";
    dropKey = `${projectId}-${priority}`;
  }

  function onDragLeave(e) {
    // Fires when crossing onto a child too, so only clear on a real exit.
    if (!e.currentTarget.contains(e.relatedTarget)) dropKey = null;
  }

  function onDrop(e, projectId, priority) {
    e.preventDefault();
    dropKey = null;
    const taskId = e.dataTransfer.getData("text/plain");
    if (taskId) moveTask(taskId, projectId, priority);
  }

  function moveTask(taskId, projectId, priority) {
    if (!group) return;

    let from = null;
    for (const p of group.projects) {
      const idx = p.tasks.findIndex((t) => t.id === taskId);
      if (idx !== -1) {
        from = { project: p, idx };
        break;
      }
    }
    if (!from) return;

    const task = from.project.tasks[from.idx];
    if (from.project.id === projectId && task.priority === priority) return;

    task.priority = priority;
    if (from.project.id !== projectId) {
      from.project.tasks.splice(from.idx, 1);
      group.projects.find((p) => p.id === projectId)?.tasks.push(task);
    }

    fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ priority, projectId }),
    });
  }
</script>

{#if group}
<main>
  <div
    class="board-wrap"
    onwheel={handleWheel}
    bind:clientWidth={boardWidth}
    style="--col-w: {colWidth}px"
  >
    <!-- ── Column headers (scroll left-right with columns) ─────── -->
    <div class="brow header-row">
      <div class="row-label"></div>
      {#each group.projects as project (project.id)}
        <div class="col-head">
          <input
            class="col-head-input"
            value={project.name}
            onfocus={onNameFocus}
            onblur={(e) => saveProjectName(e, project.id)}
            onkeydown={onNameKey}
          />
        </div>
      {/each}
      <div class="col-head ghost-head">
        {#if addingProject}
          <form onsubmit={submitProject}>
            <!-- svelte-ignore a11y_autofocus -->
            <input
              class="add-input"
              bind:value={newProjectName}
              placeholder="Project name…"
              onkeydown={(e) => {
                if (e.key === "Escape") addingProject = false;
              }}
              autofocus
            />
          </form>
        {:else}
          <button
            class="ghost-btn"
            onclick={() => {
              addingProject = true;
              newProjectName = "";
            }}
          >
            + project
          </button>
        {/if}
      </div>
    </div>

    <!-- ── Priority rows ─────────────────────────────────────────── -->
    {#each PRIORITIES as priority}
      <div class="brow priority-row">
        <!-- sticky label on the left -->
        <div class="row-label label-{priority}">{priority}</div>

        {#each group.projects as project (project.id)}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            class="cell"
            class:drop-target={dropKey === `${project.id}-${priority}`}
            ondragover={(e) => onDragOver(e, project.id, priority)}
            ondragleave={onDragLeave}
            ondrop={(e) => onDrop(e, project.id, priority)}
          >
            {#if addingIn === `${project.id}-${priority}`}
              <form
                class="add-form"
                onsubmit={(e) => {
                  e.preventDefault();
                  submitTask(project.id, priority);
                }}
              >
                <!-- svelte-ignore a11y_autofocus -->
                <input
                  class="add-input"
                  bind:value={newTitle}
                  placeholder="Task title…"
                  onkeydown={(e) => {
                    if (e.key === "Escape") addingIn = null;
                  }}
                  autofocus
                />
              </form>
            {:else}
              <button
                class="add-btn"
                onclick={() => {
                  addingIn = `${project.id}-${priority}`;
                  newTitle = "";
                }}>+ ADD</button
              >
            {/if}

            {#each tasksFor(project, priority) as task (task.id)}
              <div class="task-card">
                <div class="task-top">
                  <input
                    type="checkbox"
                    checked={!!task.completed}
                    onchange={() => toggleComplete(task)}
                  />
                  <textarea
                    class="task-title"
                    use:autoresize={task.title}
                    value={task.title}
                    rows="1"
                    onfocus={onTitleFocus}
                    onblur={(e) => saveTitle(e, task.id)}
                    onkeydown={handleTitleKey}
                  ></textarea>
                  <div class="task-actions">
                    <span
                      class="task-grip"
                      role="button"
                      tabindex="-1"
                      aria-label="Drag to another project or priority"
                      title="Drag to another project or priority"
                      draggable="true"
                      ondragstart={(e) => onDragStart(e, task.id)}
                      ondragend={onDragEnd}
                    >
                      <svg viewBox="0 0 10 14" width="10" height="14" aria-hidden="true">
                        <circle cx="2.5" cy="2.5" r="1.3" />
                        <circle cx="7.5" cy="2.5" r="1.3" />
                        <circle cx="2.5" cy="7" r="1.3" />
                        <circle cx="7.5" cy="7" r="1.3" />
                        <circle cx="2.5" cy="11.5" r="1.3" />
                        <circle cx="7.5" cy="11.5" r="1.3" />
                      </svg>
                    </span>
                    <button
                      class="task-del"
                      aria-label="Delete task"
                      title="Delete task"
                      onclick={() => deleteTask(task.id)}>×</button
                    >
                  </div>
                </div>
                {#if editingNotes === task.id}
                  <!-- svelte-ignore a11y_autofocus -->
                  <textarea
                    class="notes-input"
                    bind:value={notesDraft}
                    placeholder="Notes (markdown: **bold**, *italic*, 1. list, [link](url))…"
                    onblur={() => saveNotes(task.id)}
                    onkeydown={(e) => {
                      if (e.key === "Escape") {
                        editingNotes = null;
                      }
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        e.currentTarget.blur();
                      }
                    }}
                    autofocus
                  ></textarea>
                {:else if task.notes}
                  <div
                    class="notes-rendered"
                    style="--notes-lines: {settings.notesMaxLines}"
                    onclick={() => startEditNotes(task)}
                  >
                    {@html renderMd(task.notes)}
                  </div>
                {:else}
                  <button class="notes-add" onclick={() => startEditNotes(task)}
                    >+ notes</button
                  >
                {/if}

                <div class="task-meta">
                  <label class="meta-row">
                    <span class="meta-key">due</span>
                    <input
                      class="meta-input"
                      class:overdue={task.due && new Date(task.due) < new Date()}
                      type="text"
                      inputmode="numeric"
                      placeholder="YYYY-MM-DD HH:MM"
                      value={formatTS(task.due)}
                      onfocus={onMetaFocus}
                      onblur={(e) => saveDateField(e, task, "due")}
                      onkeydown={onMetaKey}
                    />
                  </label>
                  <label class="meta-row">
                    <span class="meta-key">notify</span>
                    <input
                      class="meta-input"
                      type="text"
                      inputmode="numeric"
                      placeholder="YYYY-MM-DD HH:MM"
                      value={formatTS(task.notifyAt)}
                      onfocus={onMetaFocus}
                      onblur={(e) => saveDateField(e, task, "notifyAt")}
                      onkeydown={onMetaKey}
                    />
                  </label>
                  <div class="meta-row">
                    <span class="meta-key">made</span>
                    <span class="meta-static">{formatTS(task.createdAt)}</span>
                  </div>
                </div>
              </div>
            {/each}
          </div>
        {/each}

        <div class="cell ghost-cell"></div>
      </div>
    {/each}

    <!-- ── Done row ───────────────────────────────────────────────── -->
    {#if group.projects.some((p) => doneTasks(p).length > 0)}
      <div class="brow done-row">
        <div class="row-label label-done">done</div>
        {#each group.projects as project (project.id)}
          <div class="cell">
            {#if doneTasks(project).length > 0}
              <button
                class="done-toggle"
                onclick={() => toggleDoneExpand(project.id)}
              >
                {doneTasks(project).length} done
                {expandedDone.has(project.id) ? "▴" : "▾"}
              </button>
              {#if expandedDone.has(project.id)}
                {#each doneTasks(project) as task (task.id)}
                  <div class="task-card done-card">
                    <input
                      type="checkbox"
                      checked={true}
                      onchange={() => toggleComplete(task)}
                    />
                    <span class="task-title">{task.title}</span>
                    <span class="task-due">{formatTS(task.completed)}</span>
                    <button class="task-del" onclick={() => deleteTask(task.id)}
                      >×</button
                    >
                  </div>
                {/each}
              {/if}
            {/if}
          </div>
        {/each}
        <div class="cell ghost-cell"></div>
      </div>
    {/if}
  </div>
</main>
{/if}

<style>
  main {
    padding: 0;
    height: calc(100vh - 42px);
    overflow: hidden;
  }

  /* Single scroll container for both axes */
  .board-wrap {
    height: 100%;
    overflow: auto;
  }

  /* Every row is a flex line. max-content makes the row box span the full
     scrollable width, so its border reaches past the right edge of the
     viewport instead of stopping where the visible area ends. */
  .brow {
    display: flex;
    align-items: stretch;
    width: max-content;
    min-width: 100%;
  }

  /* ── Column header row ─────────────────────────────────────── */
  .header-row {
    border-bottom: 2px solid var(--border);
    position: sticky;
    top: 0;
    z-index: 3;
    background: var(--bg);
  }

  .col-head {
    width: var(--col-w, 240px);
    flex-shrink: 0;
    padding: 8px 12px;
    font-weight: 600;
    font-size: 14px;
    display: flex;
    align-items: center;
  }
  /* Reads as the heading it replaces until it is clicked into. */
  .col-head-input {
    width: 100%;
    min-width: 0;
    background: none;
    border: 1px solid transparent;
    border-radius: 3px;
    font: inherit;
    color: inherit;
    padding: 2px 4px;
    margin: -2px -4px;
    cursor: text;
  }
  .col-head-input:hover {
    border-color: var(--border);
  }
  .col-head-input:focus {
    border-color: var(--accent);
    background: var(--bg);
    outline: none;
  }

  .ghost-head {
    font-weight: 400;
    color: var(--muted);
    min-width: 120px;
  }
  .ghost-btn {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 14px;
    color: var(--muted);
    padding: 0;
    white-space: nowrap;
  }
  .ghost-btn:hover {
    color: var(--text);
  }

  /* ── Priority rows ─────────────────────────────────────────── */
  .priority-row {
    /* equal height: each row gets 1/3 of (board-wrap − header-row) */
    min-height: calc((100vh - 42px - 37px) / 3);
    border-bottom: 1px solid var(--border);
  }

  /* ── Sticky row label (left side) ─────────────────────────── */
  .row-label {
    width: 30px;
    flex-shrink: 0;
    position: sticky;
    left: 0;
    z-index: 2;
    background: var(--bg);
    box-shadow: 1px 0 0 var(--border);
    padding: 0;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--muted);
    display: flex;
    align-items: center;
    justify-content: center;
    writing-mode: vertical-rl;
    transform: rotate(180deg);
  }
  /* header-row corner: needs to sit above priority labels */
  .header-row .row-label {
    z-index: 4;
    writing-mode: initial;
    transform: none;
  }

  .label-urgent {
    color: var(--c-urgent);
  }
  .label-high {
    color: var(--c-high);
  }
  .label-low {
    color: var(--muted);
  }
  .label-done {
    color: var(--c-done);
  }

  /* ── Task cells ────────────────────────────────────────────── */
  .cell {
    width: var(--col-w, 240px);
    flex-shrink: 0;
    padding: 8px 10px;
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .ghost-cell {
    flex: 1;
    min-width: 40px;
  }

  /* ── Task cards (floating boxes) ───────────────────────────── */
  .task-card {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 6px 8px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 5px;
    font-size: 14px;
    line-height: 1.4;
    flex-shrink: 0;
  }
  .task-card:hover {
    border-color: var(--muted);
  }
  .done-card {
    opacity: 0.5;
  }
  .done-card .task-title {
    text-decoration: line-through;
  }
  .task-top {
    display: flex;
    align-items: flex-start;
    gap: 6px;
  }
  .task-top input[type="checkbox"] {
    margin-top: 3px;
    flex-shrink: 0;
    cursor: pointer;
  }
  .task-title {
    flex: 1;
    min-width: 0;
    width: 100%;
    background: none;
    border: none;
    outline: none;
    font: inherit;
    color: inherit;
    padding: 0;
    cursor: text;
    resize: none;
    overflow: hidden;
    line-height: inherit;
  }
  .task-title:focus {
    background: var(--bg);
    border-radius: 2px;
    outline: 1px solid var(--accent);
    outline-offset: 2px;
  }
  .task-due {
    font-size: 11px;
    color: var(--muted);
    white-space: nowrap;
    align-self: center;
    flex-shrink: 0;
  }

  /* ── Per-card dates ────────────────────────────────────────── */
  /* Hidden until the card is hovered, same as the notes button, so three date
     rows do not dominate a resting card. focus-within keeps them open while a
     field is actually being edited and the pointer wanders off. */
  .task-meta {
    display: none;
    flex-direction: column;
    gap: 1px;
    font-size: 11px;
    color: var(--muted);
  }
  .task-card:hover .task-meta,
  .task-card:focus-within .task-meta {
    display: flex;
  }
  /* No hover on touch, so there would be no way to reach these at all. */
  @media (hover: none) {
    .task-meta {
      display: flex;
    }
  }
  .meta-row {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }
  .meta-key {
    width: 38px;
    flex-shrink: 0;
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  /* Reads as text until hovered, so three date rows per card stay quiet. */
  .meta-input {
    flex: 1;
    min-width: 0;
    background: none;
    border: 1px solid transparent;
    border-radius: 3px;
    color: var(--muted);
    font: inherit;
    padding: 1px 2px;
    cursor: pointer;
  }
  .meta-input:hover {
    border-color: var(--border);
    color: var(--text);
  }
  .meta-input:focus {
    border-color: var(--accent);
    color: var(--text);
    outline: none;
  }
  .meta-input.overdue {
    color: var(--c-urgent);
  }
  .meta-static {
    flex: 1;
    min-width: 0;
    padding: 1px 2px;
  }
  /* Grip on top, delete beneath it, both in the card's top corner. */
  .task-actions {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
    flex-shrink: 0;
    align-self: flex-start;
  }

  /* Six dots, the usual "pick me up" affordance. */
  .task-grip {
    visibility: hidden;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    padding: 0 1px;
    cursor: grab;
    color: var(--muted);
  }
  .task-grip:active {
    cursor: grabbing;
  }
  .task-grip svg {
    display: block;
    fill: currentColor;
  }
  .task-card:hover .task-grip {
    visibility: visible;
  }
  .task-grip:hover {
    color: var(--text);
  }
  @media (hover: none) {
    .task-grip {
      visibility: visible;
    }
  }

  /* Where a dragged card would land. */
  .cell.drop-target {
    background: color-mix(in srgb, var(--accent) 10%, transparent);
    outline: 1px dashed var(--accent);
    outline-offset: -3px;
  }

  .task-del {
    visibility: hidden;
    background: none;
    border: none;
    cursor: pointer;
    color: var(--muted);
    font-size: 14px;
    padding: 0 1px;
    line-height: 1;
    flex-shrink: 0;
  }
  .task-del:hover {
    color: var(--c-urgent);
  }
  .task-card:hover .task-del {
    visibility: visible;
  }
  @media (hover: none) {
    .task-del {
      visibility: visible;
    }
  }

  /* ── Notes field ───────────────────────────────────────────── */
  .notes-input {
    width: 100%;
    min-height: 58px;
    resize: vertical;
    font-family: inherit;
    font-size: 12px;
    line-height: 1.5;
    padding: 4px 6px;
    border: 1px solid var(--accent);
    border-radius: 3px;
    background: var(--bg);
    color: var(--text);
    outline: none;
  }
  .notes-rendered {
    font-size: 12px;
    line-height: 1.5;
    color: var(--muted);
    cursor: text;
    padding: 1px 0;
    overflow-wrap: break-word;
    word-break: break-word;
    min-width: 0;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: var(--notes-lines, 3);
    overflow: hidden;
  }
  .notes-rendered:hover {
    color: var(--text);
  }
  .notes-rendered :global(strong) {
    font-weight: 600;
    color: var(--text);
  }
  .notes-rendered :global(em) {
    font-style: italic;
  }
  .notes-rendered :global(a) {
    color: var(--accent);
    text-decoration: none;
  }
  .notes-rendered :global(a:hover) {
    text-decoration: underline;
  }
  .notes-rendered :global(ol) {
    margin: 2px 0 2px 16px;
  }
  .notes-rendered :global(li) {
    margin: 1px 0;
  }
  .notes-add {
    display: none;
    background: none;
    border: none;
    cursor: pointer;
    font-size: 11px;
    color: var(--muted);
    padding: 0;
    text-align: left;
  }
  .task-card:hover .notes-add {
    display: block;
  }
  .notes-add:hover {
    color: var(--text);
  }

  /* ── Add task button / form ────────────────────────────────── */
  .add-btn {
    display: block;
    width: 100%;
    text-align: left;
    background: none;
    border: none;
    cursor: pointer;
    font-size: 13px;
    color: var(--muted);
    padding: 13px 2px;
    border-radius: 3px;
    flex-shrink: 0;
  }
  .add-btn:hover {
    color: var(--text);
    background: var(--surface);
  }
  .add-form {
    flex-shrink: 0;
  }
  .add-input {
    width: 100%;
    font-size: 14px;
    padding: 4px 6px;
    border: 1px solid var(--accent);
    border-radius: 3px;
    outline: none;
    background: var(--bg);
    color: var(--text);
  }

  /* ── Done row ──────────────────────────────────────────────── */
  .done-row {
    border-top: 1px solid var(--border);
  }
  .done-toggle {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 13px;
    color: var(--muted);
    padding: 6px 2px;
    text-align: left;
    width: 100%;
    flex-shrink: 0;
  }
  .done-toggle:hover {
    color: var(--text);
  }
</style>
