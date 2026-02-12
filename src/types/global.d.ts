import { CapacitorGlobal } from '@capacitor/core';

declare global {
  interface Window {
    Capacitor: CapacitorGlobal;
  }
}
/*
// This ensures TypeScript knows what to do with the global Capacitor object
// even though it's injected at runtime.

import '@capacitor/core';

declare global {
  interface Window {
    // 1. Fixes 'window.Capacitor' is possibly 'undefined'
    Capacitor: {
      // 2. Fixes 'Property 'Plugins' does not exist on type 'CapacitorGlobal'.'
      Plugins: { 
        [pluginName: string]: any; 
      };
      isNative: boolean;
      // Include other properties you use, like platform, etc.
      [key: string]: any;
    } | undefined;
  }
} */