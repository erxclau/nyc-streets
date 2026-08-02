<script lang="ts">
	import { onMount, tick } from 'svelte';

	import type { FeatureSelector } from 'mapbox-gl';
	import mapboxgl from 'mapbox-gl/esm';
	import 'mapbox-gl/dist/mapbox-gl.css';

	import metadata from '$lib/assets/metadata.json';
	import { PUBLIC_MAPBOX_TOKEN } from '$env/static/public';
	import { SvelteSet } from 'svelte/reactivity';
	import length from '@turf/length';
	import { ascending, rollup, rollups, sum } from 'd3-array';

	let { data } = $props();

	const localStorageKey = 'nyc-streets-object-ids';
	const modalId = 'confirm-reset-progress';

	const abbreviations = {
		st: 'street',
		blvd: 'boulevard',
		pl: 'place',
		av: 'avenue',
		ave: 'avenue',
		sq: 'square',
		dr: 'drive',
		w: 'west',
		s: 'south',
		n: 'north',
		e: 'east'
	};

	const expandStreet = (attempt: string) => {
		let expanded = attempt;
		const suffix = /.+ (st|blvd|pl|av|ave|sq|dr)$/;
		const suffixMatch = suffix.exec(attempt);
		if (suffixMatch !== null && suffixMatch.at(1) !== undefined) {
			expanded =
				attempt.substring(0, attempt.lastIndexOf(suffixMatch[1])) +
				abbreviations[suffixMatch[1] as keyof typeof abbreviations];
		}

		return expanded;
	};

	const expand = (attempt: string) => {
		let expanded = attempt;
		const prefix = /^(av|ave|n|s|e|w) .+$/;
		const prefixMatch = prefix.exec(attempt);
		if (prefixMatch !== null && prefixMatch.at(1) !== undefined) {
			expanded =
				abbreviations[prefixMatch[1] as keyof typeof abbreviations] +
				attempt.substring(prefixMatch[1].length);
		}

		const suffixDirection = /^.+ (n|s|e|w)$/;
		const suffixDirectionMatch = suffixDirection.exec(expanded);
		if (suffixDirectionMatch !== null && suffixDirectionMatch.at(1) !== undefined) {
			expanded =
				expandStreet(attempt.substring(0, attempt.lastIndexOf(suffixDirectionMatch[1]) - 1)) +
				' ' +
				abbreviations[suffixDirectionMatch[1] as keyof typeof abbreviations];
		} else {
			expanded = expandStreet(expanded);
		}

		return expanded;
	};

	const boroughCodes = {
		1: 'Manhattan',
		2: 'The Bronx',
		3: 'Brooklyn',
		4: 'Queens',
		5: 'Staten Island'
	} as const;

	const numberFormat = Intl.NumberFormat('en-US', {
		maximumFractionDigits: 0
	});

	let ref: HTMLDivElement;
	let map: mapboxgl.Map;

	// eslint-disable-next-line svelte/no-unnecessary-state-wrap
	let objectIds: SvelteSet<number> = $state(new SvelteSet());

	const identifiedFeatures = $derived(data.nyc.filter((d) => objectIds.has(d.properties.OBJECTID)));

	const { identifiedMiles, boroughLengths } = $derived.by(() => {
		const objectLengths = identifiedFeatures.map((d) => {
			return {
				length: length(d, { units: 'miles' }),
				borough:
					boroughCodes[+d.properties.StreetCode.toString().charAt(0) as keyof typeof boroughCodes]
			};
		});

		return {
			identifiedMiles: sum(objectLengths, (d) => d.length),
			boroughLengths: rollup(
				objectLengths,
				(v) => sum(v, (o) => o.length),
				(d) => d.borough
			)
		};
	});

	const identifiedStreets = $derived(
		rollups(
			identifiedFeatures,
			(v) => {
				return Array.from(new Set(v.map((o) => o.properties.Street.toLowerCase()))).sort((a, b) => {
					const numStartRegex = /^\d+\s/;
					const aNumStart = numStartRegex.exec(a);
					const bNumStart = numStartRegex.exec(b);

					if (aNumStart !== null && bNumStart !== null) {
						const aNum = +aNumStart[0].trim();
						const bNum = +bNumStart[0].trim();

						const aRest = a.replaceAll(aNumStart[0], '').trim();
						const bRest = b.replaceAll(bNumStart[0], '').trim();

						return ascending(aNum, bNum) || ascending(aRest, bRest);
					}

					if (
						(aNumStart === null && bNumStart !== null) ||
						(aNumStart !== null && bNumStart === null)
					) {
						return ascending(a, b);
					}

					const numRestRegex = /\s\d+\s|\s\d+$/;
					const aNumRest = numRestRegex.exec(a);
					const bNumRest = numRestRegex.exec(b);

					if (aNumRest === null || bNumRest === null) {
						return ascending(a, b);
					}

					const aSansNum = a.replaceAll(aNumRest[0], '').trim();
					const bSansNum = b.replaceAll(bNumRest[0], '').trim();

					if (aSansNum === bSansNum) {
						const aNum = +aNumRest[0];
						const bNum = +bNumRest[0];
						return ascending(aNum, bNum) || ascending(a, b);
					}

					return ascending(aSansNum, bSansNum);
				});
			},
			(d) =>
				boroughCodes[+d.properties.StreetCode.toString().charAt(0) as keyof typeof boroughCodes]
		).sort(([a], [b]) => ascending(a, b))
	);

	const updateFeatureState = () => {
		for (const id of objectIds) {
			const featureSelector = {
				id: id,
				source: 'source-nyc'
			} as FeatureSelector;

			const highlighted = map.getFeatureState(featureSelector)?.['highlight'];
			if (!highlighted) {
				map.setFeatureState(featureSelector, {
					highlight: true
				});
			}
		}
	};

	onMount(() => {
		const localObjectIds = localStorage.getItem(localStorageKey);
		if (localObjectIds !== null) {
			let json: Array<number> = [];
			try {
				json = JSON.parse(localObjectIds);
			} catch (e) {
				console.error(e);
			}

			if (Array.isArray(json)) {
				objectIds = new SvelteSet(json);
			}
		}

		map = new mapboxgl.Map({
			container: ref,
			accessToken: PUBLIC_MAPBOX_TOKEN,
			bounds: [
				[metadata.bbox.minLongitude, metadata.bbox.minLatitude],
				[metadata.bbox.maxLongitude, metadata.bbox.maxLatitude]
			],
			minZoom: 9.260222708605697,
			dragRotate: false,
			fitBoundsOptions: {
				padding: 5
			},
			style: 'mapbox://styles/ericlau00/cmpnd0ozj005901qpg03724r0'
		});

		const bounds = map.getBounds();
		if (bounds) {
			map.setMaxBounds(bounds);
		}

		map.touchZoomRotate.disableRotation();

		map.on('load', () => {
			const nyc = {
				type: 'FeatureCollection',
				features: data.nyc.map((f) => {
					return {
						type: f.type,
						id: f.properties.OBJECTID,
						geometry: {
							type: f.geometry.type,
							coordinates: f.geometry.coordinates.map((d) => d.map((o) => +o.toPrecision(8)))
						},
						properties: {}
					};
				})
			} as const;

			map.addSource('source-nyc', {
				type: 'geojson',
				data: nyc
			});

			map.addLayer({
				id: 'layer-nyc',
				source: 'source-nyc',
				type: 'line',
				paint: {
					'line-color': [
						'case',
						['boolean', ['feature-state', 'highlight'], false],
						'#0f59d7',
						'#0444a1'
					],
					'line-opacity': ['case', ['boolean', ['feature-state', 'highlight'], false], 1, 0.125],
					'line-width': [
						'interpolate',
						['linear'],
						['zoom'],
						11,
						['case', ['boolean', ['feature-state', 'highlight'], false], 1.25, 0.5],
						12.5,
						['case', ['boolean', ['feature-state', 'highlight'], false], 3, 0.5]
					]
				}
			});

			if (objectIds.size > 0) {
				map.on('sourcedata', (e) => {
					if (e.sourceId === 'source-nyc' && e.isSourceLoaded) {
						updateFeatureState();
					}
				});
			}
		});

		map.on('move', () => {
			if (objectIds.size > 0) {
				updateFeatureState();
			}
		});

		return () => {
			map.remove();
		};
	});

	$effect(() => {
		localStorage.setItem(localStorageKey, JSON.stringify(Array.from(objectIds)));
	});
</script>

<main>
	<hgroup>
		<div id="form">
			<h1>
				Name New York City <span class="non-wonk">s</span>treet<span class="non-wonk">s</span>
			</h1>

			<form
				onsubmit={async (e) => {
					e.preventDefault();
					const formData = new FormData(e.currentTarget);
					const attemptData = formData.get('attempt');
					if (!attemptData) {
						return;
					}

					const attempt = attemptData.toString().toLowerCase().trim();
					const expandedAttempt = expand(attempt);

					// eslint-disable-next-line svelte/prefer-svelte-reactivity
					const identifiedFeatureStreetCodes = new Set(
						data.nyc
							.filter((d) => {
								const street = d.properties.Street.toLowerCase();
								return street === attempt || street === expandedAttempt;
							})
							.map((d) => d.properties.StreetCode)
					);

					const alternateJoinIds = new Set(
						data.names
							.filter((d) => {
								return (
									d.Street.toLowerCase() === attempt || d.Street.toLowerCase() === expandedAttempt
								);
							})
							.map((d) => d.Join_ID)
					);

					if (identifiedFeatureStreetCodes.size === 0) {
						// TODO: may need some improvement here...
						for (const f of data.nyc) {
							if (alternateJoinIds.has(f.properties.Join_ID)) {
								identifiedFeatureStreetCodes.add(f.properties.StreetCode);
							}
						}
					}

					const identifiedFeatures = data.nyc.filter((d) =>
						identifiedFeatureStreetCodes.has(d.properties.StreetCode)
					);

					let oldObjectIdsSize = objectIds.size;

					objectIds = new SvelteSet(
						objectIds.union(new Set(identifiedFeatures.map((d) => d.properties.OBJECTID)))
					);

					if (oldObjectIdsSize !== objectIds.size) {
						updateFeatureState();
						e.currentTarget.reset();
						return;
					}

					const input = e.currentTarget.querySelector('input');
					if (!input) {
						return;
					}

					input.classList.remove('shake');
					await tick();
					input.classList.add('shake');
				}}
			>
				<label for="guess" class="sr-only">Enter a street name</label>
				<input type="text" name="attempt" id="attempt" placeholder="Enter a street name" />
			</form>
		</div>

		<div style="display: grid; gap: calc(var(--gap) / 2);">
			<details>
				<summary>
					<p style="color: var(--color-primary);">
						{#key identifiedMiles}
							<span class="number" class:update={identifiedMiles > 0}
								>{numberFormat.format(identifiedMiles)}</span
							>
						{/key}
						of
						<span class="number">{numberFormat.format(metadata.mileLength)}</span>
						miles
						{#key identifiedMiles}
							<span class="parenthesis" class:update={identifiedMiles > 0}
								>(<span class="number"
									>{Math.round((identifiedMiles / metadata.mileLength) * 100)}</span
								>%)</span
							>
						{/key}
						identified
					</p>
				</summary>
				<ul>
					{#each identifiedStreets as [borough, boroughStreets] (borough)}
						{@const boroughLength = boroughLengths.get(borough) ?? 0}
						<li>
							<details>
								<summary
									>{#key boroughStreets.length}
										<p style="display: inline;" class="update">
											<span class="borough">{borough}</span>
											<span class="parenthesis">
												(<span class="number"
													>{Math.round(
														(boroughLength / metadata.boroughLengths[borough]) * 100
													)}%</span
												>)
											</span>
										</p>
									{/key}
								</summary>
								<ul class="streets">
									{#each boroughStreets as street (street)}
										<li class="street update">{street}</li>
									{/each}
								</ul>
							</details>
						</li>
					{/each}
				</ul>
			</details>

			<details>
				<summary style="color: var(--color-neutral)"
					><span style="font-size: 0.925rem;">Settings and details</span></summary
				>
				<div style="padding-left: 0.625rem; display: grid; gap: 0.375rem;">
					<div>
						<p><small>Made by <a href="https://erxclau.me" id="byline">Eric Lau</a>.</small></p>
						<p>
							<small>
								This page uses a modified version of
								<a href="https://www.nyc.gov/content/planning/pages/resources/datasets/lion">LION</a
								>
								<span class="parenthesis"
									>(<a href="https://hub.arcgis.com/datasets/DCP::lion/about">ArcGIS Hub</a>)</span
								>
								from New York City’s Department of City Planning. Modifications were made in Mapshaper.
								Data is loaded using Flatgeobuf. View the source code on
								<a href="https://github.com/erxclau/nyc-streets">GitHub</a>.</small
							>
						</p>
					</div>

					<div>
						<button command="show-modal" commandfor={modalId} disabled={objectIds.size === 0}
							>Reset progress</button
						>

						<dialog id={modalId}>
							<div style="display: grid; gap: var(--gap);">
								<p>Are you sure you want to reset your progress?</p>

								<menu>
									<li>
										<button commandfor={modalId} command="close">Cancel</button>
									</li>
									<li>
										<form method="dialog">
											<button
												onclick={() => {
													for (const id of objectIds) {
														const featureSelector = {
															id: id,
															source: 'source-nyc'
														} as FeatureSelector;

														const highlighted = map.getFeatureState(featureSelector)?.['highlight'];
														if (highlighted) {
															map.setFeatureState(featureSelector, {
																highlight: false
															});
														}
													}

													objectIds = new SvelteSet();
												}}>Confirm</button
											>
										</form>
									</li>
								</menu>
							</div>
						</dialog>
					</div>
				</div>
			</details>
		</div>
	</hgroup>

	<figure>
		<div id="map" bind:this={ref}></div>
	</figure>
</main>

<style>
	main {
		width: 100%;
		box-sizing: border-box;
		position: relative;
	}

	hgroup {
		--padding: 0.875rem;
		--gap: 0.625rem;
		--margin: 0.5rem;
		position: absolute;
		top: 0;
		z-index: 1;
		padding: var(--padding);
		padding-top: 0;
		display: grid;
		overflow-y: scroll;
		max-height: calc(100vh - 36px - var(--margin));

		margin-top: var(--margin);
		margin-left: var(--margin);
	}

	hgroup,
	dialog,
	button {
		box-shadow: 0 0 1px 1px rgb(from var(--color-neutral) r g b / 0.25);
		border-radius: 0.375rem;
	}

	hgroup,
	dialog {
		background-color: var(--color-secondary);
		width: 100%;
		box-sizing: border-box;
		max-width: 400px;
	}

	dialog {
		padding: var(--padding);
		border: none;
		max-width: fit-content;
	}

	button {
		font-family: var(--font-sans);
		background-color: var(--color-primary);
		color: var(--color-secondary);
		border: none;
		font-size: 0.875rem;
		transition:
			background-color 125ms linear,
			color 125ms linear,
			opacity 125ms linear;
		padding: 0.125rem 0.375rem;
	}

	button:active,
	button:hover,
	button:focus {
		background-color: var(--color-highlight);
		color: var(--color-secondary-active);
	}

	button:disabled {
		background-color: var(--color-primary);
		color: var(--color-secondary);
		opacity: 50%;
		cursor: not-allowed;
	}

	#form {
		display: grid;
		gap: var(--gap);
		position: sticky;
		top: 0;
		padding-top: var(--padding);
		padding-bottom: var(--gap);
		background-color: inherit;
	}

	@media screen and (max-width: 600px) {
		hgroup {
			--padding: 0.625rem;
			--gap: 0.375rem;
			--margin: 0;
			border-radius: 0;
			max-width: calc(100% - var(--margin) * 2);
			top: unset;
			bottom: var(--margin);
			max-height: 50vh;
		}

		:global(.mapboxgl-ctrl-bottom-right, .mapboxgl-ctrl-bottom-left) {
			bottom: unset;
			top: 0;
		}

		:global(.mapboxgl-ctrl-bottom-left .mapboxgl-ctrl) {
			margin: 10px 10px 0;
		}
	}

	summary {
		list-style-type: '+ ';
		font-family: var(--font-sans);
		cursor: pointer;
		list-style-position: outside;
		margin-left: 10px;
		color: var(--color-primary);
	}

	details[open] > summary {
		list-style-type: '− ';
	}

	details {
		display: grid;
		gap: 0.125rem;
	}

	h1 {
		font-family: var(--font-headline);
		color: var(--color-headline);
		font-size: calc(1rem + 0.875vw);
		font-weight: 300;
		text-wrap: pretty;
		line-height: calc(1rem + 0.875vw);
	}

	.non-wonk {
		font-variation-settings: 'WONK' 0;
	}

	h1,
	p {
		margin: 0;
	}

	p {
		font-family: var(--font-sans);
		font-size: 1rem;
		color: var(--color-neutral);
		text-wrap: pretty;
	}

	a {
		color: var(--color-primary);
		text-underline-offset: 3px;
	}

	#byline {
		color: var(--color-primary);
	}

	form {
		display: grid;
		gap: 0.25rem;
	}

	label {
		font-family: var(--font-sans);
		color: var(--color-neutral);
		font-size: 0.875rem;
	}

	input {
		background-color: var(--color-primary);
		border: none;
		color: var(--color-secondary);
		font-family: var(--font-sans);
		font-size: 1.25rem;
		padding: 0.25rem;
		border-radius: 0.25rem;
	}

	figure {
		margin: 0;
		position: relative;
		width: 100vw;
		height: 100dvh;
	}

	#map {
		position: absolute;
		width: 100%;
		height: 100%;
	}

	.update {
		transition: background-color 3s;
		background-color: transparent;
		width: fit-content;
	}

	@starting-style {
		.update {
			background-color: var(--color-light-highlight);
			background-color: rgb(from var(--color-light-highlight) r g b / 0.75);
		}
	}

	.number {
		font-variant-numeric: tabular-nums;
	}

	ul,
	menu {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	ul {
		padding-left: 0.625rem;
		font-family: var(--font-sans);

		display: grid;
		gap: 0.125rem;
	}

	menu {
		display: flex;
		gap: 0.5rem;
	}

	.borough {
		color: var(--color-primary);
	}

	li.street {
		color: var(--color-neutral);
		font-size: 0.875rem;
		text-transform: capitalize;
		font-variant-numeric: tabular-nums;
	}

	ul.streets {
		padding-left: 0.625rem;
		display: grid;
		gap: 0rem;
	}

	.parenthesis {
		display: inline-block;
		padding-left: 0.125rem;
		padding-right: 0.125rem;
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}

	@keyframes shake {
		0% {
			transform: translateX(0);
		}
		25% {
			transform: translateX(5px);
		}
		50% {
			transform: translateX(-5px);
		}
		75% {
			transform: translateX(5px);
		}
		100% {
			transform: translateX(0);
		}
	}

	:global(.shake) {
		animation: shake 0.375s ease-in-out;
	}
</style>
