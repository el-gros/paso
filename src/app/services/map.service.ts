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
import { MapStyleService } from './map-style.service';
import { FunctionsService } from './functions.service';
import { GeographyService } from './geography.service';
import { StylerService } from './styler.service';
import { MbTilesService } from './mbtiles.service';
import { LocationManagerService } from './location-manager.service';
import { ReferenceService } from '../services/reference.service';
import { PresentService } from '../services/present.service';
import { TrackingControlService } from './trackingControl.service';
import { OfflineMapService } from './offline-map.service';
import { AppStateService } from '../services/appState.service';
import { SearchService } from './search.service';
import { LocationButtonControl } from '../utils/openlayers/custom-control';
import { Track, TrackDefinition } from '../../globald';

@Injectable({
  providedIn: 'root'
})
export class MapService {

  scaleSteps = [1, 1.75, 3.5];
  currentScaleIndex = 0;
  private zoomTimeout: any;
  mapWrapperElement: HTMLElement | null = null;
  
  public customControl!: LocationButtonControl;  
  
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
    private locationManager: LocationManagerService,
    private translate: TranslateService,
    private stylerService: StylerService,
    private geography: GeographyService,
    private reference: ReferenceService,
    private present: PresentService,
    private trackingService: TrackingControlService,
    private mbTiles: MbTilesService,
    private offlineMapService: OfflineMapService,
    private zone: NgZone,
    private appState: AppStateService,
    private searchService: SearchService,
    private mapStyle: MapStyleService,
  ) {
    // 🔥 REGISTRO DEL PROTOCOLO CUSTOM PARA MAPLIBRE GL 🔥

    maplibregl.addProtocol('mbtiles', async (params) => {
      try {
        const urlWithoutScheme = params.url.replace('mbtiles://', '');
        const parts = urlWithoutScheme.split('/');

        const y = parseInt(parts.pop()!, 10);
        const x = parseInt(parts.pop()!, 10);
        const z = parseInt(parts.pop()!, 10);
        
        const fileName = parts.join('/');

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
      this.handleConnectionChange(window.navigator.onLine, true);
    });  

    // Escuchar cuando el servicio offline nos diga que el mapa necesita refrescarse
    this.offlineMapService.mapNeedsRefresh$.subscribe(() => {
      console.log("🗺️ MapService: Recibida orden de refresco desde OfflineMapService");
      this.loadMap();
    });
  }

  // ==========================================================================
  // 1. INICIALIZACIÓN Y CARGA DEL MAPA
  // ==========================================================================

  async loadMap(): Promise<void> {
    if (this.offlineMapService.availableMaps$.value.length === 0) {
      console.log("⏳ MapService: Esperando a que OfflineMapService lea el disco...");
      await this.offlineMapService.refreshMapsList();
    }

    const mapConfigs: Record<string, { min: number, max: number, zoom: number }> = {
      'OSM offline': { min: 0, max: 19, zoom: 8 }, 
      'default': { min: 0, max: 19, zoom: 7.5 }
    };

    const providerKey = this.geography.mapProvider.toLowerCase();
    const isOffline = providerKey === 'OSM offline' || !['openstreetmap', 'opentopomap', 'german_osm', 'maptiler', 'icgc', 'ign'].some(p => providerKey.includes(p));
    
    const config = isOffline ? mapConfigs['OSM offline'] : mapConfigs['default'];

    const { min: minZoom, max: maxZoom, zoom } = config;
    const defaultCenter: [number, number] = [1.7403, 41.7282];
    
    if (!document.getElementById('map')) return;

    this.geography.currentLayer = await this.createLayer(this.geography.currentLayer);
    this.geography.archivedLayer = await this.createLayer(this.geography.archivedLayer);
    this.geography.searchLayer = await this.createLayer(this.geography.searchLayer);
    this.geography.locationLayer = await this.createLayer(this.geography.locationLayer);
    this.geography.placesLayer = await this.createLayer(this.geography.placesLayer);
    this.geography.placesLayer.setZIndex(15);

    const result = await this.createMapLayer();
    const olLayer = result.olLayer;
    if (!olLayer) return;

    if (this.geography.map) {
      const layers = this.geography.map.getLayers();
      layers.setAt(0, olLayer);
      
      const view = this.geography.map.getView();
      view.setMinZoom(minZoom);
      view.setMaxZoom(maxZoom);
    } else {
      const mapLayers: BaseLayer[] = [
        olLayer,
        this.geography.currentLayer,
        this.geography.archivedLayer,
        this.geography.searchLayer,
        this.geography.placesLayer,
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

      this.customControl = new LocationButtonControl(this.trackingService, this.translate, this.searchService);
      this.geography.map.addControl(this.customControl);
    }

    this.mapIsReady = true;

    // Disparar el estilo si es offline (LLAMANDO CORRECTAMENTE AL MAPSTYLE SERVICE)
    if (isOffline) {
      this.geography.map.once('rendercomplete', () => {
        setTimeout(() => this.mapStyle.refreshOfflineStyle(this.offlineLayer), 100);
      });
    }

    this.mapWrapperElement = document.getElementById('map-wrapper');

    if (this.geography.placesLayer) {
      this.geography.refreshPlacesLayer(this.fs.placesCollection);
    }
  }

  async createMapLayer(): Promise<{ olLayer: BaseLayer | null, credits: string }> {
    if (this.offlineLayer) {
      this.offlineLayer = null;
    }

    let olLayer: BaseLayer | null = null;
    let credits = '';
    const hasOfflineFiles = this.offlineMapService.availableMaps$.value.length > 0;
    const isOnline = window.navigator.onLine;
    let provider = this.geography.mapProvider;

    if (!isOnline) {
      if (hasOfflineFiles) {
        provider = 'OSM offline';
      } else {
        return { olLayer: null, credits: this.translate.instant('MAP.NO_CONNECTION_ERROR') };
      }
    }

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

      case 'OSM offline':
      default: {
        if (hasOfflineFiles) {
          credits = this.translate.instant('MAP.OFFLINE_CREDITS');
          const dynamicStyle = this.mapStyle.generateDynamicStyle();
          this.offlineLayer = new MapLibreLayer({
            mapLibreOptions: { style: dynamicStyle }
          });
          olLayer = this.offlineLayer;
        } else {
          olLayer = new TileLayer({ source: new OSM() }); 
        }
        break;
      }
    }  
    return { olLayer, credits };
  }

  // ==========================================================================
  // 3. MOTOR DE VECTOR TILES (Offline Engine)
  // ==========================================================================

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

          // SIN ASYNC AQUÍ (Solución al error TS2345)
          vectorTile.setLoader((extent, resolution, projection) => {
            
            (async () => {
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
            })();

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

  /**
   * Cambia la escala visual del mapa (transform scale) para simular
   * mayor o menor densidad de información en pantalla.
   */
  async cycleZoom(): Promise<void> {
    if (!this.mapWrapperElement) {
      console.warn('Map wrapper element not found');
      return;
    }

    // 1. Limpiar el temporizador anterior si existe
    if (this.zoomTimeout) {
      clearTimeout(this.zoomTimeout);
    }

    // 2. Cambiar el zoom normalmente
    this.currentScaleIndex = (this.currentScaleIndex + 1) % this.scaleSteps.length;
    const scale = this.scaleSteps[this.currentScaleIndex];
    this.mapWrapperElement.style.transform = `scale(${scale})`;

    // 3. Si el zoom no es el inicial (0), programar el regreso
    if (this.currentScaleIndex !== 0) {
      this.zoomTimeout = setTimeout(() => {
        this.resetZoom();
      }, 60000); // 1 minuto
    }
  }

  private resetZoom() {
    if (this.mapWrapperElement) {
      this.currentScaleIndex = 0;
      const initialScale = this.scaleSteps[0];
      this.mapWrapperElement.style.transform = `scale(${initialScale})`;
      console.log('Zoom restablecido automáticamente a 1.0');
    }
  }

  async createLayer(layer?: VectorLayer<VectorSource>): Promise<VectorLayer<VectorSource>> {
    if (!layer) layer = new VectorLayer();
    if (!layer.getSource()) layer.setSource(new VectorSource());
    return layer;
  }

  // ==========================================================================
  // 4. GESTIÓN DE CONECTIVIDAD
  // ==========================================================================

  private async handleConnectionChange(online: boolean, immediate: boolean = false) {
    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
      this.connectionTimeout = null;
    }

    if (!this.appState.currentForegroundValue) {
      return;
    }

    if (online || immediate) {
      if (this.geography.mapProvider !== 'OSM offline') {
          console.log("🌐 Red recuperada: Restaurando mapa online...");
          await this.loadMap();
      }
      return;
    }

    console.log(`📡 Señal perdida. Esperando ${this.CONNECTION_GRACE_PERIOD / 1000}s de cortesía...`);
    
    this.zone.runOutsideAngular(() => {
      this.connectionTimeout = setTimeout(async () => {
        
        if (!window.navigator.onLine && this.appState.currentForegroundValue) {
          
          this.zone.run(async () => {
            const hasFiles = this.offlineMapService.availableMaps$.value.length > 0;
            const provider = this.geography.mapProvider;

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