<script>
	import TaskForm from '$lib/TaskForm.svelte';
</script>

<main>
	<h2 class="page-title">Quick add</h2>
	<TaskForm />
</main>

<style>
	main {
		padding: 20px 16px;
		max-width: 480px;
	}
	.page-title {
		font-size: 18px;
		font-weight: 600;
		margin-bottom: 20px;
	}
</style>
