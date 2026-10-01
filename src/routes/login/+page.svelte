<script>
	import { enhance } from '$app/forms';
	let { form } = $props();
</script>

<div class="login-wrap">
	<form method="POST" use:enhance class="login-form">
		<h1>Tracker</h1>
		{#if form?.error}
			<p class="error">{form.error}</p>
		{/if}
		<input
			type="email"
			name="email"
			placeholder="Email"
			autocomplete="username"
			value={form?.email ?? ''}
			required
			autofocus
		/>
		<input
			type="password"
			name="password"
			placeholder="Password"
			autocomplete="current-password"
			required
		/>
		<button type="submit">Log in</button>
	</form>
</div>

<style>
	.login-wrap {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 100vh;
	}

	.login-form {
		display: flex;
		flex-direction: column;
		gap: 12px;
		width: 280px;
	}

	h1 {
		font-size: 18px;
		font-weight: 600;
		color: var(--text);
		margin: 0 0 4px;
	}

	input {
		background: var(--surface);
		border: 1px solid var(--border);
		color: var(--text);
		padding: 8px 10px;
		font-size: 15px;
		border-radius: 6px;
		outline: none;
	}

	input:focus {
		border-color: var(--accent);
	}

	button {
		background: var(--accent);
		color: #fff;
		border: none;
		padding: 9px;
		font-size: 15px;
		font-weight: 500;
		border-radius: 6px;
		cursor: pointer;
	}

	button:hover {
		opacity: 0.9;
	}

	.error {
		color: var(--c-urgent);
		font-size: 13px;
		margin: 0;
	}
</style>
