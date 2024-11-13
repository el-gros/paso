export interface Location {
  longitude: number,
  latitude: number,
  accuracy: number,
  altitude: number,
  altitudeAccuracy: number,
  bearing: number,
  simulated: boolean,
  speed: number,
  time: number,
}

export interface Data {
  altitude: number,
  speed: number,
  compSpeed: number,
  distance: number,
}


export interface Bounds {
  min: number,
  max: number,
}

export interface Track {
  type: string,
  features: [{
    type: string,
    properties: {
      currentSpeed: any
      currentAltitude: any
      name: string,
      place: string,
      date: Date | undefined,
      description: string,
      totalDistance: number,
      totalTime: any,
      totalElevationGain: number,
      totalElevationLoss: number,
      totalNumber: number,
    },
    geometry: {
      type: 'LineString',
      coordinates: number[][],
      properties: {
        data: {
          altitude: number,
          speed: number,
          time: number,
          compSpeed: number,
          distance: number
        }[]
      }
    }
  }]  
}

export interface TrackDefinition {
  name: string,
  date: Date,
  place: string,
  description: string,
  isChecked: boolean
}

export interface Extremes {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} 
