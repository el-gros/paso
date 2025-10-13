/**
 * Service for managing OpenLayers map functionality, including view fitting, track and marker display, layer management, map creation, and provider switching.
 * Provides utility methods for styling, pin creation, geolocation, and dynamic map updates.
 * Integrates with StyleService and supports multiple map providers and custom controls.
 */

import { StyleService } from '../services/style.service';
import { Injectable } from '@angular/core';
import Map from 'ol/Map';
import LineString from 'ol/geom/LineString';
import Point from 'ol/geom/Point';
import { global } from '../../environments/environment';
import { Fill, Icon, Stroke, Style, Text } from 'ol/style';
import Feature from 'ol/Feature';
import { Geometry, MultiLineString, MultiPoint } from 'ol/geom';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import TileLayer from 'ol/layer/Tile';
import { OSM, XYZ } from 'ol/source';
import VectorTileLayer from 'ol/layer/VectorTile';
import { VectorTile, View } from 'ol';
import { Rotate, ScaleLine, Zoom } from 'ol/control';
import { CustomControl } from '../utils/openlayers/custom-control';
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
import { ServerService } from './server.service';

// 1. setMapView
// 2. displayCurrentTrack

// 4. setStrokeStyle

// 6. centerAllTracks
// 7. getColoredPin
// 8. createPinStyle
// 9. createLayers
// 10. createMap
// 11. updateMapProvider
// 12. displayArchivedTrack
// 13. displayAllTracks

// 15. createSource
// 16. cycleZoom

@Injectable({
  providedIn: 'root'
})
export class MapService {

  scaleSteps = [1, 1.75, 3.5];
  currentScaleIndex = 0;
  mapWrapperElement: HTMLElement | null = null;

  constructor(
    private styleService: StyleService,
    private http: HttpClient,
    private fs: FunctionsService,
    private server: ServerService
  ) { }

  // 1. SET MAP VIEW /////////////////////////////////////////

  setMapView(track: any) {
    if (!this.fs.map) return;
    const boundaries = track.features[0].bbox;
    if (!boundaries) return;
    // Set a minimum area
    const minVal = 0.002;
    if ((boundaries[2] - boundaries[0] < minVal) && (boundaries[3] - boundaries[1] < minVal)) {
      const centerX = 0.5 * (boundaries[0] + boundaries[2]);
      const centerY = 0.5 * (boundaries[1] + boundaries[3]);
      boundaries[0] = centerX - minVal / 2;
      boundaries[2] = centerX + minVal / 2;
      boundaries[1] = centerY - minVal / 2;
      boundaries[3] = centerY + minVal / 2;
    }
    // map view
    setTimeout(() => {
      this.fs.map?.getView().fit(boundaries, {
        size: this.fs.map.getSize(),
        padding: [50, 50, 50, 50],
        duration: 100  // Optional: animation duration in milliseconds
      });
    })
  }

  // 2. DISPLAY CURRENT TRACK /////////////////////////////////////////

  async displayCurrentTrack(map: Map | undefined, currentTrack: any): Promise<void> {
    // Ensure current track and map exist
    const source = this.fs.currentLayer?.getSource();
    if (!source || !this.fs.map) return;
    const features = source.getFeatures();
    if (!features || features.length<2) return;
    if (!currentTrack || !map || !features || features.length < 4) return;
    // Number of points in the track
    const coordinates = currentTrack.features?.[0]?.geometry?.coordinates;
    const num = coordinates?.length ?? 0;
    // Ensure there are enough points to display
    if (num < 2) return;
    // Set line geometry and style
    features[0].setGeometry(new LineString(coordinates));
    features[0].setStyle(this.setStrokeStyle(this.fs.currentColor));
    // Set the last point as the marker geometry
    features[2]?.setGeometry(new Point(coordinates[num - 1]));
    // Adjust map view at specific intervals
    if (num === 5 || num === 10 || num === 25 || num % 50 === 0) {
      this.setMapView(currentTrack);
    }
  }

  // 4. SET STROKE STYLE //////////////////////////////////

  setStrokeStyle(color: string): Style {
    return new Style({ stroke: new Stroke({
      color: color,
      width: 3 })
    });
  }

  // 6. CENTER ALL TRACKS

  async centerAllTracks(): Promise<void> {
    // get current position
    let currentPosition: [number, number] | null = await this.fs.getCurrentPosition(false, 1000);
    // center map
    if (currentPosition) {
      this.fs.map?.getView().setCenter(currentPosition);
      this.fs.map?.getView().setZoom(8);
    }
  }

  // 7. GET COLORED PIN //////////////////////////

  getColoredPin(color: string): string {
    const svgTemplate = `
      <svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 293.334 293.334">
        <g>
          <path fill="${color}" d="M146.667,0C94.903,0,52.946,41.957,52.946,93.721c0,22.322,7.849,42.789,20.891,58.878
            c4.204,5.178,11.237,13.331,14.903,18.906c21.109,32.069,48.19,78.643,56.082,116.864c1.354,6.527,2.986,6.641,4.743,0.212
            c5.629-20.609,20.228-65.639,50.377-112.757c3.595-5.619,10.884-13.483,15.409-18.379c6.554-7.098,12.009-15.224,16.154-24.084
            c5.651-12.086,8.882-25.466,8.882-39.629C240.387,41.962,198.43,0,146.667,0z M146.667,144.358
            c-28.892,0-52.313-23.421-52.313-52.313c0-28.887,23.421-52.307,52.313-52.307s52.313,23.421,52.313,52.307
            C198.98,120.938,175.559,144.358,146.667,144.358z"/>
          <circle fill="${color}" cx="146.667" cy="90.196" r="21.756"/>
        </g>
      </svg>
    `.trim();
    // Encode safely as base64
    const encoded = window.btoa(unescape(encodeURIComponent(svgTemplate)));
    return `data:image/svg+xml;base64,${encoded}`;
  }

  // 8. CREATE PIN STYLE //////////////////////////

  createPinStyle(color: string): Style {
    return new Style({
      image: new Icon({
        src: this.getColoredPin(color),
        anchor: [0.5, 1],
        scale: 0.035
      })
    });
  }

  // 9. CREATE LAYERS /////////////////////////////////////

  createLayers() {
    var source = new VectorSource({ features: [new Feature(), new Feature(), new Feature(), new Feature()] });
    this.fs.currentLayer = new VectorLayer({ source: source });
    this.fs.archivedLayer = new VectorLayer({ source: new VectorSource() });
    this.fs.multiLayer = new VectorLayer({ source: new VectorSource() });
    this.fs.searchLayer = new VectorLayer({ source: new VectorSource() });
  }

  // 10. CREATE MAP /////////////////////////////////////

  async createMap(): Promise<void> {
    let currentPosition: [number, number] | null = null;
    console.log('i am in mapService')
    if (this.fs.mapProvider !== 'catalonia') {
      currentPosition = await this.fs.getCurrentPosition(false, 1000);
    }
    let olLayer: any;
    let credits = '';
    switch (this.fs.mapProvider) {
      case 'OpenStreetMap':
        credits = '© OpenStreetMap contributors';
        olLayer = new TileLayer({ source: new OSM() });
        break;
      case 'OpenTopoMap':
        credits = '© OpenStreetMap contributors, SRTM | Map style: © OpenTopoMap (CC-BY-SA)';
        olLayer = new TileLayer({ source: new XYZ({ url: 'https://{a-c}.tile.opentopomap.org/{z}/{x}/{y}.png' }) });
        break;
      case 'German_OSM':
        credits = '© OpenStreetMap contributors';
        olLayer = new TileLayer({ source: new XYZ({ url: 'https://tile.openstreetmap.de/{z}/{x}/{y}.png' }) });
        break;
      case "MapTiler_streets":
        credits = '© MapTiler © OpenStreetMap contributors';
        olLayer = new TileLayer({ source: new XYZ({ url: `https://api.maptiler.com/maps/streets/{z}/{x}/{y}.png?key=${global.mapTilerKey}`,
          crossOrigin: 'anonymous' }) });
        break;
      case "MapTiler_outdoor":
        credits = '© MapTiler © OpenStreetMap contributors';
        olLayer = new TileLayer({ source: new XYZ({ url: `https://api.maptiler.com/maps/outdoor/{z}/{x}/{y}.png?key=${global.mapTilerKey}`,
          crossOrigin: 'anonymous' }) });
        break;
      case "MapTiler_hybrid":
        credits = '© MapTiler © OpenStreetMap contributors';
        olLayer = new TileLayer({ source: new XYZ({ url: `https://api.maptiler.com/maps/hybrid/{z}/{x}/{y}.png?key=${global.mapTilerKey}`,
          crossOrigin: 'anonymous' }) });
        break;
      case 'ICGC':
        credits = 'Institut Cartogràfic i Geològic de Catalunya';
        olLayer = new TileLayer({ source: new XYZ({ url: 'https://tiles.icgc.cat/xyz/mtn1000m/{z}/{x}/{y}.jpeg' }) });
        break;
      case 'IGN':
        credits = 'Instituto Geográfico Nacional (IGN)';
        olLayer = new TileLayer({
          source: new XYZ({
            url: 'https://www.ign.es/wmts/mapa-raster?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=MTN&STYLE=default&TILEMATRIXSET=GoogleMapsCompatible&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image/jpeg',
          }),
        });
        break;
      case 'catalonia':
        credits = '© MapTiler © OpenStreetMap contributors';
        await this.server.openMbtiles('catalonia.mbtiles');
        const sourceResult = await this.createSource(this.server);
        if (sourceResult) {
          olLayer = new VectorTileLayer({ source: sourceResult, style: this.styleService.styleFunction });
        }
        break;
      case 'MapTiler_v_outdoor':
        credits = '© MapTiler © OpenStreetMap contributors';
        olLayer = new VectorTileLayer({
          source: new VectorTileSource({
            format: new MVT(),
            url: `https://api.maptiler.com/tiles/v3/{z}/{x}/{y}.pbf?key=${global.mapTilerKey}`,
            maxZoom: 14,
          }),
        });
        applyStyle( olLayer, `https://api.maptiler.com/maps/outdoor/style.json?key=${global.mapTilerKey}`  )
        break;
      default:
        credits = '© OpenStreetMap contributors';
        olLayer = new TileLayer({ source: new OSM() });
        break;
    }
    let minZoom = 0;
    let maxZoom = 19;
    if (this.fs.mapProvider === 'catalonia') {
      minZoom = 6;
      maxZoom = 14;
    }
    if (!currentPosition) {
      currentPosition = [2, 41];
    }
    const view = new View({
      center: currentPosition,
      zoom: 9,
      projection: 'EPSG:3857',
      minZoom,
      maxZoom,
    });
    this.fs.map = new Map({
      target: 'map',
      layers: [olLayer, this.fs.currentLayer, this.fs.archivedLayer, this.fs.multiLayer, this.fs.searchLayer].filter(Boolean),
      view,
      controls: [new Zoom(), new ScaleLine(), new Rotate(), new CustomControl(this, this.fs)],
    });
    this.fs.lastProvider = this.fs.mapProvider
    this.fs.displayToast(credits);
    this.mapWrapperElement = document.getElementById('map-wrapper');
  }

  // 11. CHANGE MAP PROVIDER

  async updateMapProvider(): Promise< void > {
    let newBaseLayer = null;
    let credits = '';
    if (!this.fs.map) return;
    switch (this.fs.mapProvider) {
      case 'OpenStreetMap':
        credits = '© OpenStreetMap contributors';
        newBaseLayer = new TileLayer({ source: new OSM() });
        break;
      case 'OpenTopoMap':
        credits = '© OpenStreetMap contributors, SRTM | Map style: © OpenTopoMap (CC-BY-SA)';
        newBaseLayer = new TileLayer({
          source: new XYZ({ url: 'https://{a-c}.tile.opentopomap.org/{z}/{x}/{y}.png' }),
        });
        break;
      case 'German_OSM':
        credits = '© OpenStreetMap contributors';
        newBaseLayer = new TileLayer({
          source: new XYZ({ url: 'https://tile.openstreetmap.de/{z}/{x}/{y}.png' }),
        });
        break;
      case "MapTiler_streets":
        credits = '© MapTiler © OpenStreetMap contributors';
        newBaseLayer = new TileLayer({
          source: new XYZ({ url: `https://api.maptiler.com/maps/streets/{z}/{x}/{y}.png?key=${global.mapTilerKey}`,
          crossOrigin: 'anonymous' }) });
        break;
      case "MapTiler_outdoor":
        credits = '© MapTiler © OpenStreetMap contributors';
        newBaseLayer = new TileLayer({
          source: new XYZ({ url: `https://api.maptiler.com/maps/outdoor/{z}/{x}/{y}.png?key=${global.mapTilerKey}`,
          crossOrigin: 'anonymous' }) });
        break;
      case "MapTiler_hybrid":
        credits = '© MapTiler © OpenStreetMap contributors';
        newBaseLayer = new TileLayer({
          source: new XYZ({ url: `https://api.maptiler.com/maps/hybrid/{z}/{x}/{y}.png?key=${global.mapTilerKey}`,
          crossOrigin: 'anonymous' }) });
        break;
      case 'ICGC':
        credits = 'Institut Cartogràfic i Geològic de Catalunya';
        newBaseLayer = new TileLayer({
          source: new XYZ({ url: 'https://tiles.icgc.cat/xyz/mtn1000m/{z}/{x}/{y}.jpeg' }),
        });
        break;
      case 'IGN':
        credits = 'Instituto Geográfico Nacional (IGN)';
        newBaseLayer = new TileLayer({
          source: new XYZ({
            url: 'https://www.ign.es/wmts/mapa-raster?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=MTN&STYLE=default&TILEMATRIXSET=GoogleMapsCompatible&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image/jpeg',
          }),
        });
        break;
      case 'catalonia':
        credits = '© MapTiler © OpenStreetMap contributors';
        this.fs.map?.getView().setCenter([2, 41]);
        this.fs.map?.getView().setZoom(8);
        await this.server.openMbtiles('catalonia.mbtiles');
        const sourceResult = await this.createSource(this.server);
        if(sourceResult) {
          newBaseLayer = new VectorTileLayer({ source: sourceResult, style: this.styleService.styleFunction });
        }
        break;
      case 'MapTiler_v_outdoor':
        credits = '© MapTiler © OpenStreetMap contributors';
        newBaseLayer = new VectorTileLayer({
          source: new VectorTileSource({
            format: new MVT(),
            url: `https://api.maptiler.com/tiles/v3/{z}/{x}/{y}.pbf?key=${global.mapTilerKey}`,
            maxZoom: 14,
          })
        });
        applyStyle( newBaseLayer, `https://api.maptiler.com/maps/outdoor/style.json?key=${global.mapTilerKey}`  )
        break;
    }
    if (newBaseLayer) {
      var olLayers = this.fs.map?.getLayers();
      if (!olLayers || olLayers.getLength() < 2) return;
      this.fs.map?.removeLayer(olLayers.item(0));
      this.fs.map?.getLayers().insertAt(0, newBaseLayer);
    } else {
      console.warn('No base layer created.');
      return;
    }
    this.fs.lastProvider = this.fs.mapProvider
    await this.fs.displayToast(credits);
    // Set min/max zoom
    let minZoom = 0;
    let maxZoom = 19;
    if (this.fs.mapProvider.toLowerCase() === 'catalonia') {
      minZoom = 6;
      maxZoom = 14;
    }
    this.fs.map?.getView().setMinZoom(minZoom);
    this.fs.map?.getView().setMaxZoom(maxZoom);
    return;
  }

  // 12. DISPLAY AN ARCHIVED TRACK

  async displayArchivedTrack(): Promise<void> {
    if (!this.fs.map || !this.fs.archivedTrack || !this.fs.archivedLayer) return;
    const coordinates = this.fs.archivedTrack.features[0].geometry.coordinates;
    const num = coordinates.length;
    if (num === 0) return;
    this.fs.archivedLayer.getSource()?.clear();
    const features = [new Feature(), new Feature(), new Feature(), new Feature(), new Feature()]
    features[0].setGeometry(new LineString(coordinates));
    features[0].setStyle(this.setStrokeStyle(this.fs.archivedColor));
    features[1].setGeometry(new Point(coordinates[0]));
    const greenPin = this.createPinStyle('green');
    features[1].setStyle(greenPin);
    features[3].setGeometry(new Point(coordinates[num - 1]));
    const redPin = this.createPinStyle('red');
    features[3].setStyle(redPin);
    const waypoints = this.fs.archivedTrack.features[0].waypoints || [];
    const multiPoint = waypoints.map((point: { longitude: any; latitude: any; }) => [point.longitude, point.latitude]);
    features[4].setGeometry(new MultiPoint(multiPoint));
    features[4].set('waypoints', waypoints);
    const yellowPin = this.createPinStyle('yellow');
    features[4].setStyle(yellowPin);
    this.fs.archivedLayer?.getSource()?.addFeatures(features);
    this.fs.layerVisibility = 'archived';
    this.fs.archivedLayer?.setVisible(true);
  }

  // 13. DISPLAY ALL TRACKS

  async displayAllTracks() {
    if (!this.fs.map || !this.fs.collection || this.fs.collection.length == 0 || !this.fs.multiLayer) return;
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
    this.fs.multiLayer?.getSource()?.clear();
    const features = [new Feature(), new Feature()];
    features[0].setGeometry(new MultiLineString(multiLine));
    features[0].setStyle(this.setStrokeStyle('black'));
    features[1].setGeometry(new MultiPoint(multiPoint));
    features[1].set('multikey', multiKey);
    const greenPin = this.createPinStyle('green');
    features[1].setStyle(greenPin);
    this.fs.multiLayer?.getSource()?.addFeatures(features);
  }

  // 15. CREATE SOURCE //////////////////////////////

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
                featureProjection: 'EPSG:3857',
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

  // 16. CYCLE ZOOM //////////////////////////////

  async cycleZoom(): Promise<void> {
    if (!this.mapWrapperElement) {
      console.warn('Map wrapper element not found');
      return;
    }
    this.currentScaleIndex = (this.currentScaleIndex + 1) % this.scaleSteps.length;
    const scale = this.scaleSteps[this.currentScaleIndex];
    this.mapWrapperElement.style.transform = `scale(${scale})`;
  }

  reverseGeocode(lat: number, lon: number): Observable<any | null> {
    if (
      typeof lat !== 'number' ||
      typeof lon !== 'number' ||
      isNaN(lat) || isNaN(lon) ||
      lat < -90 || lat > 90 ||
      lon < -180 || lon > 180
    ) {
      return throwError(() => new Error('Latitude and longitude must be valid numbers within their respective ranges.'));
    }

    // --- helpers ---
    const buildNominatimShortName = (addr: any): string => {
      if (!addr) return '(no name)';

      // 1. POIs
      if (addr.tourism) return addr.tourism;
      if (addr.amenity) return addr.amenity;
      if (addr.shop) return addr.shop;
      if (addr.building) return addr.building;

      // 2. Street + number + city
      if (addr.road) {
        let s = addr.road;
        if (addr.house_number) s += ` ${addr.house_number}`;
        if (addr.city || addr.town || addr.village) {
          s += `, ${addr.city ?? addr.town ?? addr.village}`;
        }
        return s;
      }

      // 3. Settlements
      if (addr.city) return addr.city;
      if (addr.town) return addr.town;
      if (addr.village) return addr.village;

      // 4. Country fallback
      return addr.country ?? '(no name)';
    };

    const buildMapTilerShortName = (f: any): string => {
      if (!f) return '(no name)';
      const main = f.text ?? '(no name)';
      const city = f.context?.find((c: any) =>
        c.id.startsWith('place') || c.id.startsWith('locality')
      )?.text;
      return city ? `${main}, ${city}` : main;
    };

    // --- build request ---
    let url: string;
    let options: any = {};

    if (this.fs.geocoding === 'mapTiler') {
      url = `https://api.maptiler.com/geocoding/${lon},${lat}.json?key=${global.mapTilerKey}`;
      options = { observe: 'body' as const, responseType: 'json' as const };
    } else {
      url = `https://nominatim.openstreetmap.org/reverse`;
      options = {
        params: new HttpParams()
          .set('lat', lat.toString())
          .set('lon', lon.toString())
          .set('format', 'json')
          .set('addressdetails', '1')
          .set('polygon_geojson', '1'),
        headers: new HttpHeaders().set('User-Agent', 'YourAppName/1.0 (you@example.com)'),
        observe: 'body' as const,
        responseType: 'json' as const
      };
    }

    // --- normalize ---
    return this.http.get<any>(url, options).pipe(
      map((response: any) => {
        if (this.fs.geocoding === 'mapTiler') {
          const f = response?.features?.[0];
          if (!f) return null;

          const [lon, lat] = f.geometry.coordinates;

          const bbox = f.bbox
            ? [f.bbox[1], f.bbox[3], f.bbox[0], f.bbox[2]] // [south, north, west, east]
            : [lat, lat, lon, lon];

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
        } else {
          return {
            lat: parseFloat(response.lat),
            lon: parseFloat(response.lon),
            name: response.display_name ?? '(no name)',
            display_name: response.display_name ?? '(no name)',
            short_name: buildNominatimShortName(response.address),
            type: response.type ?? 'unknown',
            place_id: response.place_id,
            boundingbox: response.boundingbox?.map((n: string) => parseFloat(n)) ?? [],
            geojson: response.geojson ?? null
          };
        }
      }),
      catchError(error => {
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





