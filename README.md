# nyc-streets

This page uses an adapted version of [LION](https://www.nyc.gov/content/planning/pages/resources/datasets/lion) ([ArcGIS Hub](https://hub.arcgis.com/datasets/DCP::lion/about)) from New York City’s Department of City Planning. It also parses alternate names for streets from the LION File Geodatabase.

Refer to this PDF for more about [LION](https://s-media.nyc.gov/agencies/dcp/assets/files/pdf/data-tools/bytes/lion_metadata.pdf).

I applied the following filters using [Mapshaper](https://mapshaper.org):

```plaintext
npx --node-options="--max-old-space-size=4096" mapshaper workspace/data/nyc.geojson -filter-fields OBJECTID,Street,FeatureTyp,Join_ID,StreetCode -filter '!["1","2","3","5","7","8","9","A","F"].includes(String(FeatureTyp))' -o workspace/out/nyc.fgb
```

<https://observablehq.com/@chrispahm/turf-js-buffer-end-cap-styles>