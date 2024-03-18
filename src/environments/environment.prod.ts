import { Location, Element, Result, Block, Track, TrackDefinition } from '../globald';

export var global = {
  
  track: {
    locations: [], 
    elements: [],
    results: {
      distance: 0,
      elevationGain: 0,
      elevationLoss: 0,
      time: 0,
      x: 0,
      y: 0,
      xMin: 0,
      xMax: 0,
      yMin: 0,
      yMax: 0,
    },
    blocks: [], 
    name: '',
    place: '',
    date: new Date(),
    description: '', 
  } as Track,

  locations: [] as Array<Location>, 
  elements: [] as Array<Element>,
  results: {
    distance: 0,
    elevationGain: 0,
    elevationLoss: 0,
    time: 0,
    x: 0,
    y: 0,
    xMin: 0,
    xMax: 0,
    yMin: 0,
    yMax: 0,
  } as Result,
  blocks: [] as Array<Block>, 
  stop: true as boolean,
  tracking: false as boolean,
  watcherId: 0 as number,
  num: 0 as number,
  totalNum: 0 as number,
  collection: [] as TrackDefinition[],    
} 

export var environment = {
  production: true,
}


