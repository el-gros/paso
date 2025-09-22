// This file can be replaced during build by using the `fileReplacements` array.
// `ng build` replaces `environment.ts` with `environment.prod.ts`.
// The list of file replacements can be found in `angular.json`.

import { TrackDefinition, Track } from "../globald";
import { Map } from '../globald';

export var global: any = {
  lag: 8 as number,
  layerVisibility: 'archived' as string,
  languageCode: 'en' as string,
  archivedPresent: false as boolean,
  cancel: ['Cancel.lar', 'Cancelar', 'Cancel'],
  currentColor: 'orange' as string,
  archivedColor: 'green' as string,
  collection: [] as TrackDefinition [],
  key: 'null' as string,
  comingFrom: '' as string,
  deleteSearch: false as boolean,
  presentSearch: false as boolean,
  locationUpdate: false as boolean,
  //archivedTrack: undefined as Track | undefined,
  //state: 'inactive' as 'inactive' | 'tracking' | 'stopped' | 'saved',
  buildTrackImage: false as boolean,
  mapTilerKey: 'VndVluazDWO8Aijuzfpp' as string,
  savedMapProvider: '' as string,
  alert: 'on' as string,               // Alert on/off
  audioAlert: 'on' as string,          // Audio alert on/off
  geocoding: 'nominatim' as string,

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
    "layers": [
      {  // Water
        "id": "water",
        "type": "fill",
        "source": "openmaptiles",
        "source-layer": "water",
        "filter": ["in", "class", "water", "lake", "ocean"],
        "layout": {},
        "paint": {
          "fill-color": "#a0c0f0"
        }
      },
      { // Waterway
        "id": "river",
        "type": "line",
        "source": "openmaptiles",
        "source-layer": "waterway",
        "minzoom": 8,
        "filter": ["in", "class", "river", "stream"],
        "layout": {"line-cap": "round"},
        "paint": {
          "line-color": "#a0c8f0",
          "line-width": 1
        }
      },
      { // Transportation-1
        "id": "road",
        "type": "line",
        "source": "openmaptiles",
        "source-layer": "transportation",
        "minzoom": 8,
        "filter": ["in", "class", "primary", "trunk", "motorway", "secondary", "tertiary", "minor", "service"],
        "layout": {
          "line-cap": "round",
          "line-join": "round"
        },
        "paint": {
          "line-color": "#fea",
          "line-width": 1
        }
      },
      { // Transportation-2
        "id": "path",
        "type": "line",
        "source": "openmaptiles",
        "source-layer": "transportation",
        "filter": ["in", "class", "track", "path"],
        "minzoom": 13,
        "layout": {
          "line-cap": "round",
          "line-join": "round"
        },
        "paint": {
          "line-color": "#f00",
          "line-width": 1
        }
      },
      { // Transportation-3
        "id": "railroad",
        "type": "line",
        "source": "openmaptiles",
        "source-layer": "transportation",
        "filter": ["==", "class", "rail"],
        "minzoom": 8,
        "layout": {
          "line-cap": "round",
          "line-join": "round"
        },
        "paint": {
          "line-color": "#000",
          "line-width": 1
        }
      },
      { // Places-1
        "id": "village",
        "type": "symbol",
        "source": "openmaptiles",
        "source-layer": "place",
        "filter": ["==", "class", "village"],
        "minzoom": 13,
        "layout": {
          "text-field": "{name_en}",
          "text-font": ["Roboto Regular"],
          "text-max-width": 8,
          "text-size": 12
        },
        "paint": {
          "text-color": "#000",
          "text-halo-color": "rgba(255,255,255,0.8)",
          "text-halo-width": 1.2
        }
      },
      { // Places-2
        "id": "town",
        "type": "symbol",
        "source": "openmaptiles",
        "source-layer": "place",
        "filter": ["==", "class", "town"],
        "minzoom": 10,
        "layout": {
          "text-field": "{name_en}",
          "text-font": ["Roboto Regular"],
          "text-max-width": 8,
          "text-size": 13
        },
        "paint": {
          "text-color": "#000",
          "text-halo-color": "rgba(255,255,255,0.8)",
          "text-halo-width": 1.2
        }
      },
      { // Places-3
        "id": "city",
        "type": "symbol",
        "source": "openmaptiles",
        "source-layer": "place",
        "filter": ["==", "class", "city"],
        "minzoom": 6,
        "layout": {
          "text-field": "{name_en}",
          "text-font": ["Roboto Medium"],
          "text-max-width": 8,
          "text-size": 15
        },
        "paint": {
          "text-color": "#000",
          "text-halo-color": "rgba(255,255,255,0.8)",
          "text-halo-width": 1.2
        }
      },
      { // Mountain_peak
        "id": "peak",
        "type": "symbol",
        "source": "openmaptiles",
        "source-layer": "mountain_peak",
        "filter": ["==", "class", "peak"],
        "minzoom": {
          "1": 8,
          "2": 11,
          "4": 14,
          "5": 17,
        },
        "layout": {
          "text-font": ["Roboto Medium"],
          "text-field": "{name}",
          "text-size": 12
        },
        "paint": {
          "text-color": "#090",
          "text-halo-color": "#fff",
          "text-halo-width": 1.2
        }
      },
      { // Boundary
        "id": "boundary",
        "type": "line",
        "source": "openmaptiles",
        "source-layer": "boundary",
        "filter": ["<", "admin_level", 5],
        "minzoom": 0,
        "layout": {
          "line-cap": "round",
          "line-join": "round"
        },
        "paint": {
          "line-color": "#aaa",
          "line-width": 3
        }
      },
      {  // Urban
        "id": "urban",
        "type": "fill",
        "source": "openmaptiles",
        "source-layer": "landuse",
        "filter": ["in", "class", "residential", "suburb", "neighbourhood", "commercial", "industrial", "retail", "construction"],
        "layout": {},
        "paint": {
          "fill-color":"rgb(236, 225, 177)"
        }
      },
   ],
  } as unknown as JSON,
  onInitFinished: false as boolean,
  authorization: '5b3ce3597851110001cf624876b05cf836e24d5aafce852a55c3ea23' as string
}

export const environment = {
  production: true,
};


