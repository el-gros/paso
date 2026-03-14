import { PluginListenerHandle, registerPlugin } from '@capacitor/core';

export interface Location {
  longitude: number;
  latitude: number;
  accuracy: number;
  altitude: number;
  altitudeAccuracy: number;
  bearing: number;
  simulated: boolean;
  speed: number;
  time: number;
  isMSL?: boolean;
}

// Nueva interfaz para el estado de la ruta
export interface RouteStatus {
  status: 'green' | 'red' | 'black';
  matchIndex: number;
}

export interface MyServicePlugin {
  startService(): Promise<void>;
  stopService(): Promise<void>;
  setReferenceTrack(options: { coordinates: number[][] }): Promise<void>;
  isXiaomi(): Promise<{ value: boolean }>;
  openAutostartSettings(): Promise<void>;
  openBatteryOptimization(): Promise<void>;
  isIgnoringBatteryOptimizations(): Promise<{ value: boolean }>;
  updateSharingConfig(options: {
    isSharing: boolean;
    shareToken?: string;
    deviceId?: string;
    supabaseUrl?: string;
    supabaseKey?: string;
  }): Promise<void>;

  // Evento original de ubicación
  addListener(
    eventName: 'location',
    listenerFunc: (data: Location) => void 
  ): Promise<PluginListenerHandle> & PluginListenerHandle;

  // 👇 NUEVO EVENTO: Estado de la ruta e índice de coincidencia
  addListener(
    eventName: 'routeStatusUpdate',
    listenerFunc: (data: RouteStatus) => void 
  ): Promise<PluginListenerHandle> & PluginListenerHandle;

  removeAllListeners(): Promise<void>;
}

const MyService = registerPlugin<MyServicePlugin>('MyService');

export default MyService;