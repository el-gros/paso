// ==========================================================================
// 1. CORE DATA MODELS (Datos fundamentales del track)
// ==========================================================================

export interface Data {
  altitude: number;
  speed: number;
  time: number;
  compSpeed: number;
  compAltitude: number;
  distance: number;
  geoidApplied?: boolean;
  isMSL?: boolean;
}

export interface Waypoint {
  latitude: number;
  longitude: number;
  altitude?: number;
  name?: string;
  comment?: string;
  photos?: string[];
}

export interface ParsedPoint {
  lat: number;
  lon: number;
  ele?: number;
  time?: number;
}

// ==========================================================================
// 2. TRACK DATA STRUCTURES (Estructuras completas de la ruta)
// ==========================================================================

export interface Bounds {
  min: number;
  max: number;
}

/** Representa una colección de Features GeoJSON que forman una ruta completa. */
export interface Track {
  type: 'FeatureCollection'; 
  features: TrackFeature[];
}

/** Define las propiedades y la geometría de un segmento de ruta individual. */
export interface TrackFeature {
  type: 'Feature';
  properties: {
    currentSpeed?: number;
    currentAltitude?: number;
    name: string;
    place: string | number[];
    date?: Date | string | undefined
    description: string;
    totalDistance: number;
    totalTime: number;
    inMotion: number;
    totalElevationGain: number;
    totalElevationLoss: number;
    totalNumber: number;
  };
  bbox?: [number, number, number, number];
  geometry: {
    type: 'LineString';
    coordinates: [number, number][]; // Array de pares longitud, latitud
    properties: {
      data: Data[];
    };
  };
  waypoints?: Waypoint[];
}

export interface TrackDefinition {
  name: string,
  date: Date | undefined,
  place: string | number[],
  description: string,
  isChecked?: boolean,
  coverPhoto?: string;
  photos?: string[];
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

export interface PartialSpeed extends Array<string | number> {
  0: string;  
  1: string;  
  2: number;  
}

export interface Route {
  features: any[]; 
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

export interface ParseResult {
  waypoints: Waypoint[];
  trackPoints: ParsedPoint[];
  trk: Element | null; // Tipo nativo de DOM
}

export interface WikiData {
  title: string;
  extract: string;
  thumbnail?: string;
}

// Interface for the Route Status event payload
export interface RouteStatusPayload {
  status: 'green' | 'red' | 'black';
}

export interface WikiWeatherResult {
  wiki: any;
  weather: any;
  locationName: string;
}

export interface LocationResult {
  lat: number;
  lon: number;
  name: string;
  display_name: string;
  short_name?: string;
  type?: string;
  place_id?: number;
  boundingbox?: number[];
  geojson?: any;
  categories?: string[]; 
  description?: string; 
  visible?: boolean;
  class?: string;
  addresstype?: string;
  place_rank?: number;
}

export const PLACE_CATEGORIES = [
  { id: 'towns', icon: 'business-outline', color: 'primary' },
  { id: 'mountain', icon: 'terrain-outline', color: 'success' },
  { id: 'water', icon: 'water-outline', color: 'tertiary' },
  { id: 'accommodation', icon: 'bed-outline', color: 'warning' },
  { id: 'poi', icon: 'camera-outline', color: 'secondary' },
  { id: 'food', icon: 'restaurant-outline', color: 'danger' },
  { id: 'logistics', icon: 'car-outline', color: 'medium' },
  { id: 'favorite', icon: 'star-outline', color: 'warning' },
  { id: 'other', icon: 'apps-outline', color: 'dark' }
];