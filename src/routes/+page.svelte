<script lang="ts">
	import { onMount } from 'svelte';

	import { Map, type FeatureSelector } from 'mapbox-gl';
	import 'mapbox-gl/dist/mapbox-gl.css';

	import metadata from '$lib/assets/metadata.json';
	import { PUBLIC_MAPBOX_TOKEN } from '$env/static/public';
	import { SvelteSet } from 'svelte/reactivity';
	import length from '@turf/length';
	import { ascending, rollup, rollups, sum } from 'd3-array';

	let { data } = $props();

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

	let map: Map;

	let objectIds: SvelteSet<number> = new SvelteSet();

	const { identifiedMiles, boroughLengths } = $derived.by(() => {
		const objectLengths = data.nyc
			.filter((d) => objectIds.has(d.properties.OBJECTID))
			.map((d) => {
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

	const identifiedStreets = $derived.by(() => {
		return rollups(
			data.nyc.filter((d) => objectIds.has(d.properties.OBJECTID)),
			(v) => Array.from(new Set(v.map((o) => o.properties.Street))).sort(),
			(d) =>
				boroughCodes[+d.properties.StreetCode.toString().charAt(0) as keyof typeof boroughCodes]
		).sort(([a], [b]) => ascending(a, b));
	});

	onMount(() => {
		map = new Map({
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
						properties: {
							objectId: f.properties.OBJECTID
						}
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
						'#1c2121'
					],
					'line-opacity': ['case', ['boolean', ['feature-state', 'highlight'], false], 1, 0.375],
					'line-width': ['case', ['boolean', ['feature-state', 'highlight'], false], 2, 0.5]
				}
			});
		});

		map.on('move', () => {
			if (objectIds.size === 0) {
				return;
			}

			const highlightFeatures = map.querySourceFeatures('source-nyc').filter((d) => {
				const id = d.id;
				if (id === undefined || isNaN(+id)) {
					return false;
				}

				return objectIds.has(+id);
			});

			for (const feature of highlightFeatures) {
				map.setFeatureState(
					{
						id: feature.id,
						source: 'source-nyc'
					} as FeatureSelector,
					{
						highlight: true
					}
				);
			}
		});

		return () => {
			map.remove();
		};
	});
</script>

<main>
	<hgroup>
		<h1>Name New York City streets</h1>
		<details>
			<summary>
				<p style="display: inline; font-family: var(--font-sans); color: var(--color-primary)">
					<span class="number">{numberFormat.format(identifiedMiles)}</span> of
					<span class="number">{numberFormat.format(metadata.mileLength)}</span>
					miles
					<span class="parenthesis"
						>(<span class="number">{Math.round((identifiedMiles / metadata.mileLength) * 100)}</span
						>%)</span
					>
					identified
				</p>
			</summary>
			<ul>
				{#each identifiedStreets as [borough, boroughStreets] (borough)}
					{@const boroughLength = boroughLengths.get(borough) ?? 0}
					<li>
						<details>
							<summary
								><p style="display: inline;">
									<span class="borough">{borough}</span>
									<span class="parenthesis">
										(<span class="number"
											>{Math.round((boroughLength / metadata.boroughLengths[borough]) * 100)}%</span
										>)
									</span>
								</p></summary
							>
							<ul class="streets">
								{#each boroughStreets as street (street)}
									<li class="street">{street.toLowerCase()}</li>
								{/each}
							</ul>
						</details>
					</li>
				{/each}
			</ul>
		</details>

		<form
			onsubmit={(e) => {
				e.preventDefault();
				const formData = new FormData(e.currentTarget);
				const attemptData = formData.get('attempt');
				if (!attemptData) {
					return;
				}

				const attempt = attemptData.toString().toLowerCase().trim();

				const identifiedFeatureStreetCodes = new Set(
					data.nyc
						.filter((d) => {
							return d.properties.Street.toLowerCase() === attempt;
						})
						.map((d) => d.properties.StreetCode)
				);

				const identifiedFeatures = data.nyc.filter((d) =>
					identifiedFeatureStreetCodes.has(d.properties.StreetCode)
				);

				for (const f of identifiedFeatures) {
					objectIds.add(f.properties.OBJECTID);
				}

				const highlightFeatures = map.querySourceFeatures('source-nyc').filter((d) => {
					const id = d.id;
					if (id === undefined || isNaN(+id)) {
						return false;
					}

					return objectIds.has(+id);
				});

				for (const feature of highlightFeatures) {
					map.setFeatureState(
						{
							id: feature.id,
							source: 'source-nyc'
						} as FeatureSelector,
						{
							highlight: true
						}
					);
				}

				e.currentTarget.reset();
			}}
		>
			<label for="guess">Enter a street name</label>
			<input type="text" name="attempt" id="attempt" />
		</form>

		<details>
			<summary style="color: var(--color-neutral);"
				><small>Made by <a href="https://erxclau.me" id="byline">Eric Lau</a></small>.</summary
			>
			<p>
				<small>
					This page uses a modified version of
					<a href="https://www.nyc.gov/content/planning/pages/resources/datasets/lion">LION</a>
					<span class="parenthesis">(<a href="https://hub.arcgis.com/datasets/DCP::lion/about">ArcGIS Hub</a>)</span> from New York
					City’s Department of City Planning. Modifications were made in Mapshaper. Data is loaded
					using Flatgeobuf.</small
				>
			</p>
		</details>
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
		position: absolute;
		top: 0;
		z-index: 1;
		background-color: var(--color-secondary);
		max-width: 400px;
		width: 100%;
		box-sizing: border-box;
		padding: 1rem;
		display: grid;
		gap: 0.625rem;
	}

	@media screen and (max-width: 600px) {
		hgroup {
			max-width: 100%;
			top: unset;
			padding: 0.5rem;
			padding-bottom: 36px;
			bottom: 0;
			gap: 0.5rem;
		}
	}

	summary {
		list-style-type: '+ ';
		font-family: var(--font-sans);
		cursor: pointer;
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
		font-variation-settings: 'WONK' 0;
		text-wrap: pretty;
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
		color: var(--color-neutral);
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

	.number {
		font-variant-numeric: tabular-nums;
	}

	ul {
		margin: 0;
		padding: 0;
		padding-left: 1rem;
		list-style: none;
		font-family: var(--font-sans);

		display: grid;
		gap: 0.125rem;
	}

	.borough {
		color: var(--color-primary);
	}

	li.street {
		color: var(--color-neutral);
		font-size: 0.875rem;
		text-transform: capitalize;
	}

	ul.streets {
		padding-left: 1rem;
		display: grid;
		gap: 0rem;
	}

	.parenthesis {
		display: inline-block;
		padding-left: 0.125rem;
		padding-right: 0.125rem;
	}
</style>
