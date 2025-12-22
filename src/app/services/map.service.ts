import { Injectable } from '@angular/core';
import Map from 'ol/Map';
import { global } from '../../environments/environment';
import Feature from 'ol/Feature';
import { MultiLineString, MultiPoint } from 'ol/geom';
import BaseLayer from 'ol/layer/Base';
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
import { Observable, of, throwError } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { ParsedPoint, Waypoint } from '../../globald';
import { FunctionsService } from './functions.service';
import { GeographyService } from './geography.service';
import { StylerService } from './styler.service';
import { ServerService } from './server.service';
import { LocationManagerService } from './location-manager.service';
import VectorSource from 'ol/source/Vector';
import { useGeographic } from 'ol/proj';
import { TranslateService } from '@ngx-translate/core';
import { ReferenceService } from '../services/reference.service';
import { PresentService } from '../services/present.service';

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
    // get current position
    let currentPosition: [number, number] | null = await this.locationService.getCurrentPosition();
    // center map
    if (currentPosition) {
      this.geography.map?.getView().setCenter(currentPosition);
      this.geography.map?.getView().setZoom(8);
    }
  }

  // 2. LOAD MAP //////////////////////////////////////
  async loadMap(): Promise<void> {
    // Custom and share controls
    this.customControl = new CustomControl(this.geography);
    this.shareControl = new ShareControl(this.locationService, this.translate)
    // Ensure layers exist
    this.geography.currentLayer = await this.createLayer(this.geography.currentLayer);
    this.geography.archivedLayer = await this.createLayer(this.geography.archivedLayer);
    this.geography.searchLayer = await this.createLayer(this.geography.searchLayer);
    this.geography.locationLayer = await this.createLayer(this.geography.locationLayer);
    // Always (re)create the base layer and credits
    const { olLayer, credits } = await this.createMapLayer();
    if (!olLayer) {
      console.warn('No base layer created.');
      return;
    }
    // Common zoom limits
    let minZoom = 0;
    let maxZoom = 19;
    let zoom = 9;
    if (this.geography.mapProvider.toLowerCase() === 'catalonia') {
      minZoom = 0;
      maxZoom = 14;
      zoom = 8
    }
    // 🟢 CASE 1 — map already exists → only update base layer and zoom limits
    if (this.geography.map) {
      const map = this.geography.map;
      const layers = map.getLayers();
      // Replace the base layer at index 0
      if (layers && layers.getLength() >= 1) {
        map.removeLayer(layers.item(0));
        map.getLayers().insertAt(0, olLayer);
      }
      // ✅ Keep view (center, zoom, rotation, etc.), just update zoom limits
      const view = map.getView();
      view.setMinZoom(minZoom);
      view.setMaxZoom(maxZoom);
      return; // done, no re-centering or re-creating map
    }
    // 🟢 CASE 2 — no existing map → create new one
    let currentPosition: [number, number] | null = null;
    if (this.geography.mapProvider !== 'catalonia') {
      currentPosition = await this.locationService.getCurrentPosition();
    }
    if (!currentPosition) {
      currentPosition = [2, 41];
    }
    const view = new View({
      center: currentPosition,
      zoom: zoom,
      minZoom,
      maxZoom,
    });
    this.geography.map = new Map({
      target: 'map',
      layers: [
        olLayer,
        this.geography.currentLayer,
        this.geography.archivedLayer,
        this.geography.searchLayer,
        this.geography.locationLayer,
      ].filter(Boolean) as BaseLayer[],
      view,
      controls: [
        new Zoom(),
        new ScaleLine(),
        new Rotate(),
        this.customControl,
        this.shareControl
      ],
    });
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
    if (!this.geography.map || !this.fs.collection || this.fs.collection.length == 0 || !this.geography.archivedLayer) return;
    const multiLine: any[] = [];
    const multiPoint: any[] = [];
    const multiKey: any[] = [];
    for (const item of this.fs.collection) {
      const key = JSON.stringify(item.date);
      const track = await this.fs.storeGet(key);
      const coord = track.features[0]?.geometry?.coordinates;
      if (!track && key) {
        await this.fs.storeRem(key);
        continue;
      }
      if (coord) {
        multiLine.push(coord);
        multiPoint.push(coord[0]);
        multiKey.push(item.date);
      }
    }
    const features = [new Feature(), new Feature()];
    features[0].setGeometry(new MultiLineString(multiLine));
    features[0].setStyle(this.stylerService.setStrokeStyle('black'));
    features[1].setGeometry(new MultiPoint(multiPoint));
    features[1].set('multikey', multiKey);
    const greenPin = this.stylerService.createPinStyle('green');
    features[1].setStyle(greenPin);
    this.geography.archivedLayer?.getSource()?.clear();
    this.geography.archivedLayer?.getSource()?.addFeatures(features);
    await this.centerAllTracks();
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

  reverseGeocode(lat: number, lon: number): Observable<any | null> {
    // --- Validate arguments ---
    if (
      typeof lat !== 'number' || typeof lon !== 'number' ||
      isNaN(lat) || isNaN(lon) ||
      lat < -90 || lat > 90 ||
      lon < -180 || lon > 180
    ) {
      return throwError(() =>
        new Error('Latitude and longitude must be valid numbers within their allowed ranges.')
      );
    }

    // --- Helper to build short name ---
    const buildMapTilerShortName = (f: any): string => {
      if (!f) return '(no name)';
      const main = f.text ?? '(no name)';

      const city = f.context?.find((c: any) =>
        c.id.startsWith('place') || c.id.startsWith('locality')
      )?.text;

      return city ? `${main}, ${city}` : main;
    };

    // --- Build the MapTiler API request ---
    const url = `https://api.maptiler.com/geocoding/${lon},${lat}.json?key=${global.mapTilerKey}`;

    return this.http.get<any>(url).pipe(
      map((response: any) => {
        const f = response?.features?.[0];
        if (!f) return null;

        const [lon, lat] = f.geometry.coordinates;

        // Build bounding box if MapTiler provides one
        let bbox;
        if (f.bbox) {
          // MapTiler bbox = [west, south, east, north]
          bbox = [
            f.bbox[1], // south
            f.bbox[3], // north
            f.bbox[0], // west
            f.bbox[2]  // east
          ];
        } else {
          // Default bbox is a single point
          bbox = [lat, lat, lon, lon];
        }

        // Normalized output consistent with forward geocoding
        return {
          lat,
          lon,
          name: f.text ?? '(no name)',
          display_name: f.place_name ?? f.text ?? '(no name)',
          short_name: buildMapTilerShortName(f),
          type: f.place_type?.[0] ?? 'unknown',
          place_id: f.id ?? null,
          boundingbox: bbox,
          geojson: f.geometry
        };
      }),
      catchError((error) => {
        console.error('Reverse geocoding error:', error);
        return of(null);
      })
    );
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





