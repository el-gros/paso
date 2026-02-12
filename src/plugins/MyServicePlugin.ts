/*
// src/plugins/MyServicePlugin.ts

import { PluginListenerHandle, registerPlugin } from '@capacitor/core';

// 1. Define the interface for type safety
export interface MyServicePlugin {
  startService(): Promise<void>;
  stopService(): Promise<void>;
  // Este es el método que acabamos de crear en Kotlin
  setReferenceTrack(options: { coordinates: number[][] }): Promise<void>;
  isXiaomi(): Promise<{ value: boolean }>;
  openAutostartSettings(): Promise<void>;
  openBatteryOptimization(): Promise<void>;
  isIgnoringBatteryOptimizations(): Promise<{ value: boolean }>;
  addListener(
    eventName: 'location',
    listenerFunc: (data: any) => void
  ): Promise<PluginListenerHandle> & PluginListenerHandle;
}

// 2. Register the plugin using the exact name from the native side
// The name "MyServicePlugin" must match the name in the @CapacitorPlugin annotation in Kotlin.
const MyService = registerPlugin<MyServicePlugin>('PasoServicePlugin');

export default MyService;
*/
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