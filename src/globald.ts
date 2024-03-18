export interface Location {
    longitude: number,
    latitude: number,
    accuracy: number,
    altitude: number,
    altitudeAccuracy: number,
    bearing: number,
    simulated: boolean,
    speed: number,
    instantSpeed: number,
    time: number
  }

  export interface Point {
    x: number,
    y: number
  }

  export interface Element {
    distance: number,
    elevationGain: number,
    elevationLoss: number,
    time: number,
    x: number,
    y: number,
  }
  
  export interface Result {
    distance: number,
    elevationGain: number,
    elevationLoss: number,
    time: number,
    x: number,
    y: number,
    xMax: number,
    xMin: number,
    yMax: number,
    yMin: number,
  }
  
  export interface Block {
    min: number,
    max: number,
  }

  export interface Track {
    name: string,
    date: Date,
    place: string,
    locations: Location[],
    elements: Element[],
    blocks: Block[],
    results: Result,
    description: string,
  }

  export interface TrackDefinition {
    name: string,
    date: Date,
    place: string,
    description: string,
    isChecked: boolean
  }


  /*
  export interface MapBounds {
    lon: {min: number, max: number},
    lat: {min: number, max: number},
  }

  export interface Bounds {min: number, max: number}

export interface Point {
  x: number, 
  y: number
}
*/




