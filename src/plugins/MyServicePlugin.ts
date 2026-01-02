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
  addListener(
    eventName: 'location',
    listenerFunc: (data: any) => void
  ): Promise<PluginListenerHandle> & PluginListenerHandle;
}

// 2. Register the plugin using the exact name from the native side
// The name "MyServicePlugin" must match the name in the @CapacitorPlugin annotation in Kotlin.
const MyService = registerPlugin<MyServicePlugin>('PasoServicePlugin');

export default MyService;