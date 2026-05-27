import { readFileSync, writeFileSync } from 'node:fs';

import { length } from '@turf/length';
import { deserialize } from 'flatgeobuf/lib/mjs/geojson.js';

import type { Feature, LineString } from 'geojson';

const fgb = readFileSync('workspace/out/nyc.fgb');
const view = new Uint8Array(fgb.buffer);
const features = deserialize(view) as AsyncGenerator<Feature<LineString, StreetProperties>>;

const boroughCodes = {
	1: 'Manhattan',
	2: 'The Bronx',
	3: 'Brooklyn',
	4: 'Queens',
	5: 'Staten Island'
};

let l = 0;

let minLongitude = Infinity;
let minLatitude = Infinity;
let maxLongitude = -Infinity;
let maxLatitude = -Infinity;

const boroughLengths = {
	Manhattan: 0,
	'The Bronx': 0,
	Brooklyn: 0,
	Queens: 0,
	'Staten Island': 0
};

for await (const feature of features) {
	if (feature.geometry.type === 'LineString') {
		const coordinates = feature.geometry.coordinates;
		for (const [longitude, latitude] of coordinates) {
			if (longitude > maxLongitude) {
				maxLongitude = longitude;
			}

			if (longitude < minLongitude) {
				minLongitude = longitude;
			}

			if (latitude > maxLatitude) {
				maxLatitude = latitude;
			}

			if (latitude < minLatitude) {
				minLatitude = latitude;
			}
		}
	}

	const code = +feature.properties.StreetCode.toString().charAt(0) as keyof typeof boroughCodes;
	const borough = boroughCodes[code];

	const mileLength = length(feature, { units: 'miles' });

	boroughLengths[borough as keyof typeof boroughLengths] += mileLength;
	l += mileLength;
}

writeFileSync(
	'workspace/out/metadata.json',
	JSON.stringify(
		{
			bbox: { minLatitude, minLongitude, maxLatitude, maxLongitude },
			mileLength: l,
			boroughLengths
		},
		null,
		2
	)
);
