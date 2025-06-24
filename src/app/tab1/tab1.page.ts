/**
 * Main page component for managing and displaying GPS tracks, map layers, and user interactions.
 *
 * Handles track recording, editing, storage, and visualization using OpenLayers and Ionic UI.
 * Supports multiple map providers, real-time location tracking, archived track management,
 * waypoint handling, and user notifications. Integrates with device features for background
 * tasks, file import, and language detection. Provides methods for map interaction, track
 * statistics computation, and UI feedback.
 */

// IMPORTS /////////////////////////////////
import { Component, NgZone, Injectable, OnDestroy } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { CommonModule, DecimalPipe, DatePipe } from '@angular/common';
import { Router } from '@angular/router';
import { PluginListenerHandle, registerPlugin } from "@capacitor/core";
import { Storage } from '@ionic/storage-angular';
import { FormsModule } from '@angular/forms';
import { CUSTOM_ELEMENTS_SCHEMA, ChangeDetectorRef } from '@angular/core';
import { register } from 'swiper/element/bundle';
import Map from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import OSM from 'ol/source/OSM';
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import LineString from 'ol/geom/LineString';
import { Location, Bounds, Track, TrackDefinition, Data, Waypoint } from '../../globald';
import { FunctionsService } from '../services/functions.service';
import { TrackService } from '../services/track.service';
import { ServerService } from '../services/server.service';
import { global } from '../../environments/environment';
const BackgroundGeolocation: any = registerPlugin("BackgroundGeolocation");
import { Circle as CircleStyle, Fill, Stroke, Icon, Style, Circle } from 'ol/style';
import { useGeographic } from 'ol/proj.js';
import { Zoom, ScaleLine, Rotate, OverviewMap } from 'ol/control'
import { App } from '@capacitor/app';
import { Geometry, MultiLineString, MultiPoint } from 'ol/geom';
import { ForegroundService } from '@capawesome-team/capacitor-android-foreground-service';
import GeoJSON from 'ol/format/GeoJSON';
import { fromLonLat } from 'ol/proj';
import { Coordinate } from 'ol/coordinate';
import Polyline from 'ol/format/Polyline.js';
import XYZ from 'ol/source/XYZ';
import VectorTileLayer from 'ol/layer/VectorTile';
import VectorTileSource from 'ol/source/VectorTile';
import { Capacitor } from '@capacitor/core';
import MVT from 'ol/format/MVT';
import { TileGrid, createXYZ } from 'ol/tilegrid';
import LayerRenderer from 'ol/renderer/Layer';
import { Filesystem, Directory, Encoding, ReadFileResult } from '@capacitor/filesystem';
import { BackgroundTask } from '@capawesome/capacitor-background-task';
import { Device } from '@capacitor/device';
import { ModalController } from '@ionic/angular';
import { LocalNotifications } from '@capacitor/local-notifications';
import { EditModalComponent } from '../edit-modal/edit-modal.component';
import { SearchModalComponent } from '../search-modal/search-modal.component';
import { NominatimService } from '../services/nominatim.service';
import { lastValueFrom } from 'rxjs';
import Text from 'ol/style/Text';
import { nodeModuleNameResolver } from 'typescript';
import { FeatureLike } from 'ol/Feature';
import Layer from 'ol/renderer/Layer';
import { CustomControl } from '../utils/openlayers/custom-control'; // Adjust path if needed
import VectorTile from 'ol/VectorTile';
import RenderFeature from 'ol/render/Feature';
import TileState from 'ol/TileState';
import { Tile } from 'ol';
import pako from 'pako';
import { debounce } from 'lodash';
import BaseLayer from 'ol/layer/Base';
const vectorFormat = new MVT();
useGeographic();
register();

// INTERFACES /////////////////////////////
interface StyleJSON {
  layers: Array<{
    type: string;
    'source-layer': string;
    filter?: any[];
    minzoom?: number | { [rank: number]: number };
    maxzoom?: number;
    paint?: { [key: string]: any };
    layout?: { [key: string]: any };
  }>;
}

// STYLE FUNCTIONS ////////////////////////
const getZoomFromResolution = (resolution: number): number => {
  if (typeof resolution !== 'number' || resolution <= 0) {
    throw new Error('Invalid resolution value');
  }
  return Math.log2(156543.03 / resolution);
};

const getPaintValue = (paint: any, key: string, fallback: any) => paint?.[key] ?? fallback;

const styleFunction = (feature: FeatureLike, resolution: number) => {
  const sourceLayer = feature.get('_layer') || feature.get('layer') || feature.get('source-layer');
  const classLayer = feature.get('class');
  const styleJSON: StyleJSON | undefined = global && typeof global.maptiler_terrain_modified === 'object'
    ? global.maptiler_terrain_modified
    : undefined;
  if (!styleJSON || !Array.isArray(styleJSON.layers)) {
    // Optionally log an error or warning here
    return new Style({});
  }
  const zoom = getZoomFromResolution(resolution);
  for (const layerStyle of styleJSON.layers) {
    if (layerStyle['source-layer'] !== sourceLayer) continue;
    // Apply feature filter before styling
    if (layerStyle.filter && !evaluateFilter(layerStyle.filter, feature)) continue;
    let computedMinZoom = 0; // Default to 0 if undefined
    if (typeof layerStyle.minzoom === 'object') {
      const rank = feature.get('rank') || 0; // Default rank to 0 if undefined
      // Sort the minzoom keys in ascending order (to handle arbitrary input like "2": 9, "5": 11, etc.)
      const sortedKeys = Object.keys(layerStyle.minzoom)
        .map(Number) // Convert to number
        .sort((a, b) => a - b); // Sort in ascending order
      // Find the correct zoom level based on the rank
      for (let i = 0; i < sortedKeys.length; i++) {
        const rankStop = sortedKeys[i];
        const nextRankStop = sortedKeys[i + 1];
        if (rank <= rankStop) {
          computedMinZoom = layerStyle.minzoom[rankStop];
          break;
        }
        // If rank is larger than the last key, default to the max zoom value
        if (nextRankStop === undefined) {
          computedMinZoom = layerStyle.minzoom[rankStop];
        }
      }
    } else if (typeof layerStyle.minzoom === 'number') {
      computedMinZoom = layerStyle.minzoom;
    }
    // Apply minzoom and maxzoom filtering
    if (zoom < computedMinZoom) continue;
    if (layerStyle.maxzoom !== undefined && zoom > layerStyle.maxzoom) continue;
    switch (layerStyle.type) {
      case 'fill':
        return new Style({
          fill: new Fill({
            color: getPaintValue(layerStyle.paint, 'fill-color', '#000000'),
          }),
        });
      case 'line': {
        const rawLineWidth = getPaintValue(layerStyle.paint, 'line-width', undefined);
        let lineWidth = 1; // Default width
        if (Array.isArray(rawLineWidth)) {
          const stops = extractStops(rawLineWidth);
          if (stops.length > 0) {
            lineWidth = interpolateStops(stops, zoom); // Use zoom level to adjust line width
          }
        } else if (typeof rawLineWidth === 'number') {
          lineWidth = rawLineWidth;
        }
        // Apply calculated line width
        return new Style({
          stroke: new Stroke({
            color: getPaintValue(layerStyle.paint, 'line-color', '#000000'),
            width: Math.max(lineWidth, 1), // Ensure minimum width is 1
          }),
        });
      }
      case 'symbol': {
        // Read text size from layer, default to 10px if not specified
        const textSizeRaw = layerStyle.layout?.['text-size'] || 10; // Default to 10 if not provided
        // Ensure textSize is a number
        let textSize = typeof textSizeRaw === 'number' ? textSizeRaw : 10;
        return new Style({
          text: new Text({
            text: (feature.get('name') || feature.get('rawName') || 'Unknown').replace(/\n/g, ' '),
            font: `bold ${textSize}px sans-serif`, // Use textSize from layer
            fill: new Fill({ color: getPaintValue(layerStyle.paint, 'text-color', '#000000') }),
            stroke: new Stroke({ color: getPaintValue(layerStyle.paint, 'text-halo-color', '#FFFFFF'), width: 2 }),
            scale: Math.max(textSize / 10, 1), // Prevent too-large scaling
          }),
        });
      }
      default:
        continue;
    }
  }
  // Default return value to prevent errors
  return new Style({});
};

function extractStops(expression: any[]): [number, number][] {
  if (Array.isArray(expression) && expression.length > 4 && expression[0] === "interpolate") {
    const stops: [number, number][] = [];
    for (let i = 3; i < expression.length; i += 2) {
      const stop: [number, number] = [Number(expression[i]), Number(expression[i + 1])]; // Convert to numbers
      // Check if both values are numbers
      if (!isNaN(stop[0]) && !isNaN(stop[1])) {
        stops.push(stop);
      }
    }
    return stops;
  }
  return [];
}

function evaluateFilter(filter: any[], feature: FeatureLike): boolean {
  if (!Array.isArray(filter) || filter.length === 0) return true; // No filter = always matches
  if (!["all", "any", "none"].includes(filter[0]) && typeof filter[0] !== "string") return true; // Ignore invalid filters
  const properties = feature.getProperties() || {}; // Ensure properties exist
  function matchCondition(condition: any[]): boolean {
    if (!Array.isArray(condition) || condition.length < 2) return false;
    const [operator, field, ...values] = condition;
    const value = properties[field] ?? null;
    if (operator === "==") return value === values[0];
    if (operator === "!=") return value !== values[0];
    if (operator === ">") return typeof value === 'number' && value > values[0];
    if (operator === ">=") return typeof value === 'number' && value >= values[0];
    if (operator === "<") return typeof value === 'number' && value < values[0];
    if (operator === "<=") return typeof value === 'number' && value <= values[0];
    if (operator === "in") return values.includes(value); // FIXED
    if (operator === "!in") return !values.includes(value); // FIXED
    if (operator === "has") return field in properties;
    if (operator === "!has") return !(field in properties);
    return false; // Unknown operator
  }
  if (filter[0] === "all") {
    return filter.slice(1).every(matchCondition);
  } else if (filter[0] === "any") {
    return filter.slice(1).some(matchCondition);
  } else if (filter[0] === "none") {
    return !filter.slice(1).some(matchCondition);
  }
  return matchCondition(filter); // Direct condition
}

function interpolateStops(stops: [number, number][], zoom: number): number {
  if (!Array.isArray(stops) || stops.length === 0) return 1; // Default value if stops is empty
  for (let i = 0; i < stops.length - 1; i++) {
    const [z1, v1] = stops[i];
    const [z2, v2] = stops[i + 1];
    if (zoom >= z1 && zoom <= z2) {
      return v1 + ((zoom - z1) / (z2 - z1)) * (v2 - v1);
    }
  }
  return stops[stops.length - 1][1]; // Return last value if zoom is beyond last stop
}

// DEFINE COMPONENT /////////////////////////
@Component({
    selector: 'app-tab1',
    templateUrl: 'tab1.page.html',
    styleUrls: ['tab1.page.scss'],
    imports: [IonicModule, CommonModule, FormsModule],
    providers: [DecimalPipe, DatePipe],
    schemas: [CUSTOM_ELEMENTS_SCHEMA]
})

export class Tab1Page {

  watcherId: number = 0;
  currentTrack: Track | undefined = undefined;
  archivedTrack: Track | undefined = undefined;
  track: Track | undefined = undefined;
  vMax: number = 400;
  margin: number = 10;
  threshold: number = 20;
  altitudeThreshold: number = 20;
  properties: (keyof Data)[] = ['altitude', 'compSpeed'];
  gridsize: string = '-';
  map: Map | undefined;
  currentMarkers: Feature<Point>[] = [new Feature<Point>(), new Feature<Point>(), new Feature<Point>()];
  archivedMarkers: Feature<Point>[] = [new Feature<Point>(), new Feature<Point>(), new Feature<Point>()];
  multiMarker: Feature<MultiPoint> | undefined = undefined;
  archivedWaypoints: Feature<MultiPoint> | undefined = undefined;
  lag: number = global.lag; // 8
  distanceFilter: number = 10; // .05 / 5
  altitudeFiltered: number = 0;
  speedFiltered: number = 0;
  averagedSpeed: number = 0;
  computedDistances: number = 0;
  mapProvider: string = 'OpenStreetMap'
  stopped: any = 0;
  vMin: number = 1;
  currentAverageSpeed: number | undefined = undefined;
  currentMotionSpeed: number | undefined = undefined;
  currentMotionTime: any = '00:00:00';
  archivedFeature: any;
  currentFeature: any;
  multiFeature: any;
  threshDist: number = 0.0000002;
  lastN: number = 0;
  currentLayer: VectorLayer<VectorSource> | undefined;
  archivedLayer: VectorLayer<VectorSource> | undefined;
  multiLayer: VectorLayer<VectorSource> | undefined;
  foreground: boolean = true;
  //extremes: Extremes | undefined
  status: 'black' | 'red' | 'green' = 'black'
  audioCtx: AudioContext | null = null;
  beepInterval: any;
  language: 'ca' | 'es' | 'en' | 'other' = 'other';
  popText: [string, string, number] | undefined = undefined;
  intervalId: any = null;
  arcTitle = ['TRAJECTE DE REFERÈNCIA','TRAYECTO DE REFERENCIA','REFERENCE TRACK'];
  curTitle = ['TRAJECTE ACTUAL','TRAYECTO ACTUAL','CURRENT TRACK'];
  distance = ['Distància','Distancia','Distance'];
  eGain = ['Desnivell positiu','Desnivel positivo','Elevation gain'];
  eLoss = ['Desnivell negatiu','Desnivel negativo','Elevation loss'];
  time = ['Temps', 'Tiempo','Time'];
  motionTime = ['Temps en moviment','Tiempo en movimiento','In-motion time'];
  points = ['Punts gravats','Puntos grabados','Recorded points'];
  altitude = ['Altitud actual','Altitud actual','Current altitude'];
  speed = ['Velocitat actual','Velocidad actual','Current speed'];
  avgSpeed = ['Velocitat mitjana','Velocidad nedia','Average speed'];
  motionAvgSpeed = ['Vel. mitjana en moviment','Vel. nedia en movimiento.','In-motion average speed'];
  appStateListener?: PluginListenerHandle;
  greenPin?: Style;
  redPin?: Style;
  bluePin?: Style;
  yellowPin?: Style;
  blackPin?: Style;
  debouncedComputeDistances: any;
  debouncedFilterAltitude: any;
  debouncedDisplayCurrentTrack: any;
  selectedAltitude: string = 'GPS'; // Default altitude method

  get languageIndex(): number { return global.languageIndex; }
  get state(): string { return global.state; }

  constructor(
    public fs: FunctionsService,
    public ts: TrackService,
    public server: ServerService,
    private router: Router,
    public storage: Storage,
    private zone: NgZone,
    private cd: ChangeDetectorRef,
    private modalController: ModalController,
    private nominatimService: NominatimService
  ) {
  }

  /* FUNCTIONS

  1. ngOnInit
  2. listenToAppStateChanges
  3. initializeDebouncedFunctions
  3b. addFileListener
  3c. onDestroy
  4. ionViewDidEnter
  ** 5. centerAllTracks
  ** 6. displayCurrentTrack
  7. startTracking
  ** 8. removeTrack
  9. stopTracking
  10. confirm
  11. setTrackDetails
  12. showValidationAlert
  13. saveFile
  14. buildGeoJson
  15. onRoute
  16. show

  ** 19. displayArchivedTrack
  20. setMapView
  21. firstPoint
  22. createMap
  23. filterAltitude
  ** 24. createLayers
  25. displayAllTracks
  26. handleMapClick()

  ??? 27. computeDistances()
  28. checkWhetherOnRoute()

  38. fixWrongOrder()

  40. ionViewWillLeave()
  41. playBeep()
  42. playDoubleBeep()
  43. parseGpx()
  44. processUrl()
  45. foregroundTask()
  46. backgroundTask()
  47. startBeepInterval()
  48. startBeepInterval()
  49. changeMapProvider()
  50. determineLanguage()
  51. determineColors()
  52. waypoint()
  53. setWaypointAltitude()
  54. search()
  55. uide()

  57. addSearchLayer()
  58. removeLayer()

  */

  // 1. ON INIT ////////////////////////////////
  async ngOnInit() {
    try {
      //this.initializeDebouncedFunctions();
      // Listen for state changes
      this.listenToAppStateChanges();
      // create storage
      await this.storage.create();
      // Listen for app URL open events (e.g., file tap)
      this.addFileListener();
      // Check map provider
      this.mapProvider = await this.fs.check(this.mapProvider, 'mapProvider');
      // retrieve collection
      global.collection = await this.fs.storeGet('collection') || [];
      // Determine language
      this.determineLanguage();
      // Determine line color
      this.determineColors();
      // elements shown, elements hidden
      this.show('alert', 'none');
      // uncheck all
      await this.fs.uncheckAll();
      // create map
      await this.createMap()
    } catch (error) {
      console.error('Error during ngOnInit:', error);
    }
    global.ngOnInitFinished = true;
  }

  // 2. LISTEN TO CHANGES IN FOREGROUND - BACKGROUND
  async listenToAppStateChanges() {
    this.appStateListener = await App.addListener('appStateChange', async (state) => {
      if (!this.currentTrack) return;
      this.foreground = state.isActive;
      if (this.foreground) {
        this.stopBeepInterval();
        try {
          await this.morningTask();
        } catch (err) {
          console.error('Error in morningTask:', err);
        }
      } else {
        this.startBeepInterval();
      }
    });
  }

  // 3. INITIALIZE DEBOUNCED FUNCTIONS ////////////////////
  private initializeDebouncedFunctions() {
    this.debouncedComputeDistances = debounce(this.computeDistances.bind(this), 300);
    this.debouncedFilterAltitude = debounce(this.filterAltitude.bind(this), 300);
    this.debouncedDisplayCurrentTrack = debounce(this.displayCurrentTrack.bind(this), 300);
  }

  // 3b. LISTENING FOR OPEN EVENTS
  addFileListener() {
    // Listen for app URL open events (e.g., file tap)
    App.addListener('appUrlOpen', async (data: any) => {
      this.fs.gotoPage('tab1');
      await this.processUrl(data);
      global.layerVisibility = 'archived'
      // assign visibility
      if (this.multiLayer) this.multiLayer.setVisible(false);
      // iF an archived track has been parsed...
      if (this.archivedTrack) {
        this.ts.setArchivedTrack(this.archivedTrack);
        // Display archived track
        await this.displayArchivedTrack();
        // Set map view for archived track if no current track
        if (!this.currentTrack) {
          await this.setMapView(this.archivedTrack);
        }
      }
    });
  }

  // 3c. ON DESTROY ////////////////////////
  ngOnDestroy(): void {
    // Remove app state listener
    if (this.appStateListener) {
      this.appStateListener.remove();
      this.appStateListener = undefined;
    }
    // Clear beep interval
    if (this.beepInterval) {
      clearInterval(this.beepInterval);
      this.beepInterval = null;
    }
  }

  // 4. ION VIEW DID ENTER
  async ionViewDidEnter() {
    while (!global.ngOnInitFinished) {
      await new Promise(resolve => setTimeout(resolve, 50)); // Wait until ngOnInit is done
    }
    try {
      // Remove search
      if (global.removeSearch) {
        await this.removeLayer('searchLayerId');
        global.presentSearch = false;
        global.removeSearch = false;
      }
      // retrieve collection
      if (global.collection.length <= 0) global.collection = await this.fs.storeGet('collection') || [];
      // change map provider
      await this.changeMapProvider();
      // Altitude method
      this.selectedAltitude = await this.fs.check(this.selectedAltitude, 'altitude');
      // Display current track (updates color)
      if (this.currentTrack && this.map) await this.displayCurrentTrack();
      // archived visible
      if (global.layerVisibility == 'archived') {
        // retrieve archived track
        this.archivedTrack = await this.fs.retrieveTrack() ?? this.archivedTrack;
        if (this.archivedTrack) {
          console.log(this.archivedTrack)
          this.ts.setArchivedTrack(this.archivedTrack);
          //this.extremes = await this.fs.computeExtremes(this.archivedTrack);
        }
         // assign visibility
        if (this.multiLayer) this.multiLayer.setVisible(false);
        // iF archived track is available...
        if (this.archivedTrack) {
          console.log('3', this.archivedTrack)
          // Display ar
          // chived track
          await this.displayArchivedTrack();
          console.log('4');
          // Set map view for archived track if no current track
          if (!this.currentTrack) {
            await this.setMapView(this.archivedTrack);
          }
        }
      }
      else if (global.layerVisibility == 'multi') {
        // hide archived track
        try {
          if (this.archivedLayer) this.archivedLayer.setVisible(false);
        } catch (error) {}
        this.status = 'black'
        this.ts.setStatus(this.status);
        // display all tracks
        await this.displayAllTracks();
        // center all tracks
        if (!this.currentTrack) await this.centerAllTracks();
      }
      else {
        this.status = 'black';
        this.ts.setStatus(this.status);
        // Hide archived and multi layers
        if (this.archivedLayer) this.archivedLayer.setVisible(false);
        if (this.multiLayer) this.multiLayer.setVisible(false);
      }
      // center current track
      if (this.currentTrack) {
        await this.setMapView(this.currentTrack);
      }
    } catch (error) {
      console.error('Error in ionViewDidEnter:', error);
    }
  }

  // 5. CENTER ALL TRACKS
  async centerAllTracks() {
    // get current position
    let currentPosition: [number, number] | undefined = await this.fs.getCurrentPosition(false, 1000);
    // center map
    if (currentPosition) {
      if (this.map) {
        this.map.getView().setCenter(currentPosition);
        this.map.getView().setZoom(8);
      }
    }
  }

  // 6. DISPLAY CURRENT TRACK
async displayCurrentTrack() {
    // Ensure current track and map exist
    if (!this.currentTrack || !this.map || !this.currentFeature || !this.currentMarkers?.[1]) return;
    // Number of points in the track
    const coordinates = this.currentTrack.features?.[0]?.geometry?.coordinates;
    const num = coordinates?.length ?? 0;
    // Ensure there are enough points to display
    if (num < 2) return;
    // Set line geometry and style
    this.currentFeature.setGeometry(new LineString(coordinates));
    this.currentFeature.setStyle(this.fs.setStrokeStyle(global.currentColor));
    // Set the last point as the marker geometry
    this.currentMarkers[1]?.setGeometry(new Point(coordinates[num - 1]));
    // Adjust map view at specific intervals
    if (num === 5 || num === 10 || num === 25 || num % 50 === 0) {
      await this.setMapView(this.currentTrack);
    }
  }

  // 7. START TRACKING /////////////////////////////////
  async startTracking() {
    // In case there is something wrong
    if (!this.currentLayer) return;
    // Check-reqauest permissions
    const permissionGranted = await ForegroundService.checkPermissions();
    if (!permissionGranted) {
      // If not, request the necessary permissions
      await ForegroundService.requestPermissions();
    }
    // Check if overlay permission is needed and granted
    const overlayPermissionGranted = await ForegroundService.checkManageOverlayPermission();
    if (!overlayPermissionGranted) {
      // If not, request the overlay permission
      await ForegroundService.requestManageOverlayPermission();
    }
    // start foreground service
    const notice = ["S'està seguint la vostra ubicazció", "Rastreando tu posición", "Tracking your location"]
    await ForegroundService.startForegroundService({
      id: 1234,
      title: notice[global.languageIndex],
      body: '',
      smallIcon: 'splash.png',
    });
    // Reset current track and related variables
    this.currentTrack = undefined;
    this.ts.setCurrentTrack(this.currentTrack);
    this.currentLayer.setVisible(false);
    // initialize variables
    this.stopped = 0;
    this.currentAverageSpeed = undefined;
    this.currentMotionSpeed = undefined;
    this.currentMotionTime = '00:00:00';
    this.speedFiltered = 0;
    this.altitudeFiltered = 0;
    this.averagedSpeed = 0;
    this.computedDistances = 0;
    this.audioCtx = new window.AudioContext
    // request permission
    const { display } = await LocalNotifications.checkPermissions();
    if (display !== 'granted') {
      const permissionResult = await LocalNotifications.requestPermissions();
      if (permissionResult.display === 'granted') {
        console.log('Notification permission granted.');
      } else {
        console.log('Notification permission denied.');
      }
    } else {
      console.log('Notification permission already granted.');
    }
    // Start Background Geolocation watcher
    BackgroundGeolocation.addWatcher({
      backgroundMessage: '',
      backgroundTitle: notice[global.languageIndex],
      requestPermissions: true,
      stale: false,
      distanceFilter: this.distanceFilter
    }, async (location: Location, error: Error) => {
      if (error) return;
      if (location) {
        if (this.foreground) await this.foregroundTask(location)
        else {
          // Performs background task
          await this.backgroundTask(location)
        }
      }
    }).then((value: any) => this.watcherId = value);
    // show / hide UI elements
    global.state = 'tracking';
  }

  // 8. REMOVE TRACK ///////////////////////////////////
  async removeTrack() {
    // show / hide elements
    global.state = 'inactive'
    this.show('alert', 'none');
    // Reset current track
    this.status = 'black';
    this.ts.setStatus(this.status);
    this.currentTrack = undefined;
    this.ts.setCurrentTrack(this.currentTrack);
    if (this.currentLayer) this.currentLayer.setVisible(false);
    // Toast
    const toast = ["El trajecte actual s'ha esborrat",'El trayecto actual se ha eliminado','The current track has been removed']
    this.fs.displayToast(toast[global.languageIndex]);
  }

  // 9. STOP TRACKING //////////////////////////////////
  async stopTracking() {
    console.log('initiate stop tracking')
    // show / hide elements
    global.state = 'stopped';
    this.show('alert', 'none');
    // Set the red marker at the last coordinate
    const num = this.currentTrack?.features[0].geometry.coordinates.length ?? 0;
    if (num > 0 && this.currentMarkers[2] && this.currentTrack) {
      this.currentMarkers[2].setGeometry(new Point(
        this.currentTrack.features[0].geometry.coordinates[num - 1]
      ));
      this.currentMarkers[2].setStyle(this.redPin);
      if (this.currentMarkers[1]) {
        this.currentMarkers[1].setStyle(undefined);
      }
    }
    // Remove the watcher
    try {
      await BackgroundGeolocation.removeWatcher({ id: this.watcherId });
    } catch (error) {}
    // Stop foreground service
    try {
      await ForegroundService.stopForegroundService();
    } catch (error) {}
    // filter remaining values
    await this.filterAltitude(this.currentTrack, num - 1);
    // Set waypoint altitude
    await this.setWaypointAltitude()
    // set map view
    await this.setMapView(this.currentTrack);
    // Toast
    const toast = ['El trajecte actual ha finalitzat','El trayecto actual ha finalizado','The current track is now finished']
    this.fs.displayToast(toast[global.languageIndex]);
  }

  // 10. CONFIRM TRACK DELETION OR STOP TRACKING
  async confirm(which: string) {
    const stopHeader = ['Finalitzar el trajecte', 'Finalizar el trayecto', 'Stop the track']
    const delHeader = ['Esborrar el trajecte', 'Borrar el trayecto', 'Delete the track']
    const stopMessage = [
      'Esteu segur que voleu finalitzar el trajecte?',
      '¿Estás seguro de que quieres finalizar el trayecto?',
      'Are you sure you want to stop the track'
    ]
    const delMessage = [
      'Esteu segur que voleu eliminar el trajecte?',
      '¿Estás seguro de que quieres eliminar el trayecto?',
      'Are you sure you want to delete the track'
    ]
    const header = which === 'stop' ? stopHeader[global.languageIndex] : delHeader[global.languageIndex]
    const message = which === 'stop' ? stopMessage[global.languageIndex] : delMessage[global.languageIndex]
    console.log('header', header)
    const text = ['Si','Si','Yes']
    const cssClass = 'alert greenishAlert';
    const inputs: never[] = [];
    const buttons =  [
      global.cancelButton,
      {
        text: text[global.languageIndex],
        cssClass: 'alert-ok-button',
        handler: async () => {
          if (which === 'delete') {
            await this.removeTrack();
          } else if (which === 'stop') {
            await this.stopTracking();
          }
        }
      }
    ]
    console.log(buttons)
    await this.fs.showAlert(cssClass, header, message, inputs, buttons, which)
  }

  // 11. SET TRACK NAME, TIME, DESCRIPTION, ...
  async setTrackDetails() {
    const modalEdit = {
      name: '',
      place: '',
      description: ''
    };
    const edit: boolean = true;
    // Open the modal for editing
    const modal = await this.modalController.create({
      component: EditModalComponent,
      componentProps: { modalEdit, edit },
      cssClass: ['modal-class','yellow-class'] ,
      backdropDismiss: true, // Allow dismissal by tapping the backdrop
    });
    await modal.present();
    // Handle the modal's dismissal
    const { data } = await modal.onDidDismiss();
    if (data) {
      let { action, name, place, description } = data;
      if (action === 'ok') {
        // Update the global collection
        if (!name) name = 'No name'
        this.saveFile(name, place, description)
      }
    }
  }

  // 12. NO NAME TO SAVE ////////////////////////////////////
  async showValidationAlert() {
    const cssClass = 'alert greenishAlert'
    const header = 'Validation Error'
    const message = 'Please enter a name for the track.'
    const buttons = ['OK']
    const inputs: never[] = []
    const action = ''
    await this.fs.showAlert(cssClass, header, message, inputs, buttons, action)
  }

  // 13. SAVE FILE ////////////////////////////////////////
  async saveFile(name: string, place: string, description: string) {
    if (!this.currentTrack) return;
    // altitud method
    /*if (this.selectedAltitude === 'DEM') {
      const coordinates: number[][] = this.currentTrack.features[0].geometry.coordinates;
      var altSlopes: any = await this.getAltitudesFromMap(coordinates as [number, number][])
      this.currentTrack.features[0].properties.totalElevationGain = altSlopes.slopes.gain;
      this.currentTrack.features[0].properties.totalElevationLoss = altSlopes.slopes.loss;
      this.currentTrack.features[0].geometry.properties.data.forEach((item, index) => {
        item.altitude = altSlopes.altitudes[index];
      });
    }*/
    // build new track definition
    const currentProperties = this.currentTrack.features[0].properties;
    currentProperties.name = name;
    currentProperties.place = place;
    currentProperties.description = description;
    currentProperties.date = new Date();
    // Save the current track to storage with date as key
    const dateKey = JSON.stringify(currentProperties.date);
    await this.fs.storeSet(dateKey, this.currentTrack);
    await this.fs.storeSet(JSON.stringify(this.currentTrack.features[0].properties.date), this.currentTrack);
    // Create a new track definition
    const trackDef: TrackDefinition = {
      name,
      date: currentProperties.date,
      place,
      description,
      isChecked: false
    };
    // Add new track definition to the collection and save it
    global.collection.push(trackDef);
    await this.fs.storeSet('collection', global.collection);
    // Toast
    const toast = ['Fitxer guardat correctament', 'Fichero guardado correctamente','File saved successfully']
    this.fs.displayToast(toast[global.languageIndex]);
    // Update UI elements
    global.state = 'saved'
    this.show('alert', 'none');
  }

  // 14. BUILD GEOJSON ////////////////////////////////////
  async buildGeoJson(location: Location) {
    // excessive uncertainty / no altitude measured
    if (location.accuracy > this.threshold) return false;
    if (location.altitude == null || location.altitude == undefined) return false;
    if (location.altitude == 0) return false;
    if (location.altitudeAccuracy > this.altitudeThreshold) return false;
    // m/s to km/h
    location.speed = location.speed * 3.6
    // initial point
    if (!this.currentTrack) {
      await this.firstPoint(location);
      return false;
    }
    // check for the locations order...
    await this.fixWrongOrder(location);
    // add location
    await this.fs.fillGeojson(this.currentTrack, location);
    // check whether on route...
    if (this.archivedTrack) {
      await this.checkWhetherOnRoute();
    }
    return true;
  }

  // 15. CHECK WHETHER OR NOT WE ARE ON ROUTE //////////////////////
  async onRoute() {
    // Return 'black' if conditions aren't met
    if (!this.currentTrack || !this.archivedTrack || global.layerVisibility != 'archived') return 'black';
    // Define current and archived coordinates
    const currentCoordinates = this.currentTrack.features[0].geometry.coordinates;
    const archivedCoordinates = this.archivedTrack.features[0].geometry.coordinates;
    if (currentCoordinates.length === 0 || archivedCoordinates.length === 0) return 'black';
    // Define parameters
    const bounding = (this.status === 'red' ? 0.25 : 42.5) * Math.sqrt(this.threshDist);
    //const reduction = Math.max(Math.round(archivedCoordinates.length / 2000), 1);
    const reduction = 1 // no reduction
    const multiplier = 10;
    const skip = 5;
    // Get the point to check from the current track
    const point = currentCoordinates[currentCoordinates.length - 1];
    // Boundary check
    const bbox = this.archivedTrack.features[0].bbox;
    if (bbox)  {
      if (point[0] < bbox[0] - bounding || point[0] > bbox[2] + bounding ||
        point[1] < bbox[1] - bounding || point[1] > bbox[3] + bounding) return 'red'
    }
    //if (this.extremes) {
    //  if (point[0] < this.extremes.minX - bounding || point[0] > this.extremes.maxX + bounding ||
    //      point[1] < this.extremes.minY - bounding || point[1] > this.extremes.maxY + bounding) {
    //    return 'red';
    //  }
    //}
    // Forward search
    for (let i = this.lastN; i < archivedCoordinates.length; i += reduction) {
      const point2 = archivedCoordinates[i];
      const distSq = (point[0] - point2[0]) ** 2 + (point[1] - point2[1]) ** 2;
      if (distSq < this.threshDist) {
        this.lastN = i;
        return 'green';
      } else if (distSq > multiplier * this.threshDist) {
        i += (skip - 1) * reduction;
      }
    }
    // Reverse search
    for (let i = this.lastN; i >= 0; i -= reduction) {
      const point2 = archivedCoordinates[i];
      const distSq = (point[0] - point2[0]) ** 2 + (point[1] - point2[1]) ** 2;
      if (distSq < this.threshDist) {
        this.lastN = i;
        return 'green';
      } else if (distSq > multiplier * this.threshDist) {
        i -= (skip - 1) * reduction;
      }
    }
    // No match found
    return 'red';
  }

  // 16. SHOW / HIDE ELEMENTS /////////////////////////////////
  async show(id: string, action: 'block' | 'none' | 'inline' | 'flex') {
    const obj = document.getElementById(id);
    if (obj) {
      obj.style.display = action;
    }
  }

  // 19. DISPLAY AN ARCHIVED TRACK /////////////////////////
  async displayArchivedTrack() {
    // Ensure the map and archived track exist
    if (!this.map || !this.archivedTrack || !this.archivedLayer) return;
    console.log('33', this.archivedTrack);
    // Set the layer visible
    this.archivedLayer.setVisible(true);
    // Build coordinates array
    const coordinates = this.archivedTrack.features[0].geometry.coordinates;
    const num = coordinates.length;
    // Ensure coordinates are available
    if (num === 0) return;
    // Update archived feature with a new geometry and style
    this.archivedFeature.setGeometry(new LineString(coordinates));
    this.archivedFeature.setStyle(this.fs.setStrokeStyle(global.archivedColor));
    if (this.archivedMarkers.length >= 3) {
      this.archivedMarkers[0].setGeometry(new Point(coordinates[0]));
      this.archivedMarkers[0].setStyle(this.greenPin);
      this.archivedMarkers[2].setGeometry(new Point(coordinates[num - 1]));
      this.archivedMarkers[2].setStyle(this.redPin);
    }
    // Display waypoints
    const waypoints = this.archivedTrack.features[0].waypoints || []
    const multiPoint = waypoints.map((point: { longitude: any; latitude: any; }) => [point.longitude, point.latitude]);
    if (this.archivedWaypoints) {
      this.archivedWaypoints.setGeometry(new MultiPoint(multiPoint));
      this.archivedWaypoints.set('waypoints', waypoints);
      this.archivedWaypoints.setStyle(this.yellowPin);
    }
  }

  // 20. SET MAP VIEW /////////////////////////////////////////
  async setMapView(track: any) {
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
      if (this.map) {
        this.map.getView().fit(boundaries, {
          size: this.map.getSize(),
          padding: [50, 50, 50, 50],
          duration: 1000  // Optional: animation duration in milliseconds
        });
      }
    })
  }

  // 21. FIRST POINT OF THE TRACK /////////////////////////////
  async firstPoint(location: Location) {
    // Initialize current track
    this.currentTrack = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: {
          name: '',
          place: '',
          date: undefined,
          description: '',
          totalDistance: 0,
          totalElevationGain: 0,
          totalElevationLoss: 0,
          totalTime: '00:00:00',
          totalNumber: 1,
          currentAltitude: undefined,
          currentSpeed: undefined
        },
        bbox: [location.longitude, location.latitude, location.longitude, location.latitude],
        geometry: {
          type: 'LineString',
          coordinates: [
            [location.longitude, location.latitude]
          ],
          properties: {
            data: [
              {
                altitude: location.altitude,
                speed: location.speed,
                time: location.time,
                compSpeed: 0,
                distance: 0,
              }
            ],
          }
        },
        waypoints: []
      }]
    }
    // Display waypoint button
    this.show('alert', 'block');
    // Set the geometry and style for the first marker
    if (this.currentMarkers[0]) {
      this.currentMarkers[0].setGeometry(new Point(
        this.currentTrack.features[0].geometry.coordinates[0]
      ));
      this.currentMarkers[0].setStyle(this.greenPin);
    }
    // Set the geometry and style for the second marker (for tracking progress)
    const num = this.currentTrack.features[0].geometry.coordinates.length;
    if (this.currentMarkers[1]) {
      this.currentMarkers[1].setGeometry(new Point(
        this.currentTrack.features[0].geometry.coordinates[num - 1]
      ));
      this.currentMarkers[1].setStyle(this.bluePin);
    }
    // Reset the style for the third marker (if applicable)
    if (this.currentMarkers[2]) {
      this.currentMarkers[2].setStyle(undefined);
    }
    // Make the layer visible, with improved error handling
    try {
      if (this.currentLayer) {
        this.currentLayer.setVisible(true);
      }
    } catch (error) {}
    // Set current track
    //this.currentTrack.features[0].properties.totalNumber = 1;
    this.ts.setCurrentTrack(this.currentTrack);
  }

  // 22. CREATE MAP ////////////////////////////////////////
  async createMap() {
    try {
      // Current position
      var currentPosition = null;
      if (this.mapProvider != 'catalonia') currentPosition = await this.fs.getCurrentPosition(false, 1000);
      // Create layers
      await this.createLayers();
      let olLayer;
      let credits = '';
      // Select map
      switch (this.mapProvider) {
        case 'OpenStreetMap':
          credits = '© OpenStreetMap contributors';
          olLayer = new TileLayer({ source: new OSM() });
          break;
        case 'OpenTopoMap':
          credits = '© OpenStreetMap contributors, SRTM | Map style: © OpenTopoMap (CC-BY-SA)';
          olLayer = new TileLayer({ source: new XYZ({ url: 'https://{a-c}.tile.opentopomap.org/{z}/{x}/{y}.png' }) });
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
          credits = '© MapTiler © OpenStreetMap contributors'
          await this.server.openMbtiles('catalonia.mbtiles');
          const sourceResult = await this.createSource();
          if (sourceResult) olLayer = new VectorTileLayer({ source: sourceResult, style: styleFunction });
          break;
        default:
          credits = '© OpenStreetMap contributors';
          olLayer = new TileLayer({ source: new OSM() });
          break;
      }
      // set zoom levels
      var minZoom = 0;
      var maxZoom = 19;
      if (this.mapProvider == 'catalonia') {
        var minZoom = 6;
        var maxZoom = 14;
      }
      // Create view
      if (!currentPosition) currentPosition = [2, 41]
      const view = new View({ center: currentPosition, zoom: 9, minZoom: minZoom, maxZoom: maxZoom });
      //if (!currentPosition) view.setCenter([2, 41]);
      // Create map
      this.map = new Map({
        target: 'map',
        layers: ([olLayer, this.currentLayer, this.archivedLayer, this.multiLayer].filter(l => l !== undefined) as any[]),
        view: view,
        controls: [new Zoom(), new ScaleLine(), new Rotate(), new CustomControl(this.fs)],
      });
      // Display information
      this.fs.displayToast(credits);
      // Handle click events
      this.map.on('click', this.handleMapClick.bind(this));
    } catch (error) {
        console.error('Error creating map:', error);
    }
  }

  // 23. FI8LTER ALTITUDE /////////////////////////////
  async filterAltitude(track: any, final: number) {
    if (!track) return;
    // number of points
    const num = track.features[0].geometry.properties.data.length ?? 0;
    // Skip processing if final index is not the last point, or if points are fewer than lag
    if ((final != num - 1) && (num <= this.lag)) return
    // Get the track data once to simplify access
    const data = track.features[0].geometry.properties.data;
    // Loop through each point to filter altitude
    for (let i = this.altitudeFiltered + 1; i <=final; i++) {
      const start = Math.max(0, i - this.lag);
      const end = Math.min(i + this.lag, num - 1);
      // Calculate the average altitude in the window
      const sum = data.slice(start, end + 1)
        .reduce((acc: any, point: { altitude: any; }) => acc + point.altitude, 0);
      data[i].altitude = sum / (end - start + 1);
      // Calculate elevation gains/losses
      const slope = data[i].altitude - data[i - 1].altitude;
      if (slope > 0) {
        track.features[0].properties.totalElevationGain += slope;
      } else {
        track.features[0].properties.totalElevationLoss -= slope;
      }
      // Update current altitude
      track.features[0].properties.currentAltitude = data[i].altitude;
      // Update the last processed index
      this.altitudeFiltered = i;
    }
  }

  // 24. CREATE LAYERS /////////////////////////////
  async createLayers() {
    // Create pin styles
    this.greenPin = this.fs.createPinStyle('green');
    this.redPin = this.fs.createPinStyle('red');
    this.bluePin = this.fs.createPinStyle('blue');
    this.yellowPin = this.fs.createPinStyle('yellow');
    this.blackPin = this.fs.createPinStyle('black');
    // Create features to display the current track
    this.currentFeature= new Feature();
    this.currentMarkers = [new Feature(), new Feature(), new Feature()];
    // create features to hold multiple track and markers
    this.multiFeature = new Feature();
    this.multiMarker = new Feature();
    // create features to display the archived track
    this.archivedFeature = new Feature();
    this.archivedMarkers = [new Feature(), new Feature(), new Feature()];
    this.archivedWaypoints = new Feature();
    // Vector sources for current, archived and multiple tracks
    var csource = new VectorSource({ features: [this.currentFeature, ...this.currentMarkers] });
    var asource = new VectorSource({ features: [this.archivedFeature, ...this.archivedMarkers, this.archivedWaypoints] });
    var msource = new VectorSource({ features: [this.multiFeature, this.multiMarker] });
    // layers for current, archived and multiple tracks
    this.currentLayer = new VectorLayer({source: csource});
    this.archivedLayer = new VectorLayer({source: asource});
    this.multiLayer = new VectorLayer({source: msource});
  }

  // 25. DISPLAY ALL ARCHIVED TRACKS
  async displayAllTracks() {
    var key: any;
    var track: any;
    var multiLine: any = [];
    let multiPoint = [];
    let multiKey = [];
    // Loop through each item in the collection
    for (const item of global.collection) {
      key = item.date;
      track = await this.fs.storeGet(JSON.stringify(key));
      // If the track does not exist, remove the key and skip this iteration
      if (!track) {
        await this.fs.storeRem(key);
        continue;
      }
      // Extract coordinates and add to multiLine and multiPoint
      const coord = track.features[0]?.geometry?.coordinates;
      console.log('coord', coord)
      if (coord) {
        multiLine.push(coord);
        multiPoint.push(coord[0]);
        multiKey.push(item.date);
      }
    }
    // Set geometries for multiFeature and multiMarker
    this.multiFeature.setGeometry(new MultiLineString(multiLine));
    if (this.multiMarker) {
      this.multiMarker.setGeometry(new MultiPoint(multiPoint));
      this.multiMarker.set('multikey', multiKey)
      this.multiMarker.setStyle(this.greenPin);
    }
    // Apply styles to the features
    this.multiFeature.setStyle(this.fs.setStrokeStyle('black'));
    // Set visibility of multiLayer
    if (this.multiLayer) {
      this.multiLayer.setVisible(true);
    }
  }

  // 26. HANDLE MAP CLICK //////////////////////////////
  async handleMapClick(event: { coordinate: any; pixel: any }) {
    switch(global.layerVisibility) {
      case 'multi':
        if (this.map) {
          if (this.map) {
            if (this.map) {
              this.map.forEachFeatureAtPixel(event.pixel, async (feature: any) => {
                if (feature === this.multiMarker) {
                  // Retrieve clicked coordinate and find its index
                  const clickedCoordinate = feature.getGeometry().getClosestPoint(event.coordinate);
                  const multiPointCoordinates = feature.getGeometry().getCoordinates();
                  const index = multiPointCoordinates.findIndex((coord: [number, number]) =>
                    coord[0] === clickedCoordinate[0] && coord[1] === clickedCoordinate[1]
                  );
                  // Retrieve the archived track based on the index key
                  const multiKey = feature.get('multikey'); // Retrieve stored waypoints
                  const key = multiKey[index];
                  this.archivedTrack = await this.fs.storeGet(JSON.stringify(key));
                  // Display archived track details if it exists
                  if (this.archivedTrack) {
                    this.ts.setArchivedTrack(this.archivedTrack);
                    //this.extremes = await this.fs.computeExtremes(this.archivedTrack);
                    if (this.multiLayer) {
                      if (this.multiLayer) this.multiLayer.setVisible(false);
                    }
                    global.layerVisibility = 'archived';
                    await this.displayArchivedTrack();
                    await this.setMapView(this.archivedTrack);
                  }
                }
              });
            }
          }
        }
        break;
      case 'archived':
        let hit: boolean = false
        if (this.map) {
          this.map.forEachFeatureAtPixel(event.pixel, async (feature: any) => {
            if ((feature === this.archivedMarkers[0]) || (feature === this.archivedMarkers[2])) {
              hit = true;
              const index = global.collection.findIndex((item: { date: { getTime: () => number; }; }) =>
                item.date instanceof Date &&
                this.archivedTrack?.features[0]?.properties?.date instanceof Date &&
                item.date.getTime() === this.archivedTrack.features[0].properties.date.getTime()
              );
              if (index >= 0) await this.fs.editTrack(index, '#ffffbb', false)
            }
          });
        }
        if (!hit && this.map) this.map.forEachFeatureAtPixel(event.pixel, async (feature: any) => {
          if (feature === this.archivedWaypoints) {
            // Retrieve clicked coordinate and find its index
            const clickedCoordinate = feature.getGeometry().getClosestPoint(event.coordinate);
            const multiPointCoordinates = feature.getGeometry().getCoordinates();
            const index = multiPointCoordinates.findIndex((coord: [number, number]) =>
              coord[0] === clickedCoordinate[0] && coord[1] === clickedCoordinate[1]
            );
            if (index !== -1) {
              // Retrieve the waypoint data using the index
              let waypoints: Waypoint[] = feature.get('waypoints'); // Retrieve stored waypoints
              const clickedWaypoint: Waypoint = waypoints[index];
              const response: {action: string, name: string, comment: string} = await this.fs.editWaypoint(clickedWaypoint, true, false)
              if (response.action == 'ok') {
                waypoints[index].name = response.name;
                waypoints[index].comment = response.comment;
                if (this.archivedTrack) {
                  this.archivedTrack.features[0].waypoints = waypoints;
                  await this.fs.storeSet(global.key,this.archivedTrack)
                }
              }
            }
          };
        });
        break;
      case 'none':
        break;
    }
  }

  // 27. COMPUTE DISTANCES //////////////////////////////////////
  async computeDistances() {
    if (!this.currentTrack) return;
    // get coordinates and data arrays
    const coordinates = this.currentTrack.features[0].geometry.coordinates;
    const data = this.currentTrack.features[0].geometry.properties.data;
    let num = coordinates.length ?? 0;
    // Ensure data exists and has enough entries
    if (num < 2 || !data || data.length != num) return;
    // Compute distances for each point
    for (let i = this.computedDistances + 1; i < num; i++) {
      const lastPoint = coordinates[i - 1];
      const currentPoint = coordinates[i];
      // Calculate the distance
      const distance = await this.fs.computeDistance(lastPoint[0], lastPoint[1], currentPoint[0], currentPoint[1]);
      // Update the data with the new distance
      data[i].distance = data[i - 1].distance + distance;
      // Track the last computed distance index
      this.computedDistances = i;
    }
  }

  // 36. GET VALUES TO SHOW ON THE TABLE ////////////////////////////////////
  async htmlValues() {
    if (!this.currentTrack) return;
    // Get the data array
    const data = this.currentTrack.features[0].geometry.properties.data;
    // Ensure data exists and has elements
    const num = data.length ?? 0;
    if (num < 1) return;
    // Update HTML values
    this.currentTrack.features[0].properties.totalDistance = data[num - 1].distance;
    this.currentTrack.features[0].properties.totalTime = this.fs.formatMillisecondsToUTC(data[num - 1].time - data[0].time);
    this.currentTrack.features[0].properties.totalNumber = num;
    this.currentTrack.features[0].properties.currentSpeed = data[num - 1].compSpeed;
    this.ts.setCurrentTrack(this.currentTrack);
  }

  // 28. CHECK WHETHER OR NOT WE ARE ON ROUTE ///////////////////
  async checkWhetherOnRoute() {
    // Return early if essential conditions are not met
    if (!this.currentTrack || !this.archivedTrack || global.layerVisibility !== 'archived') return;
    // Store previous color for comparison
    const previousStatus = this.status;
    // Determine the current route color based on `onRoute` function
    this.status = await this.onRoute() || 'black';
    this.ts.setStatus(this.status);
    // Beep for off-route transition
    if (previousStatus === 'green' && this.status === 'red') {
      this.playDoubleBeep(1800, .3, 1, .12);
    }
    // Beep for on-route transition
    else if (previousStatus === 'red' && this.status === 'green') {
      this.playBeep(1800, .4, 1);
    }
  }

  // 38. CASE OF LOCATIONS IN WRONG ORDER
  async fixWrongOrder(location:Location) {
    if (!this.currentTrack || location.time === undefined) return;
    let num = this.currentTrack.features[0].geometry.coordinates.length ?? 0;
    // Check and fix location order by comparing timestamps
    for (let i = num - 1; i > 0; i--) {
      const previousTime = this.currentTrack.features[0]?.geometry?.properties?.data[i]?.time;
      // If the previous time is greater than the new time, remove the previous entry
      if (previousTime > location.time) {
        this.currentTrack.features[0].geometry.coordinates.pop();
        this.currentTrack.features[0].geometry.properties.data.pop();
        this.altitudeFiltered = Math.max(0, this.altitudeFiltered - 1);
        this.speedFiltered = Math.max(0, this.speedFiltered - 1);
        this.averagedSpeed = Math.max(0, this.averagedSpeed - 1);
        this.computedDistances = Math.max(0, this.computedDistances - 1);
        this.ts.setCurrentTrack(this.currentTrack);
      } else {
        break;
      }
    }
  }

  // 40. ON LEAVE ////////////////////////////
  async ionViewWillLeave() {
    global.archivedPresent = !!this.archivedTrack;
  }

  // 41. PLAY A BEEP /////////////////////////////////////
  async playBeep(freq: number, time: number, volume: number) {
    // Initialize audio context if not already created
    if (!this.audioCtx) {
      this.audioCtx = new window.AudioContext;
    }
    const oscillator = this.audioCtx.createOscillator();
    const gainNode =this.audioCtx.createGain();  // Create a gain node
    // Configure oscillator
    oscillator.type = 'sine'; // Other waveforms: 'square', 'sawtooth', 'triangle'
    oscillator.frequency.setValueAtTime(freq, this.audioCtx.currentTime);  // Set frequency
    // Set initial gain (volume)
    gainNode.gain.setValueAtTime(volume, this.audioCtx.currentTime);       // Set initial volume
    // Connect nodes
    oscillator.connect(gainNode);
    gainNode.connect(this.audioCtx.destination);
    // Start and stop the oscillator after the specified duration
    oscillator.start();
    console.log('beeping')
    oscillator.stop(this.audioCtx.currentTime + time);
    // Clean up after the sound has finished
    oscillator.onended = async () => {
      oscillator.disconnect();
      gainNode.disconnect();
    };
  }

  // 42. PLAY A DOUBLE BEEP
  async playDoubleBeep(freq: number, time: number, volume: number, gap: number) {
    // Initialize audio context if not already created
    if (!this.audioCtx) {
      this.audioCtx = new window.AudioContext();
    }
    const oscillator = this.audioCtx.createOscillator();
    const gainNode = this.audioCtx.createGain();
    // Configure oscillator
    oscillator.type = 'sine'; // Other waveforms: 'square', 'sawtooth', 'triangle'
    oscillator.frequency.setValueAtTime(freq, this.audioCtx.currentTime); // Set frequency
    // Connect nodes
    oscillator.connect(gainNode);
    gainNode.connect(this.audioCtx.destination);
    const now = this.audioCtx.currentTime;
    // Double beep timing
    gainNode.gain.setValueAtTime(0, now); // Start with volume off
    gainNode.gain.linearRampToValueAtTime(volume, now + 0.01); // Ramp up quickly for first beep
    gainNode.gain.linearRampToValueAtTime(0, now + time); // Ramp down after first beep
    gainNode.gain.setValueAtTime(0, now + time + gap); // Silence for gap
    gainNode.gain.linearRampToValueAtTime(volume, now + time + gap + 0.01); // Ramp up for second beep
    gainNode.gain.linearRampToValueAtTime(0, now + time + gap + time); // Ramp down after second beep
    // Start and stop oscillator
    oscillator.start(now);
    oscillator.stop(now + time + gap + time); // Total duration: first beep + gap + second beep
    // Clean up after the sound has finished
    oscillator.onended = async () => {
      oscillator.disconnect();
      gainNode.disconnect();
    };
  }

  // 43. PARSE CONTENT OF A GPX FILE ////////////////////////
  async parseGpx(gpxText: string) {
    let waypoints: Waypoint[] = [];
    let track: Track = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: {
          name: '',
          place: '',
          date: undefined,
          description: '',
          totalDistance: 0,
          totalElevationGain: 0,
          totalElevationLoss: 0,
          totalTime: '00:00:00',
          totalNumber: 0,
          currentAltitude: undefined,
          currentSpeed: undefined
        },
        bbox: undefined,
        geometry: {
          type: 'LineString',
          coordinates: [],
          properties: {
            data: [],
          }
        },
        waypoints: []
      }]
    }
    // Parse GPX data
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(gpxText, 'application/xml');
    // Validate XML parsing
    if (xmlDoc.getElementsByTagName('parsererror').length > 0) {
      throw new Error('Invalid GPX file format.');
    }
    // Parse waypoints with validation
    const wptNodes = xmlDoc.getElementsByTagName("wpt");
    for (const wpt of Array.from(wptNodes)) {
      const latStr = wpt.getAttribute("lat");
      const lonStr = wpt.getAttribute("lon");
      if (!latStr || !lonStr || isNaN(Number(latStr)) || isNaN(Number(lonStr))) continue;
      const latitude = parseFloat(latStr);
      const longitude = parseFloat(lonStr);
      const eleNode = wpt.getElementsByTagName("ele")[0];
      const altitude = eleNode && !isNaN(Number(eleNode.textContent ?? '')) ? parseFloat(eleNode.textContent ?? '0') : 0;
      // Sanitize name and comment using the service's sanitize method
      const name = this.fs['sanitize']?.(wpt.getElementsByTagName("name")[0]?.textContent || '') || undefined;
      let comment = this.fs['sanitize']?.(wpt.getElementsByTagName("cmt")[0]?.textContent || '') || undefined;
      if (name == comment) comment = undefined;
      waypoints.push({ latitude, longitude, altitude, name, comment });
    }
    if (track.features[0] && track.features[0].waypoints) track.features[0].waypoints = waypoints;
    // Extract tracks
    const tracks = xmlDoc.getElementsByTagName('trk');
    if (tracks.length === 0) return;
    // Extract track segments
    const trackSegments = tracks[0].getElementsByTagName('trkseg');
    if (trackSegments.length === 0) return;
    const trackSegment = trackSegments[0];
    // Extract points
    const trackPoints = trackSegment.getElementsByTagName('trkpt');
    // Track name (sanitize)
    track.features[0].properties.name = this.fs['sanitize']?.(tracks[0].getElementsByTagName('name')[0]?.textContent || 'No Name') || 'No Name';
    // Track comment (sanitize)
    track.features[0].properties.description = this.fs['sanitize']?.(tracks[0].getElementsByTagName('cmt')[0]?.innerHTML || '') || '';
    // Initialize distance
    let distance = 0;
    // Initialize bounding box values
    let lonMin = Infinity, latMin = Infinity;
    let lonMax = -Infinity, latMax = -Infinity;
    // Loop on points
    for (let k = 0; k < trackPoints.length; k++) {
      const lat = parseFloat(trackPoints[k].getAttribute('lat') || '');
      const lon = parseFloat(trackPoints[k].getAttribute('lon') || '');
      const ele = parseFloat(trackPoints[k].getElementsByTagName('ele')[0]?.textContent || '0');
      const time = trackPoints[k].getElementsByTagName('time')[0]?.textContent;
      if (isNaN(lat) || isNaN(lon)) continue;
      // Update bounding box
      lonMin = Math.min(lonMin, lon);
      latMin = Math.min(latMin, lat);
      lonMax = Math.max(lonMax, lon);
      latMax = Math.max(latMax, lat);
      // Add coordinates
      track.features[0].geometry.coordinates.push([lon, lat]);
      const num = track.features[0].geometry.coordinates.length;
      // Handle distance
      if (k > 0) {
        const prevCoord = track.features[0].geometry.coordinates[k - 1];
        distance += await this.fs.computeDistance(prevCoord[0], prevCoord[1], lon, lat);
      }
      // Handle elevation
      let alt: number | undefined;
      if (ele) alt = +ele;
      else alt = undefined;
      if (alt === 0 && num > 1) alt = track.features[0].geometry.properties.data[num - 2].altitude;
      if (!alt) alt = 0;
      // Handle time
      const locTime = time ? new Date(time).getTime() : 0;
      // Add data
      if (!alt) alt = 0;
      track.features[0].geometry.properties.data.push({
        altitude: alt,
        speed: 0,
        time: locTime,
        compSpeed: 0,
        distance: distance,
      });
      track.features[0].bbox = [lonMin, latMin, lonMax, latMax];
    }
    // Fill values
    var num: number = track.features[0].geometry.properties.data.length ?? 0;
    track.features[0].properties.totalDistance = distance;
    track.features[0].properties.totalTime = this.fs.formatMillisecondsToUTC(track.features[0].geometry.properties.data[num - 1].time -
      track.features[0].geometry.properties.data[0].time);
    track.features[0].properties.totalNumber = num;
    // Speed filter
    try {
      this.fs.filterSpeed(track.features[0].geometry.properties.data, num - 1);
    }
    catch {}
    // Altitude filter
    try{
      track.features[0].properties.totalElevationGain = 0;
      track.features[0].properties.totalElevationLoss = 0;
      await this.filterAltitude(track, num-1)
      this.altitudeFiltered = 0;
    }
    catch {}
    // speed filter
    track.features[0].geometry.properties.data = await this.fs.filterSpeed(track.features[0].geometry.properties.data, 1);
    // Save imported track
    const date = new Date(track.features[0].geometry.properties.data[num - 1]?.time || Date.now());
    track.features[0].properties.date = date;
    this.archivedTrack = track;
    const dateKey = JSON.stringify(date);
    const existing = await this.fs.storeGet(dateKey);
    if (existing) return;
    await this.fs.storeSet(dateKey, track);
    // Track definition for global collection
    const trackDef = {
      name: track.features[0].properties.name,
      date: track.features[0].properties.date,
      place: track.features[0].properties.place,
      description: track.features[0].properties.description,
      isChecked: true
    };
    // add new track definition and save collection
    global.collection.push(trackDef);
    await this.fs.storeSet('collection', global.collection);
    console.log('collection', global.collection)
  }

  // 44. PROCESS FILE AFTER TAPPING ON IT /////////////
  async processUrl(data: any) {
    if (data.url) {
      try {
        // Read file
        const fileContent = await Filesystem.readFile({
          path: data.url,
          encoding: Encoding.UTF8,
        });
        // If we read a string,
        if (typeof fileContent.data === 'string') {
          // Parse GPX file content
          await this.parseGpx(fileContent.data);
          const toast = ["El fitxer s'ha importat correctament","El fichero se ha importado correctamente",'File uploaded successfully']
          this.fs.displayToast(toast[global.languageIndex]);
        }
        else {
          console.log('not a string')
          const toast = ["No s'ha importat cap fitxer","No se ha importado ningún fichero", 'No file uploaded']
          this.fs.displayToast(toast[global.languageIndex]);
        }
      } catch (error) {
        const toast = ["No s'ha pogut importar el fitxer", 'No se ha podido importar el fichero','Failed to upload file']
        this.fs.displayToast(toast[global.languageIndex]);
      }
    } else {
      const toast = ["No s'ha seleccionat cap fitxer", 'No se ha seleccionado ningún fichero','No file selected']
      this.fs.displayToast(toast[global.languageIndex]);
    }
  }

  // 45. FOREGROUND TASK ////////////////////////
  async foregroundTask(location:Location) {
    // fill the track
    console.log('1',this.currentTrack)
    const locationNew: boolean = await this.buildGeoJson(location);
    console.log('2',this.currentTrack)
    // no new point..
    if (!locationNew) return;
    // new point..
    const num = this.currentTrack?.features[0].geometry.coordinates.length ?? 0;
    // filter altitude
    //this.debouncedFilterAltitude(this.currentTrack, num - this.lag - 1);
    await this.filterAltitude(this.currentTrack, num - this.lag - 1);
    console.log('3',this.currentTrack)
    // compute distances
    //this.debouncedComputeDistances();
    await this.computeDistances();
    console.log('4',this.currentTrack)
    // filter speed
    if (this.currentTrack) {
      this.currentTrack.features[0].geometry.properties.data = await this.fs.filterSpeed(
        this.currentTrack.features[0].geometry.properties.data,
        this.speedFiltered + 1
      );
    }
    console.log('5',this.currentTrack)
    this.speedFiltered = num - 1;
    // html values
    await this.htmlValues();
    console.log('6',this.currentTrack)
    // display the current track
    //this.debouncedDisplayCurrentTrack();
    await this.displayCurrentTrack();
    // Ensure UI updates are reflected
    this.zone.run(() => {
      this.cd.detectChanges();
    });
    console.log('Foreground',this.currentTrack?.features[0].properties.totalNumber || 0, 'points. Process completed')
  }

  // 46. BACKGROUND TASK /////////////////////////////////////
  async backgroundTask(location: Location) {
    const taskId = await BackgroundTask.beforeExit(async () => {
      try {
        // Perform the task
        const locationNew: boolean = await this.buildGeoJson(location);
      } catch (error) {
        console.error('Error in background task:', error);
      }
      finally {
        //Always call finish
      BackgroundTask.finish({ taskId });
      }
    });
  }

  // 47. START BEEP INTERVAL /////////////////////
  startBeepInterval() {
    // Clear any existing interval to avoid duplicates
    if (this.beepInterval) {
      clearInterval(this.beepInterval);
    }
    // Set an interval to play the beep every 120 seconds
    this.beepInterval = setInterval(() => {
      this.playBeep(600, .001, .001);
    }, 120000); // 120000 milliseconds = 120 seconds
  }

  // 48. STOP BEEP INTERVAL ////////////////////////////
  stopBeepInterval() {
    if (this.beepInterval) {
      clearInterval(this.beepInterval);
      this.beepInterval = null; // Reset the interval reference
    }
  }

  // 49. CHANGE MAP PROVIDER /////////////////////
  async changeMapProvider() {
    const previousProvider = this.mapProvider;
    console.log('Previous map provider: ', previousProvider)
    let credits = '';
    this.mapProvider = await this.fs.check(this.mapProvider, 'mapProvider');
    console.log('Current map provider: ', this.mapProvider)
    if (previousProvider === this.mapProvider) return;
    console.log('Previous map provider: ', previousProvider, ' changes to: ', this.mapProvider)
    // Find and remove the existing base layer
    if (!this.map) return;
    var olLayers = this.map.getLayers();
    let newBaseLayer = null;
    // Determine new base layer
    if (this.mapProvider === 'OpenStreetMap') {
      credits = '© OpenStreetMap contributors';
      newBaseLayer = new TileLayer({ source: new OSM() });
    } else if (this.mapProvider === 'OpenTopoMap') {
      credits = '© OpenStreetMap contributors, SRTM | Map style: © OpenTopoMap (CC-BY-SA)';
      newBaseLayer = new TileLayer({
        source: new XYZ({ url: 'https://{a-c}.tile.opentopomap.org/{z}/{x}/{y}.png' }),
      });
    } else if (this.mapProvider === 'ICGC') {
      credits = 'Institut Cartogràfic i Geològic de Catalunya';
      newBaseLayer = new TileLayer({
        source: new XYZ({ url: 'https://tiles.icgc.cat/xyz/mtn1000m/{z}/{x}/{y}.jpeg' }),
      });
    } else if (this.mapProvider === 'IGN') {
      credits = 'Instituto Geográfico Nacional (IGN)';
      newBaseLayer = new TileLayer({
        source: new XYZ({
          url: 'https://www.ign.es/wmts/mapa-raster?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=MTN&STYLE=default&TILEMATRIXSET=GoogleMapsCompatible&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image/jpeg',
        }),
      });
    } else if (this.mapProvider === 'catalonia') {
      if (this.map) {
        this.map.getView().setCenter([2, 41]);
        this.map.getView().setZoom(8);
      }
      // Load vector tiles for Catalonia
      credits = '© MapTiler © OpenStreetMap contributors';
      await this.server.openMbtiles('catalonia.mbtiles');
      console.log('Catalonia MBTiles database opened');
      const sourceResult = await this.createSource();
      if (sourceResult) newBaseLayer = new VectorTileLayer({
        source: sourceResult,
        style: styleFunction
      });
    }
    // If newBaseLayer has been created, replace the old base layer with it
    if (newBaseLayer && this.map) {
      this.map.removeLayer(olLayers.item(0));
      this.map.getLayers().insertAt(0, newBaseLayer);
    }
    else {
      console.log('The new base layer has not been created or map is undefined');
      return;
    }
    // Apply the fade-in effect
    const mapContainer = document.getElementById('map');
    if (mapContainer) {
        mapContainer.classList.add('fade-in');
        setTimeout(() => mapContainer.classList.remove('fade-in'), 500);
    }
    // Report change
    await this.fs.displayToast(`${credits}`);
    // Change max / min zoom
    var minZoom = 0;
    var maxZoom = 19;
    if (this.mapProvider == 'Catalonia') {
      var minZoom = 6;
      var maxZoom = 14;
    }
    this.map.getView().setMinZoom(minZoom);
    this.map.getView().setMaxZoom(maxZoom);
  }

  // 50. DETERMINE LANGUAGE //////////////////
  async determineLanguage() {
    try {
      const info = await Device.getLanguageCode();
      let deviceLanguage = info.value.split('-')[0]; // Extract the base language code
      console.log('Device Language:', deviceLanguage);
      // Check if there is a replacement
      deviceLanguage = await this.fs.check(deviceLanguage, 'language');
      // Map the device language and assign index
      if (deviceLanguage === 'ca') global.languageIndex = 0
      else if (deviceLanguage === 'es') global.languageIndex = 1
      else global.languageIndex = 2;
      global.languageCode = deviceLanguage
    } catch (error) {
      console.error('Error determining language:', error);
    }
  }

  // 51. DETERMINE COLORS ///////////////////////////////////////
  async determineColors() {
    try {
      global.archivedColor = await this.fs.check(global.archivedColor, 'archivedColor');
      global.currentColor = await this.fs.check(global.currentColor, 'currentColor');
    } catch (error) {
      console.error('Error determining color:', error);
    }
  }

  // 52. ADD WAYPOINT ////////////////////////////////////
  async waypoint() {
    if (!this.currentTrack) return;
    const num: number = this.currentTrack.features[0].geometry.coordinates.length
    let point = this.currentTrack.features[0].geometry.coordinates[num-1];
    const addressObservable = this.nominatimService.reverseGeocode(point[1], point[0]);
    const address = addressObservable ? await lastValueFrom(addressObservable) : { name: '', address_name: '' };
    console.log(address)
    let waypoint: Waypoint = {
      longitude: point[0],
      latitude: point[1],
      altitude: num - 1, // At this moment, this value is the position of the point in the track
      name: (address && 'name' in address ? address.name : (address as any)?.address_name ?? ''),
      //comment: address.display_name
      comment: ''
    }
    const response: {action: string, name: string, comment: string} = await this.fs.editWaypoint(waypoint, false, true)
    if (response.action == 'ok') {
      waypoint.name = response.name,
      waypoint.comment = response.comment
      this.currentTrack.features[0].waypoints?.push(waypoint);
      this.ts.setCurrentTrack(this.currentTrack);
      // Toast
      const toast = ["S'ha afegit el punt de pas",'Se ha añadido el punto de paso','The waypoint has been added']
      this.fs.displayToast(toast[global.languageIndex]);
    }
  }

  // 53. SET WAYPOINT ALTITUDE ////////////////////////////////////////
  async setWaypointAltitude() {
    if (!this.currentTrack) return;
    // Retrieve waypoints
    const waypoints: Waypoint[] = this.currentTrack.features[0].waypoints || [];
    for (const wp of waypoints) {
      if (wp.altitude != null && wp.altitude >= 0) wp.altitude = this.currentTrack.features[0].geometry.properties.data[wp.altitude].altitude
    }
    this.ts.setCurrentTrack(this.currentTrack);
    console.log(this.currentTrack)
  }

  // 54. SEARCH SITE /////////////////////////////////////////
  async search() {
    global.comingFrom = 'search';
    // Create modal
    const modal = await this.modalController.create({
      component: SearchModalComponent,
      cssClass: ['modal-class','yellow-class'] ,
      backdropDismiss: true, // Allow dismissal by tapping the backdrop
    });
    // Present modal
    await modal.present();
    // Receive data after modal dismiss
    const { data } = await modal.onDidDismiss();
    if (data) {
      const bbox = data.location.boundingbox;
      // Destructure the box array and assign the values
      const [minLat, maxLat, minLon, maxLon] = bbox.map(Number); //
      // Define padding
      const padding = Math.max(Math.max(maxLat - minLat, maxLon - minLon) / 10, 0.005);
      // Apply padding
      const extent = [minLon - padding, minLat - padding, maxLon + padding, maxLat + padding]; // OpenLayers extent
      // Parse GeoJSON into OpenLayers features
      const features = new GeoJSON().readFeatures(data.location.geojson);
      console.log(features)
      await this.addSearchLayer(features[0])
      if (this.map) {
        this.map.getView().fit(extent);
      }
    };
  }

  // 55. SEARCH ROUTE /////////////////////////////////////////////
  async guide() {
    global.comingFrom = 'guide';
    // Create modal
    const modal = await this.modalController.create({
      component: SearchModalComponent,
      cssClass: ['modal-class','yellow-class'] ,
      backdropDismiss: true, // Allow dismissal by tapping the backdrop
    });
    // Present modal
    await modal.present();
    // Receive data after modal dismiss
    const { data } = await modal.onDidDismiss();
    // Build track
    const date = new Date();
    var trackName = ''
    if (data) {
      console.log(data.response)
      trackName = data.response.trackName;
      var slopes = {gain: NaN, loss: NaN}
      // Coordinates
      const rawCoordinates = data.response.features[0].geometry.coordinates;
      // Compute distances
      const distances: number[] = await this.computeCumulativeDistances(rawCoordinates)
      console.log('distances', distances)
      // Compute times
      const times: number[] = await this.createTimes(data, date, distances);
      console.log(times);
      // Get altitudes and compute elevation gain and loss
      var elevations: number[] = [];
      //var altSlopes: any = await this.getAltitudesFromMap(rawCoordinates)
      await this.getAltitudes(rawCoordinates).then(async altitudes => {
        console.log('altitudes', altitudes)
        elevations = altitudes;
        slopes = await this.computeElevationGainAndLoss(altitudes)
        console.log('slopes', slopes)
      }).catch(err => {
        console.error('Error:', err);
      });
      // compute speed
      const speed = (data.response.features[0].properties.summary.distance / data.response.features[0].properties.summary.duration) * 3.6;
      const rawProperties: Data[] = await this.fillProperties(distances, elevations, times, speed);
      // Increase the number of coordinates
      const num = rawCoordinates.length;
      const result = await this.fs.adjustCoordinatesAndProperties(rawCoordinates, rawProperties, 0.025);
      if (result) {
        const num = result.newCoordinates.length;
        this.archivedTrack = {
          type: 'FeatureCollection',
          features: [{
            type: 'Feature',
            properties: {
              name: trackName,
              place: '',
              date: date,
              description: '',
              totalDistance: data.response.features[0].properties.summary.distance / 1000,
              totalElevationGain: slopes.gain,
              totalElevationLoss: slopes.loss,
              totalTime: this.fs.formatMillisecondsToUTC(data.response.features[0].properties.summary.duration * 1000,),
              totalNumber: num,
              currentAltitude: undefined,
              currentSpeed: undefined
            },
            bbox: data.response.features[0].bbox,
            geometry: {
              type: 'LineString',
              coordinates: result.newCoordinates,
              properties: { data: result.newProperties }
            },
            waypoints: []
          }]
        };
      }
    }
    console.log('route', this.archivedTrack)
    if (this.archivedTrack) {
      await this.fs.uncheckAll();
      this.ts.setArchivedTrack(this.archivedTrack);
      if (this.multiLayer) this.multiLayer.setVisible(false);
      if (this.archivedLayer) this.archivedLayer.setVisible(true);  // No need for await
      global.layerVisibility = 'archived';
      await this.displayArchivedTrack();
      await this.setMapView(this.archivedTrack);
      this.archivedTrack.features[0].properties.date = date;
      const dateKey = JSON.stringify(date);
      await this.fs.storeSet(dateKey, this.archivedTrack);
      // Track definition for global collection
      const trackDef = {
        name: trackName,
        date: date,
        place: '',
        description: '',
        isChecked: false
      };
      // add new track definition and save collection
      global.collection.push(trackDef);
    }
  }

  // 57. ADD LAYER TO DISPLAY SITE /////////////////////////
  async addSearchLayer(feature: Feature<Geometry>) {
    if (!this.map) return;
    // Remove previous search
    await this.removeLayer('searchLayerId');
    global.presentSearch = false;
    global.removeSearch = false;
    // Style function to differentiate geometry types
    const styleFunction = (featureLike: FeatureLike) => {
      const geometryType = featureLike.getGeometry()?.getType();
      if (geometryType === 'Point') {
        return this.blackPin;
      } else if (geometryType === 'Polygon' || geometryType === 'MultiPolygon') {
        return new Style({
          stroke: new Stroke({
            color: 'black', // Black outline
            width: 2, // Adjust the width if needed
          }),
          fill: new Fill({
            color: 'rgba(128, 128, 128, 0.5)', // Pale grey fill (50% opacity)
          }),
        });
      } else {
        return this.fs.setStrokeStyle('black'); // Black line for other geometries
      }
    };
    // Create a vector source with the feature
    const searchLayer = new VectorLayer({
      source: new VectorSource({ features: [feature] }),
      style: styleFunction ,
    });
    // Assign a unique ID to the layer and add it to the map
    searchLayer.set('id', 'searchLayerId');
    this.map.addLayer(searchLayer);
    global.presentSearch = true;
  }

  // 58. REMOVE LAYER ////////////////////////////////////
  async removeLayer(id: string) {
    // Remove the existing search layer if it exists
    if (!this.map) return;
    const existingLayer = this.map.getLayers().getArray().find((layer: { get: (arg0: string) => string; }) => layer.get('id') === id);
    if (existingLayer) {
      this.map.removeLayer(existingLayer);
    }
  }

  async morningTask() {
    // Run updates outside of Angular's zone to avoid change detection overhead
    this.zone.runOutsideAngular(async () => {
      try{
        // Filter altitude data
        const num = this.currentTrack?.features[0].geometry.coordinates.length ?? 0;
        await this.filterAltitude(this.currentTrack, num - this.lag - 1);
        // compute distances
        await this.computeDistances();
        // Filter speed data
        if (this.currentTrack) this.currentTrack.features[0].geometry.properties.data = await this.fs.filterSpeed(
          this.currentTrack.features[0].geometry.properties.data,
          this.speedFiltered + 1
        );
        this.speedFiltered = num - 1;
        // Update HTML values
        await this.htmlValues();
        // display current track
        await this.displayCurrentTrack();
        // Trigger Angular's change detection
        this.cd.detectChanges();
      } catch (error) {
        console.error('Error during foreground transition processing:', error);
      }
    });
  }

  async createSource() {
    try {
      // Create vector tile source
      return new VectorTileSource({
        format: new MVT(),
        tileClass: VectorTile,
        tileGrid: new TileGrid({
          extent: [-20037508.34, -20037508.34, 20037508.34, 20037508.34],
          resolutions: Array.from({ length: 20 }, (_, z) => 156543.03392804097 / Math.pow(2, z)),
          tileSize: [256, 256],
        }),
        // Tile load function
        tileLoadFunction: async (tile) => {
          const vectorTile = tile as VectorTile<RenderFeature>;
          const [z, x, y] = vectorTile.getTileCoord();
          try {
            // Get vector tile
            const rawData = await this.server.getVectorTile(z, x, y);
            if (!rawData?.byteLength) {
              vectorTile.setLoader(() => {});
              vectorTile.setState(TileState.EMPTY);
              return;
            }
            // Decompress
            const decompressed = pako.inflate(new Uint8Array(rawData));
            // Read features
            const features = new MVT().readFeatures(decompressed, {
              extent: vectorTile.extent ?? [-20037508.34, -20037508.34, 20037508.34, 20037508.34],
              featureProjection: 'EPSG:3857',
            });
            // Set features to vector tile
            vectorTile.setFeatures(features);
          } catch (error) {
            vectorTile.setState(TileState.ERROR);
          }
        },
        tileUrlFunction: ([z, x, y]) => `${z}/${x}/${y}`,
      });
    } catch (e) {
      console.error('Error in createSource:', e);
      return null;
    }
  }

  // COMPUTE ALTITUDES
  async getAltitudes(rawCoordinates: [number, number][]): Promise<number[]> {
    const requestBody = {
      locations: rawCoordinates.map(([lon, lat]) => ({
        latitude: lat,
        longitude: lon
      }))
    };
    try {
      const response = await fetch('https://api.open-elevation.com/api/v1/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });
      if (!response.ok) {
        // Optionally, provide user feedback here
        this.fs.displayToast('Failed to fetch elevation data.');
        return [];
      }
      const data = await response.json();
      return data.results.map((result: any) => result.elevation);
    } catch (error) {
      // Handle network or parsing errors gracefully
      this.fs.displayToast('Error retrieving elevation data.');
      return [];
    }
  }

  // COMPUTE ELEVATION GAIN AND LOSS
  async computeElevationGainAndLoss(altitudes: number[]): Promise<{ gain: number; loss: number; }> {
    let gain = 0;
    let loss = 0;
    for (let i = 1; i < altitudes.length; i++) {
      const diff = altitudes[i] - altitudes[i - 1];
      if (diff > 0) {
        gain += diff;
      } else if (diff < 0) {
        loss -= diff; // Subtracting a negative to get positive loss
      }
    }
    return { gain, loss };
  }

  // COMPUTE CYUMULATIVE DISTANCES
  async computeCumulativeDistances(
    rawCoordinates: [number, number][]
  ): Promise<number[]> {
    const distances: number[] = [0];
    for (let i = 1; i < rawCoordinates.length; i++) {
      const [lon1, lat1] = rawCoordinates[i - 1];
      const [lon2, lat2] = rawCoordinates[i];
      const segmentDistance = await this.fs.computeDistance(lon1, lat1, lon2, lat2);
      const cumulativeDistance = distances[i - 1] + segmentDistance;
      distances.push(cumulativeDistance);
    }
    return distances;
  }

  async fillProperties(distances: number[] | undefined, altitudes: number[] | undefined, times: number[], speed: number): Promise<Data[] > {
    if (!distances || !altitudes || distances.length !== altitudes.length) {
      return [];
    }
    const result: Data[] = distances.map((distance, i) => ({
      altitude: altitudes[i],
      speed: speed,
      time: times[i],
      compSpeed: speed,
      distance: distance,
    }));
    return result;
  }

  async createTimes(data: any, date: Date, distances: number[]): Promise<number[]> {
    const totalDistance = data.response.features[0].properties.summary.distance;
    const totalDuration = data.response.features[0].properties.summary.duration * 1000; // in ms
    const endTime = date.getTime(); // in ms
    const startTime = endTime - totalDuration;
      return distances.map(d => {
      const ratio = d / totalDistance;
      const timeOffset = ratio * totalDuration;
      return Math.round(startTime + timeOffset); // in ms
    });
  }

  async getAltitudesFromMap(coordinates: [number, number][] ) {
    await this.getAltitudes(coordinates).then(async altitudes => {
      var slopes = await this.computeElevationGainAndLoss(altitudes)
      return {altitudes: altitudes, slopes: slopes}
    }).catch(err => {
      console.error('Error:', err);
      return {altitudes: null, slopes: null}
    });
  }

}
