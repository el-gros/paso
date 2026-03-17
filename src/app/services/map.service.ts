import { Injectable } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';
import { TranslateService } from '@ngx-translate/core';
import maplibregl from 'maplibre-gl';
import { MapLibreLayer } from '@geoblocks/ol-maplibre-layer';
import { NgZone } from '@angular/core';

// --- OPENLAYERS IMPORTS ---
import Map from 'ol/Map';
import View from 'ol/View';
import Feature from 'ol/Feature';
import { LineString, Point } from 'ol/geom';
import VectorLayer from 'ol/layer/Vector';
import TileLayer from 'ol/layer/Tile';
import VectorTileLayer from 'ol/layer/VectorTile';
import { OSM, XYZ } from 'ol/source';
import VectorSource from 'ol/source/Vector';
import VectorTileSource from 'ol/source/VectorTile';
import { VectorTile } from 'ol';
import MVT from 'ol/format/MVT';
import RenderFeature from 'ol/render/Feature';
import { createXYZ } from 'ol/tilegrid';
import TileState from 'ol/TileState';
import { Rotate, ScaleLine } from 'ol/control';
import BaseLayer from 'ol/layer/Base';
import { Coordinate } from 'ol/coordinate';

// --- UTILS & EXTERNAL ---
import { applyStyle } from 'ol-mapbox-style';
import pako from 'pako';
import { global } from '../../environments/environment';

// --- SERVICES & INTERFACES ---
import { FunctionsService } from './functions.service';
import { GeographyService } from './geography.service';
import { StylerService } from './styler.service';
import { MbTilesService } from './mbtiles.service';
import { LocationManagerService } from './location-manager.service';
import { LocationSharingService } from './locationSharing.service';
import { ReferenceService } from '../services/reference.service';
import { PresentService } from '../services/present.service';
import { TrackingControlService } from './trackingControl.service';
import { OfflineMapService } from './offline-map.service';
import { AppStateService } from '../services/appState.service';
import { LocationButtonControl } from '../utils/openlayers/custom-control';
import { ShareControl } from '../utils/openlayers/share-control';
import { Track, TrackDefinition } from '../../globald';

@Injectable({
  providedIn: 'root'
})
export class MapService {

  scaleSteps = [1, 1.75, 3.5];
  currentScaleIndex = 0;
  mapWrapperElement: HTMLElement | null = null;
  
  public customControl!: LocationButtonControl;  
  public shareControl!: ShareControl;
  
  mapIsReady: boolean = false;
  hasPendingDisplay: boolean = false;
  visibleAll: boolean = false;
  
  public locationActivated$ = new Subject<void>();
  public locationDeactivated$ = new Subject<void>();
  public shareStarted$ = new Subject<void>();
  public shareStopped$ = new Subject<void>();
  public pendingTrack$ = new BehaviorSubject<Track | null>(null);

  private offlineLayer: any = null;
  private lastStyleHash: string = '';

  private isOnline = window.navigator.onLine;
  private connectionTimeout: any = null;
  private readonly CONNECTION_GRACE_PERIOD = 5000;
  
  constructor(
    public fs: FunctionsService,
    private location: LocationManagerService,
    private translate: TranslateService,
    private stylerService: StylerService,
    private geography: GeographyService,
    private reference: ReferenceService,
    private present: PresentService,
    private trackingService: TrackingControlService,
    private locationManager: LocationManagerService,
    private locationSharingService: LocationSharingService,
    private mbTiles: MbTilesService,
    private offlineMapService: OfflineMapService,
    private zone: NgZone,
    private appState: AppStateService,
  ) {
    // 🔥 REGISTRO DEL PROTOCOLO CUSTOM PARA MAPLIBRE GL 🔥

    maplibregl.addProtocol('mbtiles', async (params) => {
      try {
        const urlWithoutScheme = params.url.replace('mbtiles://', '');
        const parts = urlWithoutScheme.split('/');

        // Extraemos las coordenadas desde el final hacia el principio con pop()
        // Esto es invulnerable a los slashes en los nombres de archivo o rutas
        const y = parseInt(parts.pop()!, 10);
        const x = parseInt(parts.pop()!, 10);
        const z = parseInt(parts.pop()!, 10);
        
        // Todo lo que quede en el array es el nombre del archivo/ruta
        const fileName = parts.join('/');

        // 🚀 Pasamos la 'y' ORIGINAL. Tu MbTilesService ya calcula el TMS internamente.
        const buffer = await this.mbTiles.getVectorTile(fileName, z, x, y);

        if (!buffer || buffer.byteLength === 0) {
          return { data: new ArrayBuffer(0) };
        }

        const uint8 = new Uint8Array(buffer);
        if (uint8[0] === 0x1f && uint8[1] === 0x8b) {
          const unzippedData = pako.inflate(uint8);
          return { data: unzippedData.buffer };
        }

        return { data: buffer };
      } catch (e) {
        console.error(`❌ Error en protocolo para ${params.url}:`, e);
        return { data: new ArrayBuffer(0) };
      }
    });

    // Escuchar cambios de conexión en tiempo real
    window.addEventListener('online', () => this.handleConnectionChange(true));
    window.addEventListener('offline', () => this.handleConnectionChange(false));
    this.appState.onEnterForeground$.subscribe(() => {
      // Al volver a la app, evaluamos inmediatamente por si la red cambió en el "bolsillo"
      this.handleConnectionChange(window.navigator.onLine, true);
    });  

    // 🚀 Escuchar cuando el servicio offline nos diga que el mapa necesita refrescarse
    this.offlineMapService.mapNeedsRefresh$.subscribe(() => {
      console.log("🗺️ MapService: Recibida orden de refresco desde OfflineMapService");
      this.loadMap();
    });

  }

  // 1. CENTER ALL TRACKS ///////////////////////////////////
  async centerAllTracks(): Promise<void> {
    const currentPosition = await this.location.getCurrentPosition();
    if (currentPosition && currentPosition.length === 2 && this.geography.map) {
      const view = this.geography.map.getView();
      view.animate({
        center: currentPosition,
        zoom: 8,        
        duration: 1000   
      });
    } else {
      console.warn("No se pudo obtener la ubicación para centrar el mapa.");
    }
  }

  // 2. LOAD MAP //////////////////////////////////////
  async loadMap(): Promise<void> {
    // Si la lista está vacía, forzamos la lectura antes de tomar decisiones.
    if (this.offlineMapService.availableMaps$.value.length === 0) {
      console.log("⏳ MapService: Esperando a que OfflineMapService lea el disco...");
      await this.offlineMapService.refreshMapsList();
    }

    const mapConfigs: Record<string, { min: number, max: number, zoom: number }> = {
      'OSM offline': { min: 0, max: 19, zoom: 8 }, 
      'default': { min: 0, max: 19, zoom: 7.5 }
    };

    const providerKey = this.geography.mapProvider.toLowerCase();
    // Detectar si es un proveedor offline genérico (si no está en el config, pero es offline)
    const isOffline = providerKey === 'OSM offline' || !['openstreetmap', 'opentopomap', 'german_osm', 'maptiler', 'icgc', 'ign'].some(p => providerKey.includes(p));
    
    const config = isOffline ? mapConfigs['OSM offline'] : mapConfigs['default'];

    const { min: minZoom, max: maxZoom, zoom } = config;
    const defaultCenter: [number, number] = [1.7403, 41.7282];
    
    if (!document.getElementById('map')) return;

    // Inicializar controles si no existen
    if (!this.shareControl) {
      this.shareControl = new ShareControl(this.locationManager, this.locationSharingService, this.translate);
    }

    // Asegurar capas vectoriales
    this.geography.currentLayer = await this.createLayer(this.geography.currentLayer);
    this.geography.archivedLayer = await this.createLayer(this.geography.archivedLayer);
    this.geography.searchLayer = await this.createLayer(this.geography.searchLayer);
    this.geography.locationLayer = await this.createLayer(this.geography.locationLayer);

    // Crear o actualizar la capa base (PUNTO 5: Limpieza interna ocurre aquí)
    const result = await this.createMapLayer();
    const olLayer = result.olLayer;
    if (!olLayer) return;

    if (this.geography.map) {
      // Actualización de mapa existente
      const layers = this.geography.map.getLayers();
      layers.setAt(0, olLayer);
      
      const view = this.geography.map.getView();
      view.setMinZoom(minZoom);
      view.setMaxZoom(maxZoom);
      // Opcional: view.setZoom(zoom); 
    } else {
      // Creación desde cero
      const mapLayers: BaseLayer[] = [
        olLayer,
        this.geography.currentLayer,
        this.geography.archivedLayer,
        this.geography.searchLayer,
        this.geography.locationLayer,
      ].filter(l => !!l);

      this.geography.map = new Map({
        target: 'map',
        layers: mapLayers,
        view: new View({
          center: defaultCenter,
          zoom: zoom,
          minZoom,
          maxZoom,
          multiWorld: false
        }),
        controls: [
          new ScaleLine({ className: 'ol-scale-line vertical-scale', target: 'scale-container', units: 'metric' }),
          new Rotate()
        ],
      });

      this.customControl = new LocationButtonControl(this.trackingService, this.translate);
      this.geography.map.addControl(this.customControl);
      this.geography.map.addControl(this.shareControl); 
    }

    this.mapIsReady = true;

    // Disparar el estilo si es offline
    if (isOffline) {
      this.geography.map.once('rendercomplete', () => {
        setTimeout(() => this.refreshOfflineStyle(), 100);
      });
    }

    this.mapWrapperElement = document.getElementById('map-wrapper');
  }

  // 3. CREATE MAP LAYER //////////////////////////////////
  async createMapLayer(): Promise<{ olLayer: BaseLayer | null, credits: string }> {
    // --- PUNTO 5: LIMPIEZA SUAVE ---
    // En lugar de destruir el motor (remove), simplemente reseteamos la referencia.
    // Esto evita que MapLibre se quede "huérfano" pero no rompe el renderizado actual.
    if (this.offlineLayer) {
      this.offlineLayer = null;
    }

    let olLayer: BaseLayer | null = null;
    let credits = '';
    // 1. Comprobamos si hay archivos descargados actualmente
    const hasOfflineFiles = this.offlineMapService.availableMaps$.value.length > 0;
    const isOnline = window.navigator.onLine;
    let provider = this.geography.mapProvider;

    // EL SALVAVIDAS UNIVERSAL
    if (!isOnline) {
      if (hasOfflineFiles) {
        // Pisa siempre la elección del usuario si no hay internet
        provider = 'OSM offline';
      } else {
        return { olLayer: null, credits: 'No connection / No offline maps' };
      }
    }

    // 3. SWITCH DE PROVEEDORES
    switch (provider) {
    
      case 'OpenStreetMap':
        credits = '© OpenStreetMap contributors';
        olLayer = new TileLayer({ source: new OSM() });
        break;

      case 'OpenTopoMap':
        credits = '© OpenStreetMap contributors, SRTM | © OpenTopoMap (CC-BY-SA)';
        olLayer = new TileLayer({
          source: new XYZ({ url: 'https://{a-c}.tile.opentopomap.org/{z}/{x}/{y}.png' })
        });
        break;

      case 'German_OSM':
        credits = '© OpenStreetMap contributors';
        olLayer = new TileLayer({
          source: new XYZ({ url: 'https://tile.openstreetmap.de/{z}/{x}/{y}.png' })
        });
        break;

      case 'MapTiler_streets':
      case 'MapTiler_outdoor':
      case 'MapTiler_hybrid': {
        const mapType = provider.split('_')[1];
        credits = '© MapTiler © OpenStreetMap contributors';
        olLayer = new TileLayer({
          source: new XYZ({
            url: `https://api.maptiler.com/maps/${mapType}/{z}/{x}/{y}.png?key=${global.mapTilerKey}`,
            crossOrigin: 'anonymous',
          }),
        });
        break;
      }

      case 'ICGC':
        credits = 'Institut Cartogràfic i Geològic de Catalunya';
        olLayer = new TileLayer({
          source: new XYZ({ url: 'https://tiles.icgc.cat/xyz/mtn1000m/{z}/{x}/{y}.jpeg' })
        });
        break;

      case 'IGN':
        credits = 'Instituto Geográfico Nacional (IGN)';
        olLayer = new TileLayer({
          source: new XYZ({
            url: 'https://www.ign.es/wmts/mapa-raster?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=MTN&STYLE=default&TILEMATRIXSET=GoogleMapsCompatible&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image/jpeg'
          })
        });
        break;

      case 'MapTiler_v_outdoor': {
        credits = '© MapTiler © OpenStreetMap contributors';
        const vtLayer = new VectorTileLayer({
          source: new VectorTileSource({
            format: new MVT(),
            url: `https://api.maptiler.com/tiles/v3/{z}/{x}/{y}.pbf?key=${global.mapTilerKey}`,
            maxZoom: 14,
          }),
        });
        await applyStyle(vtLayer, `https://api.maptiler.com/maps/outdoor/style.json?key=${global.mapTilerKey}`);
        olLayer = vtLayer;
        break;
      }

      // 🔥 CASO OFFLINE (Recuperamos la lógica simple que te funcionaba)
      case 'OSM offline':
      default: {
        if (hasOfflineFiles) {
          credits = 'Offline Maps Data';
          const dynamicStyle = this.generateDynamicStyle();
          this.offlineLayer = new MapLibreLayer({
            mapLibreOptions: { style: dynamicStyle }
          });
          olLayer = this.offlineLayer;
        } else {
          // Si por error llegamos aquí sin archivos
          olLayer = new TileLayer({ source: new OSM() }); // O un placeholder
        }
        break;
      }
    }  
    return { olLayer, credits };
  }

  // 4. DISPLAY ALL TRACKS ////////////////////////////////
  async displayAllTracks() {
    if (!this.geography.map || !this.fs.collection || this.fs.collection.length === 0 || !this.geography.archivedLayer) {
      console.warn("MapService: Faltan elementos críticos para mostrar los trayectos.");
      return;
    }

    try {
      const keys = this.fs.collection
        .filter((item: TrackDefinition) => item && item.date)
        .map((item: TrackDefinition) => {
            const dateObj = (item.date instanceof Date) ? item.date : new Date(item.date!);
            return dateObj.toISOString();
        });

      const rawTracks = await Promise.all(keys.map(key => this.fs.storeGet(key) as Promise<Track>));
      const source = this.geography.archivedLayer.getSource();
      
      if (!source) return;
      source.clear();

      const featuresToAdd: Feature[] = [];

      for (let i = 0; i < rawTracks.length; i++) {
        const track = rawTracks[i];
        const item = this.fs.collection[i];

        if (!track) continue;

        let coords: Coordinate[] | null = null;
        if (track.features?.[0]?.geometry?.coordinates) {
          coords = track.features[0].geometry.coordinates;
        } else if ((track as any).geometry?.coordinates) {
          coords = (track as any).geometry.coordinates;
        }

        if (coords && coords.length > 0) {
          const lineFeature = new Feature({ geometry: new LineString(coords) });
          lineFeature.set('type', 'archived_line'); 
          lineFeature.set('date', item.date); 
          lineFeature.setStyle(this.stylerService.setStrokeStyle('black'));
          featuresToAdd.push(lineFeature);

          const startFeature = new Feature({ geometry: new Point(coords[0]) });
          startFeature.set('type', 'archived_start');
          startFeature.set('date', item.date);
          startFeature.setStyle(this.stylerService.createPinStyle('green'));
          featuresToAdd.push(startFeature);

          const endFeature = new Feature({ geometry: new Point(coords[coords.length - 1]) });
          endFeature.set('type', 'archived_end');
          endFeature.set('date', item.date);
          endFeature.setStyle(this.stylerService.createPinStyle('red')); 
          featuresToAdd.push(endFeature);
        }
      }

      if (featuresToAdd.length === 0) {
        this.fs.displayToast(this.translate.instant('ARCHIVE.EMPTY_TRACKS'), 'error');
        return;
      }

      source.addFeatures(featuresToAdd);
      this.geography.archivedLayer.changed();
      
      setTimeout(async () => {
        await this.centerAllTracks();
        this.geography.map?.render();
      }, 150);

    } catch (error) {
      console.error("Error masivo en displayAllTracks:", error);
      this.fs.displayToast(this.translate.instant('ARCHIVE.LOADING_ERROR'), 'error');
    }
  }

  // 5. CREATE SOURCE //////////////////////////////
  async createSource(server: { getVectorTile: (z: number, x: number, y: number) => Promise<ArrayBuffer | null> }): Promise<VectorTileSource | null> {
    try {
      const epsg3857Extent = [-20037508.342789244, -20037508.342789244, 20037508.342789244, 20037508.342789244];

      return new VectorTileSource({
        format: new MVT(),
        tileGrid: createXYZ({ 
          extent: epsg3857Extent, 
          maxZoom: 22,
          tileSize: 512
        }),
        tileLoadFunction: (tile, url) => {
          const vectorTile = tile as VectorTile<RenderFeature>; 
          const [z, x, y] = vectorTile.getTileCoord();

          vectorTile.setLoader(async (extent, resolution, projection) => {
            try {
              const rawData = await server.getVectorTile(z, x, y);

              if (!rawData || rawData.byteLength === 0) {
                vectorTile.setFeatures([]);
                vectorTile.setState(TileState.EMPTY);
                return;
              }

              const decompressed = pako.inflate(new Uint8Array(rawData));
              const features = new MVT().readFeatures(decompressed.buffer, {
                extent: extent,
                featureProjection: projection, 
                dataProjection: 'EPSG:3857'   
              });

              vectorTile.setFeatures(features as RenderFeature[]);
              vectorTile.setState(TileState.LOADED);

            } catch (error) {
              console.error(`Tile load error (${z}/${x}/${y}):`, error);
              vectorTile.setState(TileState.ERROR);
            }
          });
        },
        tileUrlFunction: ([z, x, y]) => `${z}/${x}/${y}`,
        wrapX: true
      });
    } catch (e) {
      console.error('Error in createSource:', e);
      return null;
    }
  }

  // 6. CYCLE ZOOM //////////////////////////////
  async cycleZoom(): Promise<void> {
    if (!this.mapWrapperElement) {
      console.warn('Map wrapper element not found');
      return;
    }
    this.currentScaleIndex = (this.currentScaleIndex + 1) % this.scaleSteps.length;
    const scale = this.scaleSteps[this.currentScaleIndex];
    this.mapWrapperElement.style.transform = `scale(${scale})`;
  }

  // 7. CREATE LAYER ///////////////////////////////////////
  async createLayer(layer?: VectorLayer<VectorSource>): Promise<VectorLayer<VectorSource>> {
    if (!layer) layer = new VectorLayer();
    if (!layer.getSource()) layer.setSource(new VectorSource());
    return layer;
  }

  // 8. UPDATE COLORS /////////////////////////////////////////
  async updateColors() {
    const updateLayer = (layer: VectorLayer<VectorSource> | undefined, color: string) => {
      const features = layer?.getSource()?.getFeatures();
      features?.forEach((f: Feature) => {
        const geom = f.getGeometry();
        if (geom && geom.getType() === 'LineString') {
          f.setStyle(this.stylerService.setStrokeStyle(color));
        }
      });
      layer?.changed();
    };
    updateLayer(this.geography.currentLayer, this.present.currentColor);
    updateLayer(this.geography.archivedLayer, this.reference.archivedColor);
    this.geography.map?.render();
    this.fs.reDraw = false;
  }

  private generateDynamicStyle() {
    const openedFiles = this.mbTiles.getOpenedFiles();

    // Paleta de colores suave y moderna
    const THEME = {
      background: '#f8f4f0',
      water: '#a1cae2',
      forest: '#d2e3bc',
      park: '#dbe9c6',
      roadCasing: '#cfc7bc',
      highway: '#f7c352',
      majorRoad: '#f9d88d',
      minorRoad: '#ffffff',
      buildings: '#e8e4e0',
      text: '#5d5854',
      fonts: ["OpenSansRegular"] // Usaremos solo esta fuente
      //fonts: ["Open Sans Regular"]
    };

    const style: any = {
      version: 8,
      name: "Shortbread Offline Style",
      // 🚀 Cargamos las fuentes desde la carpeta local del dispositivo
      glyphs: "/assets/fonts/{fontstack}/{range}.pbf",
      //glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
      sources: {},
      layers: [
        {
          id: 'background',
          type: 'background',
          paint: { 'background-color': THEME.background }
        }
      ]
    };

    const waterLayers: any[] = [];
    const landLayers: any[] = [];
    const buildingLayers: any[] = [];
    const roadLayers: any[] = [];
    const labelLayers: any[] = [];

    openedFiles.forEach((fileName: string) => {
      const sourceId = `src_${fileName.replace(/[^a-zA-Z0-9]/g, '_')}`;

      style.sources[sourceId] = {
        type: 'vector',
        tiles: [`mbtiles://${fileName}/{z}/{x}/{y}`],
        minzoom: 0,
        maxzoom: 14 // Geofabrik llega hasta el zoom 14
      };

      // --- AGUA ---
      waterLayers.push(
        {
          id: `ocean_${sourceId}`,
          type: 'fill',
          source: sourceId,
          'source-layer': 'ocean',
          paint: { 'fill-color': THEME.water }
        },
        {
          id: `water_polygons_${sourceId}`,
          type: 'fill',
          source: sourceId,
          'source-layer': 'water_polygons',
          paint: { 'fill-color': THEME.water }
        }
      );

      // --- NATURALEZA ---
      landLayers.push({
        id: `land_forest_${sourceId}`,
        type: 'fill',
        source: sourceId,
        'source-layer': 'land',
        filter: ['in', 'kind', 'forest', 'wood', 'nature_reserve', 'national_park'],
        paint: { 'fill-color': THEME.forest }
      },
      {
        id: `land_park_${sourceId}`,
        type: 'fill',
        source: sourceId,
        'source-layer': 'land',
        filter: ['in', 'kind', 'park', 'grass', 'garden', 'pitch'],
        paint: { 'fill-color': THEME.park }
      });

      // --- EDIFICIOS ---
      buildingLayers.push({
        id: `buildings_${sourceId}`,
        type: 'fill',
        source: sourceId,
        'source-layer': 'buildings',
        minzoom: 13, // Solo se dibujan al acercarse mucho
        paint: { 
          'fill-color': THEME.buildings,
          'fill-outline-color': '#dfdcd8'
        }
      });

      // --- CARRETERAS ---
      roadLayers.push(
        {
          id: `road_casing_${sourceId}`,
          type: 'line',
          source: sourceId,
          'source-layer': 'streets',
          minzoom: 10,
          paint: {
            'line-color': THEME.roadCasing,
            'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 10, 1.5, 18, 12]
          }
        },
        {
          id: `road_inner_${sourceId}`,
          type: 'line',
          source: sourceId,
          'source-layer': 'streets',
          minzoom: 10,
          paint: {
            'line-color': [
              'match', ['get', 'kind'],
              'motorway', THEME.highway,
              'trunk', THEME.highway,
              'primary', THEME.majorRoad,
              'secondary', THEME.majorRoad,
              THEME.minorRoad
            ],
            'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 10, 0.5, 18, 10]
          }
        }
      );

    // --- ETIQUETAS Y NOMBRES ---
    // Hacemos un solo push con las dos capas para asegurarnos de no duplicar IDs
    labelLayers.push(
      // 1. Nombres de las calles
      {
        id: `street_labels_${sourceId}`,
        type: 'symbol',
        source: sourceId,
        'source-layer': 'street_labels',
        minzoom: 13,
        layout: {
          'text-field': ['get', 'name'],
          'text-font': THEME.fonts,
          'symbol-placement': 'line',
          'text-size': 12,
          'text-max-angle': 30
        },
        paint: {
          'text-color': THEME.text,
          'text-halo-color': '#ffffff',
          'text-halo-width': 2
        }
      },
      // 2. Nombres de pueblos y ciudades
      {
        id: `places_${sourceId}`,
        type: 'symbol',
        source: sourceId,
        'source-layer': 'place_labels',
        minzoom: 5,
        layout: {
          'text-field': ['get', 'name'], 
          'text-font': THEME.fonts,
          'text-size': [
            'match', ['get', 'kind'],
            'city', 18,
            'town', 14,
            'village', 12,
            10
          ],
          'text-variable-anchor': ['center', 'top', 'bottom'],
          'text-justify': 'center'
        },
        paint: {
          'text-color': THEME.text,
          'text-halo-color': '#ffffff',
          'text-halo-width': 2
        }
      }
    );

  });

    // Juntamos todas las capas en el orden correcto
    style.layers.push(...waterLayers, ...landLayers, ...buildingLayers, ...roadLayers, ...labelLayers);

    return style;
  }

  public refreshOfflineStyle() {
    if (!this.offlineLayer) return;

    const maplibreMap = (this.offlineLayer as any).mapLibreMap;

    if (maplibreMap?.setStyle) {
      const newStyle = this.generateDynamicStyle();
      const currentHash = JSON.stringify(newStyle.sources); // Hash simple por fuentes

      if (this.lastStyleHash !== currentHash) {
        console.log("🚀 Aplicando nuevo estilo con Diff...");
        maplibreMap.setStyle(newStyle, { diff: true });
        this.lastStyleHash = currentHash;
      }
    } else {
      // Reintento más corto para mejor sensación de carga
      setTimeout(() => this.refreshOfflineStyle(), 500);
    }
  }

  /**
     * Maneja la lógica de conmutación de mapas basada en red y visibilidad de la app
     * @param online Estado actual de la red
     * @param immediate Si es true, ignora el delay de cortesía (útil al volver a foreground)
     */
  // En MapService.ts

  private async handleConnectionChange(online: boolean, immediate: boolean = false) {
    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
      this.connectionTimeout = null;
    }

    if (!this.appState.currentForegroundValue) {
      return;
    }

    if (online || immediate) {
      // Si vuelve la red o abrimos la app, recargamos. 
      // Si estábamos en un mapa online que hizo fallback a offline, esto lo devolverá a su estado online.
      // Si ya estábamos explícitamente en 'OSM offline', no pasará nada visualmente.
      if (this.geography.mapProvider !== 'OSM offline') {
          console.log("🌐 Red recuperada: Restaurando mapa online...");
          await this.loadMap();
      }
      return;
    }

    // PÉRDIDA DE RED
    console.log(`📡 Señal perdida. Esperando ${this.CONNECTION_GRACE_PERIOD / 1000}s de cortesía...`);
    
    this.zone.runOutsideAngular(() => {
      this.connectionTimeout = setTimeout(async () => {
        
        if (!window.navigator.onLine && this.appState.currentForegroundValue) {
          
          this.zone.run(async () => {
            const hasFiles = this.offlineMapService.availableMaps$.value.length > 0;
            const provider = this.geography.mapProvider;

            // Si el usuario estaba viendo un mapa online y tenemos archivos salvavidas:
            if (hasFiles && provider !== 'OSM offline') {
              console.log("🔄 Timeout cumplido: Salvavidas activado. Pasando a Offline.");
              this.fs.displayToast(this.translate.instant('SETTINGS.OFFLINE_MODE_ON'), 'warning');
              await this.loadMap();
            }
          });
        }
        this.connectionTimeout = null;
      }, this.CONNECTION_GRACE_PERIOD);
    });
  }

}