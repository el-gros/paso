import { TrackDefinition, Track } from "../globald";
import { Map } from '../globald';

export var global: any = {
  lag: 8 as number,
  layerVisibility: 'archived' as string,
  achivedPresent: false as boolean,
  currentColor: 'orange' as string,
  archivedColor: 'green' as string,
  collection: [] as TrackDefinition [],
  key: 'null' as string,
  comingFrom: '' as string,
  fontSize: 16 as number,
  deleteSearch: false as boolean,
  presentSearch: false as boolean,
  locationUpdate: false as boolean,
  archivedTrack: undefined as Track | undefined,
  state: 'inactive' as 'inactive' | 'tracking' | 'stopped' | 'saved',
  buildTrackImage: false as boolean,
  mapTilerKey: 'VndVluazDWO8Aijuzfpp' as string,
  savedMapProvider: '' as string,

  // Dynamic getter for the cancel button
  get okButton() {
    return {
      text: 'OK', // Dynamically fetch the text
      role: 'confirm',
      cssClass: 'alert-ok-button',
    };
  },


    offlineMaps: [
    {
      "filename": "catalonia.mbtiles",
      "url": "https://dl.dropboxusercontent.com/scl/fi/9oa0knjdwwxcj61tha5au/catalonia.mbtiles?rlkey=jbodk9utxlagp9cdwqcqlex84",
      "size": 215,
      "update": "Feb 2025",
      "labels": ["Catalunya", "Cataluña", "Catalonia"],
      "name": 'Catalonia',
      "image": '/assets/maps/cat.jpg'
    }
  ] as Map[],
  maptiler_terrain_modified: {
    "version": 8,
    "name": "MapTiler Terrain",
    "metadata": {
      "mapbox:autocomposite": false,
      "mapbox:type": "template",
      "maputnik:renderer": "mbgljs",
      "openmaptiles:version": "3.x",
      "openmaptiles:mapbox:owner": "openmaptiles",
      "openmaptiles:mapbox:source:url": "mapbox://openmaptiles.4qljc88t"
    },
    "center": [8.54806714892635, 47.37180823552663],
    "zoom": 12.241790506353492,
    "bearing": 0,
    "pitch": 0,
    "sources": {
      "openmaptiles": {
        "type": "vector",
        "url": "https://api.maptiler.com/tiles/v3-openmaptiles/tiles.json?key={key}"
      },
      "hillshading": {
        "type": "raster",
        "url": "https://api.maptiler.com/tiles/hillshade/tiles.json?key={key}",
        "tileSize": 256
      },
      "contours": {
        "type": "vector",
        "url": "https://api.maptiler.com/tiles/contours/tiles.json?key={key}"
      }
    },
    "glyphs": "https://api.maptiler.com/fonts/{fontstack}/{range}.pbf?key={key}",
    "layers": [
      {
        "id": "background",
        "type": "background",
        "paint": { "background-color": "hsl(47, 26%, 88%)" }
      },
      {
        "id": "landuse-residential",
        "type": "fill",
        "source": "openmaptiles",
        "source-layer": "landuse",
        "filter": [
          "all",
          ["==", "$type", "Polygon"],
          ["==", "class", "residential"]
        ],
        "layout": { "visibility": "visible" },
        "paint": { "fill-color": "hsl(47, 13%, 86%)", "fill-opacity": 0.7 }
      },
      {
        "id": "water",
        "type": "fill",
        "source": "openmaptiles",
        "source-layer": "water",
        "filter": [
          "all",
          ["==", "$type", "Polygon"],
          ["!=", "brunnel", "tunnel"]
        ],
        "paint": { "fill-color": "hsl(205, 56%, 73%)" }
      },
      {
        "id": "waterway-tunnel",
        "type": "line",
        "source": "openmaptiles",
        "source-layer": "waterway",
        "filter": [
          "all",
          ["==", "$type", "LineString"],
          ["==", "brunnel", "tunnel"]
        ],
        "paint": {
          "line-color": "hsl(205, 56%, 73%)",
          "line-dasharray": [3, 3],
          "line-gap-width": { "stops": [[12, 0], [20, 6]] },
          "line-opacity": 1,
          "line-width": { "base": 1.4, "stops": [[8, 1], [20, 2]] }
        }
      },
      {
        "id": "waterway",
        "type": "line",
        "source": "openmaptiles",
        "source-layer": "waterway",
        "filter": [
          "all",
          ["==", "$type", "LineString"],
          ["!in", "brunnel", "tunnel", "bridge"]
        ],
        "paint": {
          "line-color": "hsl(205, 56%, 73%)",
          "line-opacity": 1,
          "line-width": { "base": 1.4, "stops": [[8, 1], [20, 8]] }
        }
      },
      {
        "id": "tunnel_railway_transit",
        "type": "line",
        "source": "openmaptiles",
        "source-layer": "transportation",
        "minzoom": 0,
        "filter": [
          "all",
          ["==", "$type", "LineString"],
          ["==", "brunnel", "tunnel"],
          ["==", "class", "transit"]
        ],
        "layout": { "line-cap": "butt", "line-join": "miter" },
        "paint": {
          "line-color": "hsl(34, 12%, 66%)",
          "line-dasharray": [3, 3],
          "line-opacity": { "base": 1, "stops": [[11, 0], [16, 1]] }
        }
      },
      {
        "id": "building",
        "type": "fill",
        "source": "openmaptiles",
        "source-layer": "building",
        "paint": {
          "fill-color": "hsl(39, 41%, 86%)",
          "fill-opacity": { "base": 1, "stops": [[13, 0.6], [14, 1]] },
          "fill-outline-color": "hsl(36, 45%, 80%)"
        }
      },
      {
        "id": "road_path",
        "type": "line",
        "source": "openmaptiles",
        "source-layer": "transportation",
        "filter": [
          "all",
          ["==", "$type", "LineString"],
          ["in", "class", "path", "track"]
        ],
        "layout": { "line-cap": "square", "line-join": "bevel" },
        "paint": {
          "line-color": "hsl(0, 0%, 97%)",
          "line-dasharray": [1, 1],
          "line-width": { "base": 1.55, "stops": [[4, 0.25], [20, 10]] }
        }
      },
      {
        "id": "road_minor",
        "type": "line",
        "source": "openmaptiles",
        "source-layer": "transportation",
        "filter": [
          "all",
          ["==", "$type", "LineString"],
          ["in", "class", "minor", "service"]
        ],
        "layout": { "line-cap": "round", "line-join": "round" },
        "paint": {
          "line-color": "hsl(0, 0%, 97%)",
          "line-width": { "base": 1.55, "stops": [[4, 0.25], [20, 30]] }
        }
      },
      {
        "id": "tunnel_minor",
        "type": "line",
        "source": "openmaptiles",
        "source-layer": "transportation",
        "filter": [
          "all",
          ["==", "$type", "LineString"],
          ["all", ["==", "brunnel", "tunnel"], ["==", "class", "minor_road"]]
        ],
        "layout": { "line-cap": "butt", "line-join": "miter" },
        "paint": {
          "line-color": "#efefef",
          "line-dasharray": [0.36, 0.18],
          "line-width": { "base": 1.55, "stops": [[4, 0.25], [20, 30]] }
        }
      },
      {
        "id": "tunnel_major",
        "type": "line",
        "source": "openmaptiles",
        "source-layer": "transportation",
        "filter": [
          "all",
          ["==", "$type", "LineString"],
          [
            "all",
            ["==", "brunnel", "tunnel"],
            ["in", "class", "primary", "secondary", "tertiary", "trunk"]
          ]
        ],
        "layout": { "line-cap": "butt", "line-join": "miter" },
        "paint": {
          "line-color": "#fff",
          "line-dasharray": [0.28, 0.14],
          "line-width": { "base": 1.4, "stops": [[6, 0.5], [20, 30]] }
        }
      },
      {
        "id": "road_trunk_primary",
        "type": "line",
        "source": "openmaptiles",
        "source-layer": "transportation",
        "filter": [
          "all",
          ["==", "$type", "LineString"],
          ["in", "class", "trunk", "primary"]
        ],
        "layout": { "line-cap": "round", "line-join": "round" },
        "paint": {
          "line-color": "hsl(327, 92.00%, 50.80%)",
          "line-width": { "base": 1.4, "stops": [[6, 0.5], [20, 30]] }
        }
      },
      {
        "id": "road_secondary_tertiary",
        "type": "line",
        "source": "openmaptiles",
        "source-layer": "transportation",
        "filter": [
          "all",
          ["==", "$type", "LineString"],
          ["in", "class", "secondary", "tertiary"]
        ],
        "layout": { "line-cap": "round", "line-join": "round" },
        "paint": {
          "line-color": "#fff",
          "line-width": { "base": 1.4, "stops": [[6, 0.5], [20, 20]] }
        }
      },
      {
        "id": "road_major_motorway",
        "type": "line",
        "source": "openmaptiles",
        "source-layer": "transportation",
        "filter": [
          "all",
          ["==", "$type", "LineString"],
          ["==", "class", "motorway"]
        ],
        "layout": { "line-cap": "round", "line-join": "round" },
        "paint": {
          "line-color": "hsl(327, 92.00%, 50.80%)",
          "line-offset": 0,
          "line-width": { "base": 1.4, "stops": [[8, 1], [16, 10]] }
        }
      },
      {
        "id": "railway_transit",
        "type": "line",
        "source": "openmaptiles",
        "source-layer": "transportation",
        "filter": [
          "all",
          ["==", "class", "transit"],
          ["!=", "brunnel", "tunnel"]
        ],
        "layout": { "visibility": "visible" },
        "paint": {
          "line-color": "hsla(44, 94.40%, 51.00%, 0.89)",
          "line-opacity": { "base": 1, "stops": [[11, 0], [16, 1]] }
        }
      },
      {
        "id": "railway",
        "type": "line",
        "source": "openmaptiles",
        "source-layer": "transportation",
        "filter": ["==", "class", "rail"],
        "layout": { "visibility": "visible" },
        "paint": {
          "line-color": "hsla(44, 94.40%, 51.00%, 0.89)",
          "line-opacity": { "base": 1, "stops": [[11, 0], [16, 1]] }
        }
      },
      {
        "id": "waterway-bridge-case",
        "type": "line",
        "source": "openmaptiles",
        "source-layer": "waterway",
        "filter": [
          "all",
          ["==", "$type", "LineString"],
          ["==", "brunnel", "bridge"]
        ],
        "layout": { "line-cap": "butt", "line-join": "miter" },
        "paint": {
          "line-color": "#bbbbbb",
          "line-gap-width": { "base": 1.55, "stops": [[4, 0.25], [20, 30]] },
          "line-width": { "base": 1.6, "stops": [[12, 0.5], [20, 10]] }
        }
      },
      {
        "id": "waterway-bridge",
        "type": "line",
        "source": "openmaptiles",
        "source-layer": "waterway",
        "filter": [
          "all",
          ["==", "$type", "LineString"],
          ["==", "brunnel", "bridge"]
        ],
        "layout": { "line-cap": "round", "line-join": "round" },
        "paint": {
          "line-color": "hsl(205, 56%, 73%)",
          "line-width": { "base": 1.55, "stops": [[4, 0.25], [20, 30]] }
        }
      },
      {
        "id": "bridge_minor case",
        "type": "line",
        "source": "openmaptiles",
        "source-layer": "transportation",
        "filter": [
          "all",
          ["==", "$type", "LineString"],
          ["all", ["==", "brunnel", "bridge"], ["==", "class", "minor_road"]]
        ],
        "layout": { "line-cap": "butt", "line-join": "miter" },
        "paint": {
          "line-color": "#dedede",
          "line-gap-width": { "base": 1.55, "stops": [[4, 0.25], [20, 30]] },
          "line-width": { "base": 1.6, "stops": [[12, 0.5], [20, 10]] }
        }
      },
      {
        "id": "bridge_major case",
        "type": "line",
        "source": "openmaptiles",
        "source-layer": "transportation",
        "filter": [
          "all",
          ["==", "$type", "LineString"],
          [
            "all",
            ["==", "brunnel", "bridge"],
            ["in", "class", "primary", "secondary", "tertiary", "trunk"]
          ]
        ],
        "layout": { "line-cap": "butt", "line-join": "miter" },
        "paint": {
          "line-color": "#dedede",
          "line-gap-width": { "base": 1.55, "stops": [[4, 0.25], [20, 30]] },
          "line-width": { "base": 1.6, "stops": [[12, 0.5], [20, 10]] }
        }
      },
      {
        "id": "bridge_minor",
        "type": "line",
        "source": "openmaptiles",
        "source-layer": "transportation",
        "filter": [
          "all",
          ["==", "$type", "LineString"],
          ["all", ["==", "brunnel", "bridge"], ["==", "class", "minor_road"]]
        ],
        "layout": { "line-cap": "round", "line-join": "round" },
        "paint": {
          "line-color": "#efefef",
          "line-width": { "base": 1.55, "stops": [[4, 0.25], [20, 30]] }
        }
      },
      {
        "id": "bridge_major",
        "type": "line",
        "source": "openmaptiles",
        "source-layer": "transportation",
        "filter": [
          "all",
          ["==", "$type", "LineString"],
          [
            "all",
            ["==", "brunnel", "bridge"],
            ["in", "class", "primary", "secondary", "tertiary", "trunk"]
          ]
        ],
        "layout": { "line-cap": "round", "line-join": "round" },
        "paint": {
          "line-color": "#fff",
          "line-width": { "base": 1.4, "stops": [[6, 0.5], [20, 30]] }
        }
      },
      {
        "id": "admin_country_z0-4",
        "type": "line",
        "source": "openmaptiles",
        "source-layer": "boundary",
        "maxzoom": 5,
        "filter": [
          "all",
          ["<=", "admin_level", 2],
          ["==", "$type", "LineString"],
          ["!has", "claimed_by"]
        ],
        "layout": { "line-cap": "round", "line-join": "round" },
        "paint": {
          "line-color": "hsla(0, 8%, 22%, 0.51)",
          "line-width": { "base": 1.3, "stops": [[3, 0.5], [22, 15]] }
        }
      },
      {
        "id": "admin_country_z5-",
        "type": "line",
        "source": "openmaptiles",
        "source-layer": "boundary",
        "minzoom": 5,
        "filter": [
          "all",
          ["<=", "admin_level", 2],
          ["==", "$type", "LineString"]
        ],
        "layout": { "line-cap": "round", "line-join": "round" },
        "paint": {
          "line-color": "hsla(0, 8%, 22%, 0.51)",
          "line-width": { "base": 1.3, "stops": [[3, 0.5], [22, 15]] }
        }
      },
      {
        "id": "poi_label",
        "type": "symbol",
        "source": "openmaptiles",
        "source-layer": "poi",
        "minzoom": 14,
        "filter": ["all", ["==", "$type", "Point"], ["==", "rank", 1]],
        "layout": {
          "icon-size": 1,
          "text-anchor": "top",
          "text-field": "{name:latin}\n{name:nonlatin}",
          "text-font": ["Noto Sans Regular"],
          "text-max-width": 12,
          "text-offset": [0, 0.5],
          "text-size": 15,
          "visibility": "visible"
        },
        "paint": {
          "text-color": "#000",
        }
      },
      {
        "id": "mountain_peak",
        "type": "symbol",
        "source": "openmaptiles",
        "source-layer": "mountain_peak",
        "minzoom": 7,
        "filter": ["all", ["==", "$type", "Point"], ["==", "rank", 1]],
        "layout": {
          "icon-size": 1,
          "text-anchor": "bottom",
          "text-field": "{name:latin} {name:nonlatin}\n{ele} m\n▲",
          "text-font": ["Noto Sans Regular"],
          "text-max-width": 12,
          "text-offset": [0, 0.5],
          "text-size": 15,
          "visibility": "visible"
        },
        "paint": {
          "text-color": "rgba(0, 0, 0, 1)",
        }
      },
      {
        "id": "place_label_other",
        "type": "symbol",
        "source": "openmaptiles",
        "source-layer": "place",
        "minzoom": 8,
        "filter": [
          "all",
          ["==", "$type", "Point"],
          ["all", ["!in", "class", "city", "state", "country", "continent"]]
        ],
        "layout": {
          "text-anchor": "center",
          "text-field": "{name:latin}\n{name:nonlatin}",
          "text-font": ["Noto Sans Regular"],
          "text-max-width": 9,
          "text-size": { "stops": [[6, 15], [12, 21]] },
          "visibility": "visible"
        },
        "paint": {
          "text-color": "hsl(0, 0, 0)",
        }
      },
      {
        "id": "place_label_city",
        "type": "symbol",
        "source": "openmaptiles",
        "source-layer": "place",
        "maxzoom": 16,
        "filter": ["all", ["==", "$type", "Point"], ["==", "class", "city"]],
        "layout": {
          "text-field": "{name:latin}\n{name:nonlatin}",
          "text-font": ["Noto Sans Regular"],
          "text-max-width": 15,
          "text-size": { "stops": [[3, 18], [8, 24]] }
        },
        "paint": {
          "text-color": "hsl(0, 0%, 0%)",
        }
      },
      {
        "id": "country_label-other",
        "type": "symbol",
        "source": "openmaptiles",
        "source-layer": "place",
        "maxzoom": 12,
        "filter": [
          "all",
          ["==", "$type", "Point"],
          ["==", "class", "country"],
          ["!has", "iso_a2"]
        ],
        "layout": {
          "text-field": "{name:latin}",
          "text-font": ["Noto Sans Regular"],
          "text-max-width": 15,
          "text-size": { "stops": [[3, 18], [8, 33]] },
          "visibility": "visible"
        },
        "paint": {
          "text-color": "hsl(0, 0%, 0%)",
        }
      },
      {
        "id": "country_label",
        "type": "symbol",
        "source": "openmaptiles",
        "source-layer": "place",
        "maxzoom": 12,
        "filter": [
          "all",
          ["==", "$type", "Point"],
          ["==", "class", "country"],
          ["has", "iso_a2"]
        ],
        "layout": {
          "text-field": "{name:latin}",
          "text-font": ["Noto Sans Bold"],
          "text-max-width": 15,
          "text-size": { "stops": [[3, 18], [8, 33]] }
        },
        "paint": {
          "text-color": "hsl(0, 0%, 0%)",
        }
      },
      {
        "id": "GR_routes",
        "type": "line",
        "source": "osm",
        "source-layer": "transportation",
        "filter": ["all", ["==", "route", "foot"], ["==", "network", "nwn"]],
        "layout": {
          "visibility": "visible"
        },
        "paint": {
          "line-color": "#FF0000",
          "line-width": 10,
          "line-dasharray": [4, 2]
        }
      },
      {
        "id": "PR_routes",
        "type": "line",
        "source": "osm",
        "source-layer": "transportation",
        "filter": ["all", ["==", "route", "foot"], ["==", "network", "rwn"]],
        "layout": {
          "visibility": "visible"
        },
        "paint": {
          "line-color": "#AA7700",
          "line-width": 10,
          "line-dasharray": [4, 2]
        }
      }
    ],
    "id": "maptiler-terrain"
  } as unknown as JSON,
  onInitFinished: false as boolean,
  authorization: '5b3ce3597851110001cf624876b05cf836e24d5aafce852a55c3ea23' as string
}

export const environment = {
  production: false,
};


