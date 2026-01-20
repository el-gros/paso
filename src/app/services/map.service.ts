import { Injectable } from '@angular/core';
import Map from 'ol/Map';
import { global } from '../../environments/environment';
import Feature from 'ol/Feature';
import { MultiLineString, MultiPoint } from 'ol/geom';
import VectorLayer from 'ol/layer/Vector';
import TileLayer from 'ol/layer/Tile';
import { OSM, XYZ } from 'ol/source';
import VectorTileLayer from 'ol/layer/VectorTile';
import { VectorTile, View } from 'ol';
import { Rotate, ScaleLine, Zoom } from 'ol/control';
import { CustomControl } from '../utils/openlayers/custom-control';
import { ShareControl } from '../utils/openlayers/share-control';
import MVT from 'ol/format/MVT';
import { TileGrid } from 'ol/tilegrid';
import RenderFeature from 'ol/render/Feature';
import TileState from 'ol/TileState';
import pako from 'pako';
import VectorTileSource from 'ol/source/VectorTile';
import { applyStyle } from 'ol-mapbox-style';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { BehaviorSubject, Observable, of, Subject, throwError } from 'rxjs';
import { map, catchError, filter, take } from 'rxjs/operators';
import { FunctionsService } from './functions.service';
import { GeographyService } from './geography.service';
import { StylerService } from './styler.service';
import { ServerService } from './server.service';
import { LocationManagerService } from './location-manager.service';
import VectorSource from 'ol/source/Vector';
import { fromLonLat, useGeographic } from 'ol/proj';
import { TranslateService } from '@ngx-translate/core';
import { ReferenceService } from '../services/reference.service';
import { PresentService } from '../services/present.service';
import { Track, PartialSpeed, ParsedPoint,Data, Waypoint } from '../../globald';

useGeographic();

// 1. centerAllTracks
// 2. loadMap
// 3. createMapLayer
// 4. displayAllTracks
// 5. createSource
// 6. cycleZoom
// 7. createLayer
// 8. UPDATE COLORS ///////////////////////////////

@Injectable({
  providedIn: 'root'
})
export class MapService {

  scaleSteps = [1, 1.75, 3.5];
  currentScaleIndex = 0;
  mapWrapperElement: HTMLElement | null = null;
  public customControl!: CustomControl;  
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
    private locationService: LocationManagerService,
    private translate: TranslateService,
    private stylerService: StylerService,
    private geography: GeographyService,
    private reference: ReferenceService,
    private present: PresentService,
  ) { 
  }

  // 1. CENTER ALL TRACKS
  async centerAllTracks(): Promise<void> {
    // 1. Obtener posición con un timeout o manejo de nulos
    const currentPosition = await this.locationService.getCurrentPosition();
    if (currentPosition && this.geography.map) {
      const view = this.geography.map.getView();
      // 2. Animación suave en lugar de salto brusco
      view.animate({
        center: currentPosition,
        zoom: 8,         // Zoom más apropiado para tracking
        duration: 1000    // 1 segundo de transición
      });
    } else {
      console.warn("No se pudo obtener la ubicación para centrar el mapa.");
      // Aquí podrías disparar un Toast informativo al usuario
    }
  }

  // 2. LOAD MAP //////////////////////////////////////
  async loadMap(): Promise<void> {
    const mapElement = document.getElementById('map');
    if (!mapElement) return;
    this.customControl = new CustomControl(this.geography, this);
    this.shareControl = new ShareControl(this.locationService, this.translate);
    this.geography.currentLayer = await this.createLayer(this.geography.currentLayer);
    this.geography.archivedLayer = await this.createLayer(this.geography.archivedLayer);
    this.geography.searchLayer = await this.createLayer(this.geography.searchLayer);
    this.geography.locationLayer = await this.createLayer(this.geography.locationLayer);
    const { olLayer } = await this.createMapLayer();
    if (!olLayer) return;
    let minZoom = 0, maxZoom = 19, zoom = 9;
    if (this.geography.mapProvider.toLowerCase() === 'catalonia') {
      minZoom = 0; maxZoom = 14; zoom = 8;
    }
    // 1. Get Initial Position
    const initialPosition = await this.locationService.getCurrentPosition();
    let targetCenter: [number, number];
    let isWaitingForFirstPoint = false;
    if (initialPosition) {
      // Already in [longitude, latitude] format
      targetCenter = initialPosition;
    } else {
      targetCenter = [1.7403, 41.7282]; // Catalonia Default
      zoom = 7.5;
      isWaitingForFirstPoint = true;
    }
    // 🟢 CASE 1 — Map already exists
    if (this.geography.map) {
      const map = this.geography.map;
      const layers = map.getLayers();
      if (layers && layers.getLength() >= 1) {
        map.removeLayer(layers.item(0));
        map.getLayers().insertAt(0, olLayer);
      }
      const view = map.getView();
      view.setMinZoom(minZoom);
      view.setMaxZoom(maxZoom);
      // REMOVED fromLonLat -> passing raw [lon, lat]
      view.setCenter(targetCenter);
      view.setZoom(zoom);
    } 
    // 🟢 CASE 2 — Initialize new map
    else {
      this.geography.map = new Map({
        target: 'map',
        layers: [
          olLayer,
          this.geography.currentLayer,
          this.geography.archivedLayer,
          this.geography.searchLayer,
          this.geography.locationLayer,
        ].filter(Boolean) as any[],
        view: new View({
          center: targetCenter, // REMOVED fromLonLat
          zoom: zoom,
          minZoom,
          maxZoom,
        }),
        controls: [
          new Zoom(),
          new ScaleLine(),
          new Rotate(),
          this.customControl,
          this.shareControl
        ],
      });
    }
    // 2. AUTO-CENTER (Only once)
    if (isWaitingForFirstPoint) {
      this.locationService.latestLocation$.pipe(
        filter(loc => !!loc),
        take(1)
      ).subscribe(nextLoc => {
        if (this.geography.map && nextLoc) {
          this.geography.map.getView().animate({
            center: [nextLoc.longitude, nextLoc.latitude], // REMOVED fromLonLat
            zoom: 14,
            duration: 1000
          });
        }
      });
    }
    this.mapWrapperElement = document.getElementById('map-wrapper');
  }

  // 3. CREATE MAP LAYER
  async createMapLayer() {
    let olLayer: any = null;
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
        credits = 'Institut Cartogràfic i Geològic de Catalunya';
        await this.server.openMbtiles('catalonia.mbtiles');
        const sourceResult = await this.createSource(this.server);
        if (!sourceResult) {
          throw new Error('Catalonia mbtiles source could not be loaded');
        }
        olLayer = new VectorTileLayer({
          source: sourceResult,
          style: this.stylerService.styleFunction
        });
        break;
      }
      case 'MapTiler_v_outdoor':
        credits = '© MapTiler © OpenStreetMap contributors';
        olLayer = new VectorTileLayer({
          source: new VectorTileSource({
            format: new MVT(),
            url: `https://api.maptiler.com/tiles/v3/{z}/{x}/{y}.pbf?key=${global.mapTilerKey}`,
            maxZoom: 14,
          }),
        });
        await applyStyle(
          olLayer,
          `https://api.maptiler.com/maps/outdoor/style.json?key=${global.mapTilerKey}`
          // ,'openmaptiles' // add if needed
        );
        break;
      default:
        credits = '© OpenStreetMap contributors';
        olLayer = new TileLayer({ source: new OSM() });
    }
    return { olLayer, credits };
  }

  // 4. DISPLAY ALL TRACKS
  async displayAllTracks() {
    if (!this.geography.map || !this.fs.collection || this.fs.collection.length === 0 || !this.geography.archivedLayer) return;
    // 1. CARGA PARALELA: Leemos todos los archivos del storage al mismo tiempo
    const keys = this.fs.collection.map(item => JSON.stringify(item.date));
    const rawTracks = await Promise.all(keys.map(key => this.fs.storeGet(key)));
    const multiLine: any[] = [];
    const multiPoint: any[] = [];
    const multiKey: any[] = [];
    // 2. PROCESAMIENTO SÍNCRONO: Ahora que ya tenemos los datos en memoria, iteramos rápido
    for (let i = 0; i < rawTracks.length; i++) {
      const track = rawTracks[i];
      const item = this.fs.collection[i];
      if (!track) {
        // Si un track falta, lo eliminamos del storage (opcional, como hacías antes)
        await this.fs.storeRem(keys[i]);
        continue;
      }
      const coord = track.features[0]?.geometry?.coordinates;
      if (coord && coord.length > 0) {
        multiLine.push(coord);
        multiPoint.push(coord[0]);
        multiKey.push(item.date);
      }
    }
    // 3. ACTUALIZACIÓN DEL MAPA (Igual que antes)
    const allLinesFeature = new Feature();
    allLinesFeature.set('type', 'all_tracks_lines');
    allLinesFeature.setGeometry(new MultiLineString(multiLine));
    allLinesFeature.setStyle(this.stylerService.setStrokeStyle('black'));
    const allStartsFeature = new Feature();
    allStartsFeature.set('type', 'all_tracks_starts');
    allStartsFeature.setGeometry(new MultiPoint(multiPoint));
    allStartsFeature.set('multikey', multiKey);
    allStartsFeature.setStyle(this.stylerService.createPinStyle('green'));
    const source = this.geography.archivedLayer.getSource();
    if (source) {
      source.clear();
      source.addFeatures([allLinesFeature, allStartsFeature]);
      // 4. ZOOM 
      await this.centerAllTracks();
    }
  }

  // 5. CREATE SOURCE //////////////////////////////
  async createSource(server: { getVectorTile: (z: number, x: number, y: number) => Promise<ArrayBuffer | null> }): Promise<VectorTileSource | null> {
    try {
      return new VectorTileSource({
        format: new MVT(),
        tileClass: VectorTile,
        tileGrid: new TileGrid({
          extent: [-20037508.34, -20037508.34, 20037508.34, 20037508.34],
          resolutions: Array.from({ length: 20 }, (_, z) => 156543.03392804097 / Math.pow(2, z)),
          tileSize: [256, 256],
        }),

        tileLoadFunction: (tile) => {
          const vectorTile = tile as VectorTile<RenderFeature>;
          const [z, x, y] = vectorTile.getTileCoord();

          vectorTile.setLoader(async () => {
            try {
              // fetch the tile
              const rawData = await server.getVectorTile(z, x, y);

              // validate
              if (!rawData || !rawData.byteLength) {
                vectorTile.setFeatures([]);
                vectorTile.setState(TileState.EMPTY);
                return;
              }

              // decompress and parse features
              const decompressed = pako.inflate(new Uint8Array(rawData));
              const safeBuffer = new Uint8Array(decompressed.length);
              safeBuffer.set(decompressed);

              const features = new MVT().readFeatures(safeBuffer.buffer, {
                extent: vectorTile.extent ?? [-20037508.34, -20037508.34, 20037508.34, 20037508.34],
                //git push origin mainfeatureProjection: 'EPSG:3857',
              });

              vectorTile.setFeatures(features);
            } catch (error) {
              console.error(`Tile load error (${z}/${x}/${y}):`, error);
              vectorTile.setState(TileState.ERROR);
            }
          });
        },

        tileUrlFunction: ([z, x, y]) => `${z}/${x}/${y}`,
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
  async createLayer(layer?: VectorLayer) {
    if (!layer) layer = new VectorLayer();
    if (!layer.getSource()) layer.setSource(new VectorSource());
    return layer;
  }

  // 8. UPDATE COLORS /////////////////////////////////////////
  async updateColors() {
    const updateLayer = (layer: VectorLayer | undefined, color: string) => {
      const features = layer?.getSource()?.getFeatures();
      features?.forEach((f: Feature) => {
        if (f.getGeometry()?.getType() === 'LineString') {
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
  reverseGeocode(lat: number, lon: number): Observable<any | null> {
    // --- Validación ---
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
        // MapTiler entrega [minLon, minLat, maxLon, maxLat] 
        // Este formato es el estándar [minX, minY, maxX, maxY] para OpenLayers
        const bbox = f.bbox ? f.bbox : [featureLon, featureLat, featureLon, featureLat];
        return {
          lat: featureLat,
          lon: featureLon,
          name: f.text ?? '(no name)',
          display_name: f.place_name ?? f.text ?? '(no name)',
          short_name: this.buildMapTilerShortName(f),
          type: f.place_type?.[0] ?? 'unknown',
          place_id: f.id ?? null,
          boundingbox: bbox, // Compatible con view.fit(bbox)
          geojson: f.geometry
        };
      }),
      catchError((error) => {
        console.error('Reverse geocoding error:', error);
        return of(null);
      })
    );
  }

// Extraído como método de clase para limpieza
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
    // Parse GPX data
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
    let trackPoints: { lat: number; lon: number; ele?: number; time?: number }[] = [];
    let trk: Element | null = null;
    // Extract Placemarks
    const placemarks = xmlDoc.getElementsByTagName("Placemark");
    for (const pm of Array.from(placemarks)) {
      const name = pm.getElementsByTagName("name")[0]?.textContent || "";
      const desc = pm.getElementsByTagName("description")[0]?.textContent || "";
      // Waypoint → look for <Point>
      const point = pm.getElementsByTagName("Point")[0];
      if (point) {
        const coordText = point.getElementsByTagName("coordinates")[0]?.textContent?.trim();
        if (coordText) {
          const [lonStr, latStr, eleStr] = coordText.split(",");
          waypoints.push({
            latitude: parseFloat(latStr),
            longitude: parseFloat(lonStr),
            altitude: eleStr ? parseFloat(eleStr) : 0,
            name: this.fs['sanitize']?.(name) ?? name,
            comment: this.fs['sanitize']?.(desc) ?? desc,
          });
        }
      }
      // Track → look for <LineString>
      const line = pm.getElementsByTagName("LineString")[0];
      if (line) {
        trk = pm; // keep Placemark as "track container"
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
              time: 0, // KML usually doesn’t have per-point time → you can extend if needed
            });
          }
        }
      }
    }
    return { waypoints, trackPoints, trk };
  }


}





