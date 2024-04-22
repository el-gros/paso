// This file can be replaced during build by using the `fileReplacements` array.
// `ng build` replaces `environment.ts` with `environment.prod.ts`.
// The list of file replacements can be found in `angular.json`.

import { Location, Bounds, Track, TrackDefinition, Corr } from '../globald';

export var global = {
  track: {
    data: [], 
    map: [],
    name: '',
    place: '',
    date: new Date(),
    description: '', 
  } as Track,

  corr: [] as Corr[], 
  
  tracking: false as boolean,
  watcherId: 0 as number,
  collection: [] as TrackDefinition[],                                                                   
} 

export var environment = {
  production: true,
}




/*
 * For easier debugging in development mode, you can import the following file
 * to ignore zone related error stack frames such as `zone.run`, `zoneDelegate.invokeTask`.
 *
 * This import should be commented out in production mode because it will have a negative impact
 * on performance if an error is thrown.
 */
// import 'zone.js/plugins/zone-error';  // Included with Angular CLI.
