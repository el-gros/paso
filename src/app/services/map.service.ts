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
import { LocationButtonControl } from '../utils/openlayers/custom-control';
import { ShareControl } from '../utils/openlayers/share-control';
import MVT from 'ol/format/MVT';
import { createXYZ } from 'ol/tilegrid';
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
import { LocationSharingService } from './locationSharing.service';
import VectorSource from 'ol/source/Vector';
import { fromLonLat, useGeographic } from 'ol/proj';
import { TranslateService } from '@ngx-translate/core';
import { ReferenceService } from '../services/reference.service';
import { PresentService } from '../services/present.service';
import { Track, PartialSpeed, ParsedPoint,Data, Waypoint } from '../../globald';
import { get as getProjection } from 'ol/proj';
import { TrackingControlService } from './trackingControl.service';

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
    // 1. Obtener posición con un timeout o manejo de nulos
    const currentPosition = await this.location.getCurrentPosition();
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

    // A. Inicializar Controles (Ahora pasamos el servicio inyectado)
    this.shareControl = new ShareControl(this.location, this.translate);

    this.shareControl.onShareStart = async () => {
      console.log('🚀 Iniciando compartido desde el mapa...');
      return await this.sharing.startSharing();
    };

    this.shareControl.onShareStop = async () => {
      console.log('🛑 Deteniendo compartido desde el mapa...');
      await this.sharing.stopSharing();
    };

    // B. Inicializar Capas Vectoriales
    this.geography.currentLayer = await this.createLayer(this.geography.currentLayer);
    this.geography.archivedLayer = await this.createLayer(this.geography.archivedLayer);
    this.geography.searchLayer = await this.createLayer(this.geography.searchLayer);
    this.geography.locationLayer = await this.createLayer(this.geography.locationLayer);

    const { olLayer } = await this.createMapLayer();
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
      // 1. Crear el mapa
      const map = new Map({
        target: 'map',
        layers: [
          olLayer,
          this.geography.currentLayer,
          this.geography.archivedLayer,
          this.geography.searchLayer,
          this.geography.locationLayer,
        ].filter(Boolean) as any[],
        view: new View({
          center: defaultCenter,
          zoom: zoom,
          minZoom,
          maxZoom,
          multiWorld: false
        }),
        // Solo controles estándar al principio
        controls: [
          new Zoom(),
          new ScaleLine({
            className: 'ol-scale-line vertical-scale',
            target: 'scale-container', // Forzamos el renderizado aquí
            units: 'metric'
          }),
          new Rotate()
        ],
      });

      // 2. Guardar referencia
      this.geography.map = map;

      // 3. Crear y añadir los controles personalizados DESPUÉS de crear el mapa
      // Esto evita el error "Cannot read properties of undefined (reading 'setMap')"
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
      take(1) // Only do this for the very first point received
    ).subscribe(nextLoc => {
      if (this.geography.map && nextLoc) {
        this.geography.map.getView().animate({
          center: [nextLoc.longitude, nextLoc.latitude],
          zoom: 14,
          duration: 1500, // Smooth transition
          easing: (t) => t * (2 - t) // Smooth-out effect
        });
      }
    });
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
        // 1. MUST await the database opening fully
        await this.server.openMbtiles('catalonia.mbtiles');
        
        // 2. Only THEN create the source
        const sourceResult = await this.createSource(this.server);
        
        olLayer = new VectorTileLayer({
          source: sourceResult!,
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
    // 1. Validaciones de seguridad
    if (!this.geography.map || !this.fs.collection || this.fs.collection.length === 0 || !this.geography.archivedLayer) {
      console.warn("MapService: Faltan elementos críticos para mostrar los trayectos.");
      return;
    }

    try {
      // 2. Generación de Keys usando toISOString (igual que cuando guardas)
      const keys = this.fs.collection
        .filter(item => item && item.date) // Filtramos solo los que tienen fecha
        .map(item => {
          const dateObj = (item.date instanceof Date) ? item.date : new Date(item.date!);
          return dateObj.toISOString();
  });
      // 3. Carga paralela desde Storage
      const rawTracks = await Promise.all(keys.map(key => this.fs.storeGet(key)));

      const multiLine: any[] = [];
      const multiPoint: any[] = [];
      const multiKey: any[] = [];

      // 4. Procesamiento de los datos recuperados
      for (let i = 0; i < rawTracks.length; i++) {
        const track = rawTracks[i];
        const item = this.fs.collection[i];

        if (!track) {
          console.warn(`Key no encontrada en Storage: ${keys[i]}`);
          continue;
        }

        // Extracción todoterreno de coordenadas (GeoJSON o Feature simple)
        let coords = null;
        if (track.features?.[0]?.geometry?.coordinates) {
          coords = track.features[0].geometry.coordinates;
        } else if (track.geometry?.coordinates) {
          coords = track.geometry.coordinates;
        } else if (Array.isArray(track)) {
          coords = track;
        }

        if (coords && coords.length > 0) {
          multiLine.push(coords);
          multiPoint.push(coords[0]); // Punto de inicio para el pin verde
          multiKey.push(item.date);
        }
      }

      // 5. Verificación final de datos
      if (multiLine.length === 0) {
        this.fs.displayToast(this.translate.instant('ARCHIVE.EMPTY_TRACKS'), 'error');
        return;
      }

      // 6. Actualización del Source (capa archivedLayer)
      const source = this.geography.archivedLayer.getSource();
      if (source) {
        source.clear();

        // Feature para las líneas (MultiLineString)
        const allLinesFeature = new Feature({
          geometry: new MultiLineString(multiLine)
        });
        allLinesFeature.set('type', 'all_tracks_lines');
        allLinesFeature.setStyle(this.stylerService.setStrokeStyle('black'));

        // Feature para los inicios (MultiPoint)
        const allStartsFeature = new Feature({
          geometry: new MultiPoint(multiPoint)
        });
        allStartsFeature.set('type', 'all_tracks_starts');
        allStartsFeature.set('multikey', multiKey);
        allStartsFeature.setStyle(this.stylerService.createPinStyle('green'));

        source.addFeatures([allLinesFeature, allStartsFeature]);

        // 7. Refresco visual y Zoom (Crítico para useGeographic)
        this.geography.archivedLayer.changed();
        
        setTimeout(async () => {
          await this.centerAllTracks();
          this.geography.map?.render();
        }, 150);
      }

    } catch (error) {
      console.error("Error masivo en displayAllTracks:", error);
      this.fs.displayToast(this.translate.instant('ARCHIVE.LOADING_ERROR'), 'error');
    }
  }

  // 5. CREATE SOURCE //////////////////////////////
  async createSource(server: { getVectorTile: (z: number, x: number, y: number) => Promise<ArrayBuffer | null> }): Promise<VectorTileSource | null> {
    try {
      // 🔹 1. Explicitly define the Web Mercator extent to avoid TypeScript 'null' errors
      // and prevent the "Hemisphere Swap" caused by geographic projection defaults.
      const epsg3857Extent = [-20037508.342789244, -20037508.342789244, 20037508.342789244, 20037508.342789244];

      return new VectorTileSource({
        format: new MVT(),
        // 🔹 2. Force the XYZ grid to use the square 3857 extent.
        // This is crucial because MBTiles are tiled based on a square world,
        // while useGeographic() works on a 2:1 rectangular world.
        tileGrid: createXYZ({ 
          extent: epsg3857Extent, 
          maxZoom: 22,
          tileSize: 512 // ⚠️ Common for vector tiles; change to 256 if map looks giant.
        }),

        tileLoadFunction: (tile) => {
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

              // 🔹 3. Handle Gzip compression (standard for .mbtiles)
              const decompressed = pako.inflate(new Uint8Array(rawData));

              // 🔹 4. Projection Bridge: 
              // dataProjection is 'EPSG:3857' because tiles are stored in Mercator.
              // featureProjection is 'projection' (EPSG:4326) because of useGeographic().
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
        wrapX: true // 🔹 Set to false if you want to see if the "Blue Band" becomes a single square.
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