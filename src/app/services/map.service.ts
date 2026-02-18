import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, of, Subject, throwError } from 'rxjs';
import { map, catchError, filter, take } from 'rxjs/operators';
import { TranslateService } from '@ngx-translate/core';

// --- OPENLAYERS IMPORTS ---
import Map from 'ol/Map';
import View from 'ol/View';
import Feature from 'ol/Feature';
import { MultiLineString, MultiPoint, Geometry, LineString, Point } from 'ol/geom';
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
import { Rotate, ScaleLine, Zoom, Control } from 'ol/control';
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
import { LocationManagerService } from './location-manager.service';
import { LocationSharingService } from './locationSharing.service';
import { ReferenceService } from '../services/reference.service';
import { PresentService } from '../services/present.service';
import { TrackingControlService } from './trackingControl.service';
import { LocationButtonControl } from '../utils/openlayers/custom-control';
import { ShareControl } from '../utils/openlayers/share-control';
import { Track, ParsedPoint, Waypoint, LocationResult, TrackDefinition } from '../../globald';

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
    private http: HttpClient,
    public fs: FunctionsService,
    private server: ServerService,
    private location: LocationManagerService,
    private translate: TranslateService,
    private stylerService: StylerService,
    private geography: GeographyService,
    private reference: ReferenceService,
    private present: PresentService,
    private trackingService: TrackingControlService,
    private sharing: LocationSharingService
  ) { 
  }

  // 1. CENTER ALL TRACKS
  async centerAllTracks(): Promise<void> {
    const currentPosition = await this.location.getCurrentPosition();
    // Validamos que sea una coordenada válida [lon, lat]
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

    // A. Inicializar Controles
    this.shareControl = new ShareControl(this.location, this.translate);

    this.shareControl.onShareStart = async () => {
      console.log('🚀 Iniciando compartido desde el mapa...');
      return await this.sharing.startSharing();
    };

    this.shareControl.onShareStop = async () => {
      console.log('🛑 Deteniendo compartido desde el mapa...');
      await this.sharing.stopSharing();
    };

    // B. Inicializar Capas Vectoriales (Tipado estricto)
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

    // 🟢 CASO 1 — El mapa ya existe (Actualizar proveedor)
    if (this.geography.map) {
      const layers = this.geography.map.getLayers();
      if (layers.getLength() >= 1) {
        layers.setAt(0, olLayer);
      }
      const view = this.geography.map.getView();
      view.setMinZoom(minZoom);
      view.setMaxZoom(maxZoom);
    } 
    // 🟢 CASO 2 — Inicializar mapa nuevo
    else {
      // Definir array de capas con tipo BaseLayer para evitar conflictos
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
          new Zoom(),
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
    this.initAutoCenter();
  }

  // 2. BIS. INIT AUTO CENTER //////////////////////////////////
  private initAutoCenter() {
    this.location.latestLocation$.pipe(
      filter(loc => !!loc),
      take(1)
    ).subscribe(nextLoc => {
      if (this.geography.map && nextLoc) {
        this.geography.map.getView().animate({
          center: [nextLoc.longitude, nextLoc.latitude],
          zoom: 14,
          duration: 1500, 
          easing: (t) => t * (2 - t)
        });
      }
    });
  }

  // 3. CREATE MAP LAYER
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
          source: new XYZ({
            url: 'https://{a-c}.tile.opentopomap.org/{z}/{x}/{y}.png'
          })
        });
        break;
      case 'German_OSM':
        credits = '© OpenStreetMap contributors';
        olLayer = new TileLayer({
          source: new XYZ({
            url: 'https://tile.openstreetmap.de/{z}/{x}/{y}.png'
          })
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
          source: new XYZ({
            url: 'https://tiles.icgc.cat/xyz/mtn1000m/{z}/{x}/{y}.jpeg'
          })
        });
        break;
      case 'IGN':
        credits = 'Instituto Geográfico Nacional (IGN)';
        olLayer = new TileLayer({
          source: new XYZ({
            url:
              'https://www.ign.es/wmts/mapa-raster?' +
              'SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=MTN&STYLE=default' +
              '&TILEMATRIXSET=GoogleMapsCompatible&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image/jpeg'
          })
        });
        break;
      case 'catalonia': {
        await this.server.openMbtiles('catalonia.mbtiles');
        const sourceResult = await this.createSource(this.server);
        if (sourceResult) {
            olLayer = new VectorTileLayer({
                source: sourceResult,
                style: this.stylerService.styleFunction
            });
        }
        break;
      }
      case 'MapTiler_v_outdoor':
        credits = '© MapTiler © OpenStreetMap contributors';
        const vtLayer = new VectorTileLayer({
          source: new VectorTileSource({
            format: new MVT(),
            url: `https://api.maptiler.com/tiles/v3/{z}/{x}/{y}.pbf?key=${global.mapTilerKey}`,
            maxZoom: 14,
          }),
        });
        await applyStyle(
          vtLayer,
          `https://api.maptiler.com/maps/outdoor/style.json?key=${global.mapTilerKey}`
        );
        olLayer = vtLayer;
        break;
      default:
        credits = '© OpenStreetMap contributors';
        olLayer = new TileLayer({ source: new OSM() });
    }
    return { olLayer, credits };
  }

  // 4. DISPLAY ALL TRACKS
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
        // --- 1. LÍNEA DEL TRACK ---
        const lineFeature = new Feature({
          geometry: new LineString(coords)
        });
        lineFeature.set('type', 'archived_line'); 
        lineFeature.set('date', item.date); 
        lineFeature.setStyle(this.stylerService.setStrokeStyle('black'));
        featuresToAdd.push(lineFeature);

        // --- 2. PUNTO DE INICIO (PIN VERDE) ---
        const startFeature = new Feature({
          geometry: new Point(coords[0])
        });
        startFeature.set('type', 'archived_start');
        startFeature.set('date', item.date);
        startFeature.setStyle(this.stylerService.createPinStyle('green'));
        featuresToAdd.push(startFeature);

        // --- 3. PUNTO FINAL (PIN ROJO) ---
        const endFeature = new Feature({
          geometry: new Point(coords[coords.length - 1]) // Última coordenada
        });
        endFeature.set('type', 'archived_end');
        endFeature.set('date', item.date);
        // Usamos rojo para el final, que es el estándar visual
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
          const vectorTile = tile as VectorTile<RenderFeature>; // Casting con RenderFeature como tipo genérico
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
        // Validación estricta del tipo de geometría
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

  // 9. REVERSE GEOCODE //////////////////////////////////
  reverseGeocode(lat: number, lon: number): Observable<LocationResult | null> {
    if (
      typeof lat !== 'number' || typeof lon !== 'number' ||
      isNaN(lat) || isNaN(lon) ||
      lat < -90 || lat > 90 ||
      lon < -180 || lon > 180
    ) {
      return throwError(() => new Error('Invalid coordinates'));
    }
    const url = `https://api.maptiler.com/geocoding/${lon},${lat}.json?key=${global.mapTilerKey}`;
    
    return this.http.get<any>(url).pipe(
      map((response: any) => {
        const f = response?.features?.[0];
        if (!f) return null;
        
        const [featureLon, featureLat] = f.geometry.coordinates;
        const bbox = f.bbox ? f.bbox : [featureLon, featureLat, featureLon, featureLat];
        
        const result: LocationResult = {
          lat: featureLat,
          lon: featureLon,
          name: f.text ?? '(no name)',
          display_name: f.place_name ?? f.text ?? '(no name)',
          short_name: this.buildMapTilerShortName(f),
          type: f.place_type?.[0] ?? 'unknown',
          place_id: f.id ?? undefined,
          boundingbox: bbox,
          geojson: f.geometry
        };
        return result;
      }),
      catchError((error) => {
        console.error('Reverse geocoding error:', error);
        return of(null);
      })
    );
  }

  private buildMapTilerShortName(f: any): string {
    if (!f) return '(no name)';
    const main = f.text ?? '(no name)';
    const city = f.context?.find((c: any) =>
      c.id.startsWith('place') || c.id.startsWith('locality')
    )?.text;
    return city ? `${main}, ${city}` : main;
  }

  // PARSE CONTENT OF A GPX FILE ////////////////////////
  async parseGpxXml(gpxText: string) {
    let waypoints: Waypoint[] = [];
    let trackPoints: ParsedPoint[] = [];
    let trk: Element | null = null;
    
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(gpxText, 'application/xml');
    
    if (xmlDoc.getElementsByTagName('parsererror').length > 0) {
      throw new Error('Invalid GPX file format.');
    }
    
    // Parse waypoints
    const wptNodes = xmlDoc.getElementsByTagName("wpt");
    for (const wpt of Array.from(wptNodes)) {
      const latStr = wpt.getAttribute("lat");
      const lonStr = wpt.getAttribute("lon");
      if (!latStr || !lonStr) continue;
      
      const latitude = parseFloat(latStr);
      const longitude = parseFloat(lonStr);
      const eleNode = wpt.getElementsByTagName("ele")[0];
      const altitude = eleNode ? parseFloat(eleNode.textContent || "0") : 0;
      
      const name = this.fs.sanitize(wpt.getElementsByTagName("name")[0]?.textContent || "");
      let comment = this.fs.sanitize(wpt.getElementsByTagName("cmt")[0]?.textContent || "");
      
      if (name === comment) comment = "";
      
      waypoints.push({ latitude, longitude, altitude, name, comment });
    }
    
    // Extract first track
    const tracks = xmlDoc.getElementsByTagName('trk');
    if (!tracks.length) return { waypoints, trackPoints, trk: null };
    
    trk = tracks[0];
    const trackSegments = trk.getElementsByTagName('trkseg');
    if (!trackSegments.length) return { waypoints, trackPoints, trk: null };
    
    const trackSegment = trackSegments[0];
    const trkptNodes = trackSegment.getElementsByTagName('trkpt');
    
    for (const trkpt of Array.from(trkptNodes)) {
      const lat = parseFloat(trkpt.getAttribute('lat') || "");
      const lon = parseFloat(trkpt.getAttribute('lon') || "");
      const ele = parseFloat(trkpt.getElementsByTagName('ele')[0]?.textContent || "0");
      
      const timeStr = trkpt.getElementsByTagName('time')[0]?.textContent;
      const time = timeStr ? new Date(timeStr).getTime() : 0;
      
      if (!isNaN(lat) && !isNaN(lon)) {
        trackPoints.push({ lat, lon, ele, time });
      }
    }
    return { waypoints, trackPoints, trk };
  }

  async parseKmlXml(xmlDoc: Document) {
    let waypoints: Waypoint[] = [];
    let trackPoints: ParsedPoint[] = []; // Usamos ParsedPoint para consistencia
    let trk: Element | null = null;
    
    const placemarks = xmlDoc.getElementsByTagName("Placemark");
    
    for (const pm of Array.from(placemarks)) {
      const name = pm.getElementsByTagName("name")[0]?.textContent || "";
      const desc = pm.getElementsByTagName("description")[0]?.textContent || "";
      
      // Waypoint
      const point = pm.getElementsByTagName("Point")[0];
      if (point) {
        const coordText = point.getElementsByTagName("coordinates")[0]?.textContent?.trim();
        if (coordText) {
          const [lonStr, latStr, eleStr] = coordText.split(",");
          waypoints.push({
            latitude: parseFloat(latStr),
            longitude: parseFloat(lonStr),
            altitude: eleStr ? parseFloat(eleStr) : 0,
            name: this.fs.sanitize(name),
            comment: this.fs.sanitize(desc),
          });
        }
      }
      
      // Track
      const line = pm.getElementsByTagName("LineString")[0];
      if (line) {
        trk = pm; 
        const coordText = line.getElementsByTagName("coordinates")[0]?.textContent?.trim();
        if (coordText) {
          const coords = coordText.split(/\s+/);
          for (const c of coords) {
            const [lonStr, latStr, eleStr] = c.split(",");
            if (!lonStr || !latStr) continue;
            
            trackPoints.push({
              lon: parseFloat(lonStr),
              lat: parseFloat(latStr),
              ele: eleStr ? parseFloat(eleStr) : 0,
              time: 0, 
            });
          }
        }
      }
    }
    return { waypoints, trackPoints, trk };
  }
}