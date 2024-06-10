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
        name: string,
        place: string,
        date: Date,
        description: string,
        totalDistance: number,
        totalTime: string,
        totalElevationGain: number,
        totalElevationLoss: number,
        totalNumber: number,
      },
      geometry: {
        type: 'LineString',
        coordinates: [],
        properties: {
          data: [],
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

