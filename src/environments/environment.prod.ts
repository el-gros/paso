// This file can be replaced during build by using the `fileReplacements` array.
// `ng build` replaces `environment.ts` with `environment.prod.ts`.
// The list of file replacements can be found in `angular.json`.

import { Map } from '../globald';

export var global: any = {
  supabaseUrl: 'https://xvezdemtphqwgjukjhan.supabase.co',
  supabaseKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh2ZXpkZW10cGhxd2dqdWtqaGFuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI4OTQxMTYsImV4cCI6MjA3ODQ3MDExNn0.ayOgM2MIXJiW_q4AbAyQ4KzgiiNEF5o7sQLr2d_oX1E',
  mapTilerKey: 'VndVluazDWO8Aijuzfpp' as string,
  mapbox_public: '' as string,
  ors_key: '5b3ce3597851110001cf624876b05cf836e24d5aafce852a55c3ea23' as string,
  weather_key: 'e39530f127b7c58745ddeb78f71e2019' as string,
  
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
      "name": "Catalunya",
      "filename": "cataluna-shortbread-1.0.mbtiles",
      "url": "https://download.geofabrik.de/europe/spain/cataluna-shortbread-1.0.mbtiles",
      "size": 247
    },
    {
      "name": "Aragón",
      "filename": "aragon-shortbread-1.0.mbtiles",
      "url": "https://download.geofabrik.de/europe/spain/aragon-shortbread-1.0.mbtiles",
      "size": 155
    },
    {
      "name": "Comunitat Valenciana",
      "filename": "valencia-shortbread-1.0.mbtiles",
      "url": "https://download.geofabrik.de/europe/spain/valencia-shortbread-1.0.mbtiles",
      "size": 160
    },
    {
      "name": "Languedoc-Roussillon",
      "filename": "languedoc-roussillon-shortbread-1.0.mbtiles",
      "url": "https://download.geofabrik.de/europe/france/languedoc-roussillon-shortbread-1.0.mbtiles",
      "size": 284
    },
        {
      "name": "Midi-Pyrénées",
      "filename": "midi-pyrenees-shortbread-1.0.mbtiles",
      "url": "https://download.geofabrik.de/europe/france/midi-pyrenees-shortbread-1.0.mbtiles",
      "size": 391
    },
  ]
  
}

export const environment = {
  production: true,
};


