import { readFileSync, writeFileSync } from 'node:fs';

import { deserialize } from 'flatgeobuf/lib/mjs/geojson.js';
import { csvFormat, csvParse } from 'd3-dsv';

import type { Feature, LineString } from 'geojson';

const fgb = readFileSync('workspace/out/nyc.fgb');
const view = new Uint8Array(fgb.buffer);
const features = deserialize(view) as AsyncGenerator<Feature<LineString, StreetProperties>>;

const names = csvParse<AlternateNameColumn>(readFileSync('workspace/data/altnames.csv').toString());
const altNameJoinIds = new Set(names.map((d) => d.Join_ID));

const featureJoinIds: Set<string> = new Set();
for await (const feature of features) {
	featureJoinIds.add(feature.properties.Join_ID);
}

const relevantJoinIds = featureJoinIds.intersection(altNameJoinIds);

writeFileSync(
	'workspace/out/names.csv',
	csvFormat(names.filter((d) => relevantJoinIds.has(d.Join_ID)))
);
