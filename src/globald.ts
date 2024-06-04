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
  //  accuracy: number,
    altitude: number,
  //  altitudeAccuracy: number,
  //  bearing: number,
  //  simulated: boolean,
    speed: number,
 //    time: number,
    compSpeed: number,
    distance: number,
    elevationGain: number,
    elevationLoss: number,
  //  accTime: number,
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

