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

  watcherId: 0 as number,
  collection: [] as TrackDefinition[],    
  provider: 'Tomtom' as string, // Tomtom or Mapbox
} 

export var environment = {
  production: true,
}


