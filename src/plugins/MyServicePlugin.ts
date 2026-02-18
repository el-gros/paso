import { PluginListenerHandle, registerPlugin } from '@capacitor/core';

// Tu interfaz de localización (puedes exportarla desde un archivo de modelos)
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
}

export interface MyServicePlugin {
  startService(): Promise<void>;
  stopService(): Promise<void>;
  setReferenceTrack(options: { coordinates: number[][] }): Promise<void>;
  isXiaomi(): Promise<{ value: boolean }>;
  openAutostartSettings(): Promise<void>;
  openBatteryOptimization(): Promise<void>;
  isIgnoringBatteryOptimizations(): Promise<{ value: boolean }>;

  addListener(
    eventName: 'location',
    listenerFunc: (data: Location) => void 
  ): Promise<PluginListenerHandle> & PluginListenerHandle;

  removeAllListeners(): Promise<void>;
}

const MyService = registerPlugin<MyServicePlugin>('PasoServicePlugin');

export default MyService;