import { PluginListenerHandle, registerPlugin } from '@capacitor/core';

// ==========================================================================
// 1. INTERFACES DE DATOS (Payloads)
// ==========================================================================

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

export interface RouteStatus {
  status: 'green' | 'red' | 'black';
  matchIndex: number;
}

// ==========================================================================
// 2. INTERFAZ DEL PLUGIN NATIVO (API Definition)
// ==========================================================================

export interface MyServicePlugin {

  // ------------------------------------------
  // A. ACCIONES (Comandos que inician/detienen procesos)
  // ------------------------------------------
  startService(): Promise<void>;
  stopService(): Promise<void>;
  setReferenceTrack(options: { coordinates: number[][] }): Promise<void>;

  // ------------------------------------------
  // B. CONSULTAS (Métodos que devuelven un estado o valor)
  // ------------------------------------------
  isXiaomi(): Promise<{ value: boolean }>;
  openAutostartSettings(): Promise<void>;
  openBatteryOptimization(): Promise<void>;
  isIgnoringBatteryOptimizations(): Promise<{ value: boolean }>;

  // ------------------------------------------
  // C. LISTENERS DE EVENTOS (Suscripciones a eventos nativos)
  // ------------------------------------------

  /**
   * Escucha eventos de actualización de ubicación en tiempo real.
   * @param eventName El nombre del evento: 'location'.
   * @param listenerFunc La función a ejecutar con cada nuevo dato de ubicación.
   * @returns Un objeto para desuscribirse del evento.
   */
  addListener(
    eventName: 'location',
    listenerFunc: (data: Location) => void 
  ): Promise<PluginListenerHandle> & PluginListenerHandle;

  /**
   * Escucha eventos de cambio de estado de la ruta (dentro/fuera de ruta).
   * @param eventName El nombre del evento: 'routeStatusUpdate'.
   * @param listenerFunc La función a ejecutar con cada actualización de estado de ruta.
   * @returns Un objeto para desuscribirse del evento.
   */
  addListener(
    eventName: 'routeStatusUpdate',
    listenerFunc: (data: RouteStatus) => void 
  ): Promise<PluginListenerHandle> & PluginListenerHandle;

  /**
   * Elimina todos los listeners registrados en el plugin nativo.
   */
  removeAllListeners(): Promise<void>;
}

// ==========================================================================
// 3. REGISTRO DEL PLUGIN
// ==========================================================================

const MyService = registerPlugin<MyServicePlugin>('MyService');

export default MyService;