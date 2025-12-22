// src/plugins/MyServicePlugin.ts

import { registerPlugin } from '@capacitor/core';

// 1. Define the interface for type safety
export interface MyServicePlugin {
  isXiaomi(): { value: any; } | PromiseLike<{ value: any; }>;
  openAutostartSettings(): unknown;
  /**
   * Starts the native Foreground Service.
   */
  startService(): Promise<void>;

  /**
   * Stops the native Foreground Service.
   */
  stopService(): Promise<void>;
}

// 2. Register the plugin using the exact name from the native side
// The name "MyServicePlugin" must match the name in the @CapacitorPlugin annotation in Kotlin.
const MyService = registerPlugin<MyServicePlugin>('MyService');

export default MyService;