// src/app/services/MyPasoPlugin.ts
import { registerPlugin } from '@capacitor/core';
import { Location } from 'src/globald';

export interface MyPasoPluginPlugin {
  startService(): Promise<void>;
  stopService(): Promise<void>;
  addListener(eventName: 'location', listenerFunc: (location: Location) => void): any;
}

export const MyPasoPlugin = registerPlugin<MyPasoPluginPlugin>('Paso', {
  web: () => ({
    startService: async () => {
      console.warn('PasoPlugin.startService() not implemented on web');
    },
    stopService: async () => {
      console.warn('PasoPlugin.stopService() not implemented on web');
    },
    addListener: (eventName: 'location', listenerFunc: (location: Location) => void) => {
      console.warn('PasoPlugin.addListener() not implemented on web');
      return { remove: () => {} };
    },
  }),
});
