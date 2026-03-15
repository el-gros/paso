import { Injectable } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';
import { TranslateService } from '@ngx-translate/core';
import maplibregl from 'maplibre-gl';
import { MapLibreLayer } from '@geoblocks/ol-maplibre-layer';

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
import { ServerService } from './server.service';
import { MbTilesService } from './mbtiles.service';
import { LocationManagerService } from './location-manager.service';
import { LocationSharingService } from './locationSharing.service';
import { ReferenceService } from '../services/reference.service';
import { PresentService } from '../services/present.service';
import { TrackingControlService } from './trackingControl.service';
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

  constructor(
    public fs: FunctionsService,
    private server: ServerService,
    private location: LocationManagerService,
    private translate: TranslateService,
    private stylerService: StylerService,
    private geography: GeographyService,
    private reference: ReferenceService,
    private present: PresentService,
    private trackingService: TrackingControlService,
    private sharing: LocationSharingService,
    private locationManager: LocationManagerService,
    private locationSharingService: LocationSharingService,
    private mbTiles: MbTilesService,
  ) {
    // 🔥 REGISTRO DEL PROTOCOLO CUSTOM PARA MAPLIBRE GL 🔥
    maplibregl.addProtocol('mbtiles', async (params, abortController) => {
      // params.url tendrá este formato: "mbtiles://cataluna-shortbread-1.0.mbtiles/14/8200/6100"
      const urlParts = params.url.replace('mbtiles://', '').split('/');
      
      const fileName = urlParts[0]; 
      const z = parseInt(urlParts[1], 10);
      const x = parseInt(urlParts[2], 10);
      const y = parseInt(urlParts[3], 10);

      // Pedimos el buffer al servicio SQLite
      const buffer = await this.mbTiles.getVectorTile(fileName, z, x, y);

      if (buffer) {
        // La nueva API requiere devolver un objeto con la propiedad 'data'
        return { data: buffer };
      } else {
        // Si no hay datos (ej. el mar), lanzamos un error que MapLibre atrapará en silencio
        throw new Error('Tile not found');
      }
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
    const mapElement = document.getElementById('map');
    if (!mapElement) return;

    this.shareControl = new ShareControl(
      this.locationManager, 
      this.locationSharingService, 
      this.translate
    );
    
    this.geography.currentLayer = await this.createLayer(this.geography.currentLayer);
    this.geography.archivedLayer = await this.createLayer(this.geography.archivedLayer);
    this.geography.searchLayer = await this.createLayer(this.geography.searchLayer);
    this.geography.locationLayer = await this.createLayer(this.geography.locationLayer);

    const result = await this.createMapLayer();
    const olLayer = result.olLayer;
    
    if (!olLayer) return;

    let minZoom = 0, maxZoom = 19, zoom = 7.5;
    const defaultCenter: [number, number] = [1.7403, 41.7282];

    if (this.geography.mapProvider.toLowerCase() === 'catalonia') {
      minZoom = 0; maxZoom = 14; zoom = 8;
    }

    if (this.geography.map) {
      const layers = this.geography.map.getLayers();
      if (layers.getLength() >= 1) {
        layers.setAt(0, olLayer);
      }
      const view = this.geography.map.getView();
      view.setMinZoom(minZoom);
      view.setMaxZoom(maxZoom);
    } else {
      const mapLayers: BaseLayer[] = [
        olLayer,
        this.geography.currentLayer,
        this.geography.archivedLayer,
        this.geography.searchLayer,
        this.geography.locationLayer,
      ].filter((l): l is BaseLayer => !!l);

      const map = new Map({
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
          new ScaleLine({
            className: 'ol-scale-line vertical-scale',
            target: 'scale-container', 
            units: 'metric'
          }),
          new Rotate()
        ],
      });

      this.geography.map = map;
      this.customControl = new LocationButtonControl(this.trackingService, this.translate);
      
      map.addControl(this.customControl);
      map.addControl(this.shareControl); 
    }

    this.mapIsReady = true;
    this.mapWrapperElement = document.getElementById('map-wrapper');
  }

  // 3. CREATE MAP LAYER //////////////////////////////////
  async createMapLayer(): Promise<{ olLayer: BaseLayer | null, credits: string }> {
    let olLayer: BaseLayer | null = null;
    let credits = '';
    
    switch (this.geography.mapProvider) {
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
        const mapType = this.geography.mapProvider.split('_')[1];
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
      
      // 🔥 CUALQUIER OTRO CASO: Se asume que es un mapa Offline (ej. 'cataluna-shortbread-1.0')
      default: {
        // Si no es un mapa online conocido, cargamos la capa hiper-rápida de MapLibre
        credits = 'Mapas Offline © OpenStreetMap contributors';
        
        olLayer = new MapLibreLayer({
          mapLibreOptions: { // <--- AQUÍ ESTÁ EL CAMBIO (L mayúscula)
            // Aquí es donde definiremos los colores y conectaremos los archivos .mbtiles
            style: 'assets/styles/offline-style.json'
          }
        });
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

  }