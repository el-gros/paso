import { Location, Track, TrackDefinition } from '../globald';

export var global = {
  
  track: {
    data: [], 
    map: [],
    name: '',
    place: '',
    date: new Date(),
    description: '', 
  } as Track,

  tracking: false as boolean,
  watcherId: 0 as number,
  collection: [] as TrackDefinition[],    
} 

export var environment = {
  production: true,
}


