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
  time: number,
  compSpeed: number,
  distance: number,
}

export interface Waypoint {
  latitude: number;
  longitude: number;
  altitude?: number;
  name?: string;
  comment?: string;
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
    bbox?: [number, number, number, number],
    geometry: {
      type: 'LineString',
      coordinates: number[][],
      properties: {
        data: Data[]
      }
    }
    waypoints?: Waypoint []
  }]
}

export interface TrackDefinition {
  name: string,
  date: Date,
  place: string,
  description: string,
  isChecked: boolean
}
export interface StyleJSON {
  layers: Array<{
    type: string;
    'source-layer': string;
    filter?: any[];
    minzoom?: number | { [rank: number]: number };
    maxzoom?: number;
    paint?: { [key: string]: any };
    layout?: { [key: string]: any };
  }>;
}
export interface Map {
  filename?: string;
  url?: string;
  size?: number;
  update?: string;
  labels?: string[];
  name: string,
  image?: string,
}

export interface ModalEditData {
  name: string;
  place: string;
  description: string;
}

export interface LocationResult {
  lon: number;
  lat: number;
  name: string;
  [key: string]: any;
}

export interface Route {
  features: any[]; // Replace `any` with a more specific type if available
  trackName?: string;
  [key: string]: any;
}

export interface LanguageOption {
  name: string;
  code: string;
}

export interface ParsedPoint {
  lat: number;
  lon: number;
  ele?: number;
  time?: number;
}

