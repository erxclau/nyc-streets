import type { PageLoad } from './$types';
import metadata from '$lib/assets/metadata.json';

import { deserialize } from 'flatgeobuf/lib/mjs/geojson.js';
import type { Feature, LineString } from 'geojson';
import { csvParse } from 'd3-dsv';

// export const ssr = false;

export const load: PageLoad = async ({ fetch }) => {
	const nycResponse = await fetch('/nyc.fgb');
	if (!nycResponse.ok) {
		throw new Error(`${nycResponse.status}: ${nycResponse.statusText}`);
	}

	const nycResponseBody = nycResponse.body;
	if (nycResponseBody === null) {
		throw new Error(`Empty body: ${nycResponse.url}`);
	}

	const features = deserialize(nycResponseBody) as AsyncGenerator<
		Feature<LineString, StreetProperties>
	>;

	const nyc = await Array.fromAsync(features);

	const namesResponse = await fetch('/names.csv');
	if (!namesResponse.ok) {
		throw new Error(`${namesResponse.status}: ${namesResponse.statusText}`);
	}

	const namesText = await namesResponse.text();
	const names = csvParse<AlternateNameColumn>(namesText);

	return {
		nyc: nyc,
		names: names,
		metadata
	};
};
