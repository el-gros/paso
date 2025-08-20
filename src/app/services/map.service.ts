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
import { FeatureLike } from 'ol/Feature';
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

// 1. setMapView
// 2. displayCurrentTrack

// 4. removeLayer
// 5. setStrokeStyle
// 6. getCurrentPosition
// 7. centerAllTracks
// 8. getColoredPin
// 9. createPinStyle
// 10. createLayers
// 11. createMap
// 12. updateMapProvider
// 13. displayArchivedTrack
// 14. displayAllTracks
// 15. addSearchLayer
// 16. createSource
// 17. cycleZoom

@Injectable({
  providedIn: 'root'
})
export class MapService {

  scaleSteps = [1, 1.75, 3.5];
  currentScaleIndex = 0;
  mapWrapperElement: HTMLElement | null = null;

  constructor(
    private styleService: StyleService,
  ) { }

  // 1. SET MAP VIEW /////////////////////////////////////////

  setMapView(map: Map | undefined, track: any) {
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
      if (map) {
        map.getView().fit(boundaries, {
          size: map.getSize(),
          padding: [50, 50, 50, 50],
          duration: 1000  // Optional: animation duration in milliseconds
        });
      }
    })
  }

  // 2. DISPLAY CURRENT TRACK /////////////////////////////////////////

  async displayCurrentTrack(map: Map | undefined, currentTrack: any, currentFeature: any, currentMarkers: any[]): Promise<void> {
    // Ensure current track and map exist
    if (!currentTrack || !map || !currentFeature || !currentMarkers?.[1]) return;
    // Number of points in the track
    const coordinates = currentTrack.features?.[0]?.geometry?.coordinates;
    const num = coordinates?.length ?? 0;
    // Ensure there are enough points to display
    if (num < 2) return;
    // Set line geometry and style
    currentFeature.setGeometry(new LineString(coordinates));
    currentFeature.setStyle(this.setStrokeStyle(global.currentColor));
    // Set the last point as the marker geometry
    currentMarkers[1]?.setGeometry(new Point(coordinates[num - 1]));
    // Adjust map view at specific intervals
    if (num === 5 || num === 10 || num === 25 || num % 50 === 0) {
      await this.setMapView(map, currentTrack);
    }
  }

  // 4. REMOVE LAYER ////////////////////////////////////

  async removeLayer(map: Map | undefined, id: string) {
    // Remove the existing search layer if it exists
    if (!map) return;
    const existingLayer = map.getLayers().getArray().find((layer: { get: (arg0: string) => string; }) => layer.get('id') === id);
    if (existingLayer) {
      map.removeLayer(existingLayer);
    }
  }

  // 5. SET STROKE STYLE //////////////////////////////////

  setStrokeStyle(color: string): Style {
    return new Style({ stroke: new Stroke({
      color: color,
      width: 5 })
    });
  }

  // 6. GET CURRENT POSITION //////////////////////////////////

  async getCurrentPosition(highAccuracy: boolean, timeout: number ): Promise<[number, number] | null> {
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          resolve,
          reject,
          {
            enableHighAccuracy: highAccuracy,
            timeout: timeout
          }
        );
      });
      return [position.coords.longitude, position.coords.latitude];
    } catch (error) {
      console.error('Error getting current position:', error);
      return null;
    }
  }

  // 7. CENTER ALL TRACKS

  async centerAllTracks(map: Map | undefined): Promise<void> {
    // get current position
    let currentPosition: [number, number] | null = await this.getCurrentPosition(false, 1000);
    // center map
    if (currentPosition) {
      if (map) {
        map.getView().setCenter(currentPosition);
        map.getView().setZoom(8);
      }
    }
  }

  // 8. GET COLORED PIN //////////////////////////

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

  // 9. CREATE PIN STYLE //////////////////////////

  createPinStyle(color: string): Style {
    return new Style({
      image: new Icon({
        src: this.getColoredPin(color),
        anchor: [0.5, 1],
        scale: 0.05
      })
    });
  }

  // 10. CREATE LAYERS /////////////////////////////////////

  createLayers() {
    // Create pin styles
    const greenPin = this.createPinStyle('green');
    const redPin = this.createPinStyle('red');
    const bluePin = this.createPinStyle('blue');
    const yellowPin = this.createPinStyle('yellow');
    const blackPin = this.createPinStyle('black');
    // Create features
    const currentFeature = new Feature();
    const currentMarkers = [new Feature(), new Feature(), new Feature()];
    const multiFeature = new Feature();
    const multiMarker = new Feature();
    const archivedFeature = new Feature();
    const archivedMarkers = [new Feature(), new Feature(), new Feature()];
    const archivedWaypoints = new Feature();
    // Vector sources
    const csource = new VectorSource({ features: [currentFeature, ...currentMarkers] });
    const asource = new VectorSource({ features: [archivedFeature, ...archivedMarkers, archivedWaypoints] });
    const msource = new VectorSource({ features: [multiFeature, multiMarker] });
    // Vector layers
    const currentLayer = new VectorLayer({ source: csource });
    const archivedLayer = new VectorLayer({ source: asource });
    const multiLayer = new VectorLayer({ source: msource });
    // Return everything
    return {
      pinStyles: { greenPin, redPin, bluePin, yellowPin, blackPin },
      features: {
        currentFeature,
        currentMarkers,
        multiFeature,
        multiMarker,
        archivedFeature,
        archivedMarkers,
        archivedWaypoints,
      },
      layers: {
        currentLayer,
        archivedLayer,
        multiLayer,
      }
    };
  }

  // 11. CREATE MAP /////////////////////////////////////

  async createMap(options: {
    mapProvider: string;
    currentLayer: any;
    archivedLayer: any;
    multiLayer: any;
    server: any;
    getCurrentPosition: (force: boolean, timeout: number) => Promise<[number, number] | null>;
    showCredits: (credits: string) => void;
    target?: string;
  }): Promise<{ map: Map; credits: string }> {
    const {
      mapProvider,
      currentLayer,
      archivedLayer,
      multiLayer,
      server,
      //createSource,
      getCurrentPosition,
      showCredits,
      target = 'map',
    } = options;
    let currentPosition: [number, number] | null = null;
    if (mapProvider !== 'catalonia') {
      currentPosition = await getCurrentPosition(false, 1000);
    }
    let olLayer: any;
    let credits = '';
    switch (mapProvider) {
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
      case "MapTiler_satellite":
        credits = '© MapTiler © OpenStreetMap contributors';
        olLayer = new TileLayer({ source: new XYZ({ url: `https://api.maptiler.com/maps/satellite/{z}/{x}/{y}.png?key=${global.mapTilerKey}`,
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
        await server.openMbtiles('catalonia.mbtiles');
        const sourceResult = await this.createSource(server);
        if (sourceResult) {
          olLayer = new VectorTileLayer({ source: sourceResult, style: this.styleService.styleFunction });
        }
        break;
      default:
        credits = '© OpenStreetMap contributors';
        olLayer = new TileLayer({ source: new OSM() });
        break;
    }
    let minZoom = 0;
    let maxZoom = 19;
    if (mapProvider === 'catalonia') {
      minZoom = 6;
      maxZoom = 14;
    }
    if (!currentPosition) {
      currentPosition = [2, 41];
    }
    const view = new View({
      center: currentPosition,
      zoom: 9,
      minZoom,
      maxZoom,
    });
    const map = new Map({
      target,
      layers: [olLayer, currentLayer, archivedLayer, multiLayer].filter(Boolean),
      view,
      controls: [new Zoom(), new ScaleLine(), new Rotate(), new CustomControl(this)],
    });
    showCredits(credits);
    this.mapWrapperElement = document.getElementById('map-wrapper');
    return { map, credits };
  }

  // 12. CHANGE MAP PROVIDER

  async updateMapProvider(options: {
    map: any;
    currentProvider: string;
    mapProvider: string;
    server: any;
    fs: any;
    onFadeEffect?: () => void;
  }): Promise<{ newProvider: string }> {
    const {
      map,
      currentProvider,
      mapProvider,
      server,
      fs,
      onFadeEffect
    } = options;
    if (!map) return { newProvider: currentProvider };
    let newBaseLayer = null;
    let credits = '';
    if (currentProvider === mapProvider) return { newProvider: mapProvider };
    switch (mapProvider) {
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
      case "MapTiler_satellite":
        credits = '© MapTiler © OpenStreetMap contributors';
        newBaseLayer = new TileLayer({
          source: new XYZ({ url: `https://api.maptiler.com/maps/satellite/{z}/{x}/{y}.png?key=${global.mapTilerKey}`,
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
        map.getView().setCenter([2, 41]);
        map.getView().setZoom(8);
        await server.openMbtiles('catalonia.mbtiles');
        const sourceResult = await this.createSource(server);
        if (sourceResult) {
          newBaseLayer = new VectorTileLayer({ source: sourceResult, style: this.styleService.styleFunction });
        }
        break;
    }
    if (newBaseLayer) {
      const olLayers = map.getLayers();
      map.removeLayer(olLayers.item(0));
      map.getLayers().insertAt(0, newBaseLayer);
    } else {
      console.warn('No base layer created.');
      return { newProvider: currentProvider };
    }
    // Optional fade effect
    if (onFadeEffect) onFadeEffect();
    await fs.displayToast(credits);
    // Set min/max zoom
    let minZoom = 0;
    let maxZoom = 19;
    if (mapProvider.toLowerCase() === 'catalonia') {
      minZoom = 6;
      maxZoom = 14;
    }
    map.getView().setMinZoom(minZoom);
    map.getView().setMaxZoom(maxZoom);
    return { newProvider: mapProvider };
  }

  // 13. DISPLAY AN ARCHIVED TRACK
  async displayArchivedTrack({
    map,
    archivedTrack,
    archivedLayer,
    archivedFeature,
    archivedMarkers,
    archivedWaypoints,
    greenPin,
    redPin,
    yellowPin,
    archivedColor
  }: {
    map: any,
    archivedTrack: any,
    archivedLayer: any,
    archivedFeature: Feature,
    archivedMarkers: Feature[],
    archivedWaypoints?: Feature,
    greenPin: any,
    redPin: any,
    yellowPin: any,
    archivedColor: any
  }): Promise<void> {
    if (!map || !archivedTrack || !archivedLayer) return;
    console.log('33', archivedTrack);
    archivedLayer.setVisible(true);
    const coordinates = archivedTrack.features[0].geometry.coordinates;
    const num = coordinates.length;
    if (num === 0) return;
    archivedFeature.setGeometry(new LineString(coordinates));
    archivedFeature.setStyle(this.setStrokeStyle(archivedColor));
    if (archivedMarkers.length >= 3) {
      archivedMarkers[0].setGeometry(new Point(coordinates[0]));
      archivedMarkers[0].setStyle(greenPin);
      archivedMarkers[2].setGeometry(new Point(coordinates[num - 1]));
      archivedMarkers[2].setStyle(redPin);
    }
    const waypoints = archivedTrack.features[0].waypoints || [];
    const multiPoint = waypoints.map((point: { longitude: any; latitude: any; }) => [point.longitude, point.latitude]);
    if (archivedWaypoints) {
      archivedWaypoints.setGeometry(new MultiPoint(multiPoint));
      archivedWaypoints.set('waypoints', waypoints);
      archivedWaypoints.setStyle(yellowPin);
    }
  }

  // 14. DISPLAY ALL TRACKS
  async displayAllTracks({
    fs,
    collection,
    multiFeature,
    multiMarker,
    greenPin,
    multiLayer,
  }: {
    fs: any;
    collection: any[];
    multiFeature: Feature;
    multiMarker?: Feature;
    greenPin: any;
    multiLayer?: any;
  }) {
    let key: any;
    let track: any;
    const multiLine: any[] = [];
    const multiPoint: any[] = [];
    const multiKey: any[] = [];
    for (const item of collection) {
      key = item.date;
      track = await fs.storeGet(JSON.stringify(key));
      if (!track) {
        await fs.storeRem(key);
        continue;
      }
      const coord = track.features[0]?.geometry?.coordinates;
      console.log('coord', coord);
      if (coord) {
        multiLine.push(coord);
        multiPoint.push(coord[0]);
        multiKey.push(item.date);
      }
    }
    multiFeature.setGeometry(new MultiLineString(multiLine));
    if (multiMarker) {
      multiMarker.setGeometry(new MultiPoint(multiPoint));
      multiMarker.set('multikey', multiKey);
      multiMarker.setStyle(greenPin);
    }
    multiFeature.setStyle(this.setStrokeStyle('black'));
    if (multiLayer) {
      multiLayer.setVisible(true);
    }
  }

  // 15. ADD SEARCH LAYER ////////////////////////////////
  async addSearchLayer({
    map,
    feature,
    blackPin,
    setStrokeStyle,
  }: {
    map: any;
    feature: Feature<Geometry>;
    blackPin?: Style;
    setStrokeStyle: (color: string) => Style;
  }): Promise<void> {
    if (!map) return;
    // Remove previous search layer
    await this.removeLayer(map, 'searchLayerId');
    global.presentSearch = false;
    global.removeSearch = false;
    const styleFunction = (featureLike: FeatureLike) => {
      const geometryType = featureLike.getGeometry()?.getType();
      if (geometryType === 'Point') {
        return blackPin ?? setStrokeStyle('black'); // fallback to stroke style if blackPin is undefined
      } else if (geometryType === 'Polygon' || geometryType === 'MultiPolygon') {
        return new Style({
          stroke: new Stroke({
            color: 'black',
            width: 2,
          }),
          fill: new Fill({
            color: 'rgba(128, 128, 128, 0.5)',
          }),
        });
      } else {
        return setStrokeStyle('black');
      }
    };
    const searchLayer = new VectorLayer({
      source: new VectorSource({ features: [feature] }),
      style: styleFunction,
    });
    searchLayer.set('id', 'searchLayerId');
    map.addLayer(searchLayer);
    global.presentSearch = true;
  }

  // 16. CREATE SOURCE //////////////////////////////
  async createSource(server: { getVectorTile: (z: number, x: number, y: number) => Promise<ArrayBuffer> }): Promise<VectorTileSource | null> {
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
              const rawData = await server.getVectorTile(z, x, y);
              if (!rawData?.byteLength) {
                vectorTile.setFeatures([]);
                vectorTile.setState(TileState.EMPTY);
                return;
              }
              const decompressed = pako.inflate(new Uint8Array(rawData));
              const safeBuffer = new Uint8Array(decompressed.length);
              safeBuffer.set(decompressed);
              const features = new MVT().readFeatures(safeBuffer.buffer, {
                extent: vectorTile.extent ?? [-20037508.34, -20037508.34, 20037508.34, 20037508.34],
                featureProjection: 'EPSG:3857',
              });
              vectorTile.setFeatures(features);
            } catch (error) {
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

  // 17. CYCLE ZOOM //////////////////////////////
  async cycleZoom(): Promise<void> {
    if (!this.mapWrapperElement) {
      console.warn('Map wrapper element not found');
      return;
    }
    this.currentScaleIndex = (this.currentScaleIndex + 1) % this.scaleSteps.length;
    const scale = this.scaleSteps[this.currentScaleIndex];
    this.mapWrapperElement.style.transform = `scale(${scale})`;
  }

}





