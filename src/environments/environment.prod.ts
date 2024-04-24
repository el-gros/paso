import { Location, Track, TrackDefinition, Corr } from '../globald';

export var global = {
  
  track: {
    data: [], 
    map: [],
    name: '',
    place: '',
    date: new Date()  ,
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


