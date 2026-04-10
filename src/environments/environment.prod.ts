import { StyleJSON } from '../globald';
// ==========================================================================
// INTERFACES DE CONFIGURACIÓN
// ==========================================================================

/** Define la estructura de un mapa offline descargable. */
interface OfflineMapConfig {
  name: string;
  filename: string;
  url: string;
  size: number; // Size in MB
}

/** Define la estructura completa del objeto de configuración global. */
interface GlobalConfig {
  mapTilerKey: string;
  ors_key: string;
  weather_key: string;
  okButton: { text: string; role: string; cssClass: string; };
  offlineMaps: OfflineMapConfig[];
  maptiler_terrain_modified?: StyleJSON;
}

/**
 * Variables de configuración global para la aplicación en entorno de desarrollo.
 * Estos valores pueden ser sobrescritos por el entorno de producción (environment.prod.ts).
 */
export var global: GlobalConfig = {
  // ==========================================================================
  // 1. API KEYS & EXTERNAL SERVICE CONFIGURATIONS
  // ==========================================================================
  mapTilerKey: 'VndVluazDWO8Aijuzfpp',
  ors_key: '5b3ce3597851110001cf624876b05cf836e24d5aafce852a55c3ea23',
  weather_key: 'e39530f127b7c58745ddeb78f71e2019',

  // ==========================================================================
  // 2. UI CONFIGURATION & DYNAMIC GETTERS
  // ==========================================================================
  /**
   * Define las propiedades para un botón de confirmación "OK",
   * frecuentemente usado en alertas o diálogos.
   */
  get okButton() {
    return {
      text: 'OK',
      role: 'confirm',
      cssClass: 'alert-ok-button',
    };
  },

  // ==========================================================================
  // 3. OFFLINE MAPS DATA
  //    (Lista de mapas descargables, ordenada alfabéticamente por 'name')
  // =================
  offlineMaps: [
    {
      "name": "Catalunya",
      "filename": "cataluna-shortbread-1.0.mbtiles",
      "url": "https://download.geofabrik.de/europe/spain/cataluna-shortbread-1.0.mbtiles",
      "size": 247
    },
    {
      "name": "Aragón",
      "filename": "aragon-shortbread-1.0.mbtiles",
      "url": "https://download.geofabrik.de/europe/spain/aragon-shortbread-1.0.mbtiles",
      "size": 155
    },
   {
      "name": "Castilla La Mancha",
      "filename": "castilla-la-mancha-shortbread-1.0.mbtiles",
      "url": "https://download.geofabrik.de/europe/spain/castilla-la-mancha-shortbread-1.0.mbtiles",
      "size": 230
    },
    {
      "name": "Comunitat Valenciana",
      "filename": "valencia-shortbread-1.0.mbtiles",
      "url": "https://download.geofabrik.de/europe/spain/valencia-shortbread-1.0.mbtiles",
      "size": 160
    },
    {
      "name": "Galicia",
      "filename": "galicia-shortbread-1.0.mbtiles",
      "url": "https://download.geofabrik.de/europe/spain/galicia-shortbread-1.0.mbtiles",
      "size": 113
    },
    {
      "name": "Languedoc-Roussillon",
      "filename": "languedoc-roussillon-shortbread-1.0.mbtiles",
      "url": "https://download.geofabrik.de/europe/france/languedoc-roussillon-shortbread-1.0.mbtiles",
      "size": 284
    },
    {
      "name": "Midi-Pyrénées",
      "filename": "midi-pyrenees-shortbread-1.0.mbtiles",
      "url": "https://download.geofabrik.de/europe/france/midi-pyrenees-shortbread-1.0.mbtiles",
      "size": 391
    },
    {
      "name": "Navarra",
      "filename": "navarra-shortbread-1.0.mbtiles",
      "url": "https://download.geofabrik.de/europe/spain/navarra-shortbread-1.0.mbtiles",
      "size": 71
    },
 ]
}

export const environment = {
  production: true,
};
