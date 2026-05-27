<script lang="ts">
	import { asset } from '$app/paths';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={asset('/favicon.ico')} />
</svelte:head>

{@render children()}
