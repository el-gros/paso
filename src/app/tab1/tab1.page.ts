/**
Main component for the first tab of the application, handling map display, GPS tracking, track management, and user interactions.
Integrates map rendering, real-time location tracking, GPX import/export, audio alerts, and multilingual support.
Provides methods for starting/stopping tracking, managing tracks and waypoints, handling map events, and updating UI state.
*/

import { Component, NgZone, Injectable, OnDestroy } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { CommonModule, DecimalPipe, DatePipe } from '@angular/common';
import { PluginListenerHandle, registerPlugin } from "@capacitor/core";
import { Storage } from '@ionic/storage-angular';
import { FormsModule } from '@angular/forms';
import { CUSTOM_ELEMENTS_SCHEMA, ChangeDetectorRef } from '@angular/core';
import { register } from 'swiper/element/bundle';
import Map from 'ol/Map';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import LineString from 'ol/geom/LineString';
import { Location, StyleJSON, Track, TrackDefinition, Data, Waypoint } from '../../globald';
import { FunctionsService } from '../services/functions.service';
import { MapService } from '../services/map.service';
import { TrackService } from '../services/track.service';
import { ServerService } from '../services/server.service';
import { global } from '../../environments/environment';
const BackgroundGeolocation: any = registerPlugin("BackgroundGeolocation");
import { Circle as CircleStyle, Fill, Stroke, Icon, Style, Circle } from 'ol/style';
import { useGeographic } from 'ol/proj.js';
import { App } from '@capacitor/app';
import { Geometry, MultiLineString, MultiPoint } from 'ol/geom';
import { ForegroundService } from '@capawesome-team/capacitor-android-foreground-service';
import GeoJSON from 'ol/format/GeoJSON';
import VectorTileSource from 'ol/source/VectorTile';
import MVT from 'ol/format/MVT';
import { TileGrid } from 'ol/tilegrid';
import { Filesystem, Directory, Encoding, ReadFileResult } from '@capacitor/filesystem';
import { BackgroundTask } from '@capawesome/capacitor-background-task';
import { ModalController } from '@ionic/angular';
import { LocalNotifications } from '@capacitor/local-notifications';
import { EditModalComponent } from '../edit-modal/edit-modal.component';
import { SearchModalComponent } from '../search-modal/search-modal.component';
import { NominatimService } from '../services/nominatim.service';
import { lastValueFrom } from 'rxjs';
import { FeatureLike } from 'ol/Feature';
import VectorTile from 'ol/VectorTile';
import RenderFeature from 'ol/render/Feature';
import TileState from 'ol/TileState';
import pako from 'pako';
import { LanguageService } from '../services/language.service';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
const vectorFormat = new MVT();
useGeographic();
register();

@Component({
    selector: 'app-tab1',
    templateUrl: 'tab1.page.html',
    styleUrls: ['tab1.page.scss'],
    imports: [IonicModule, CommonModule, FormsModule, TranslateModule ],
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
  status: 'black' | 'red' | 'green' = 'black'
  audioCtx: AudioContext | null = null;
  beepInterval: any;
  language: 'ca' | 'es' | 'en' | 'other' = 'other';
  popText: [string, string, number] | undefined = undefined;
  intervalId: any = null;
  appStateListener?: PluginListenerHandle;
  greenPin?: Style;
  redPin?: Style;
  bluePin?: Style;
  yellowPin?: Style;
  blackPin?: Style;
  selectedAltitude: string = 'GPS'; // Default altitude method
  selectedAudioAlert: string = 'on'; // Default audio alert

  get state(): string { return global.state; }
  get cancelButton() {
    return {
      text: this.translate.instant('SETTINGS.CANCEL'),
      role: 'cancel',
      cssClass: 'alert-cancel-button',
    };
  }

  constructor(
    public fs: FunctionsService,
    public mapService: MapService,
    public ts: TrackService,
    public server: ServerService,
    public storage: Storage,
    private zone: NgZone,
    private cd: ChangeDetectorRef,
    private modalController: ModalController,
    private nominatimService: NominatimService,
    private languageService: LanguageService,
    private translate: TranslateService
  ) {
  }

  /* FUNCTIONS

  1. ngOnInit
  2. listenToAppStateChanges
  3. addFileListener
  4. ionViewDidEnter
  5. startTracking
  6. removeTrack
  7. stopTracking
  8. confirm
  9. setTrackDetails
  10. showValidationAlert
  11. saveFile
  12. buildGeoJson
  13. onRoute
  14. show
  15. onDestroy
  16. displayArchivedTrack
  17. firstPoint

  22. createMap
  23. filterAltitude
  24. createLayers
  25. displayAllTracks
  26. handleMapClick()

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

  51. determineColors()
  52. waypoint()
  53. setWaypointAltitude()
  54. search()
  55. uide()

  57. addSearchLayer()

  */

  // 1. ON INIT ////////////////////////////////

  async ngOnInit() {
    try {
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
      //this.determineLanguage();
      this.languageService.determineLanguage();
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

  // 3. LISTENING FOR OPEN EVENTS

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
          this.mapService.setMapView(this.map, this.archivedTrack);
        }
      }
    });
  }

  // 4. ION VIEW DID ENTER

  async ionViewDidEnter() {
    while (!global.ngOnInitFinished) {
      await new Promise(resolve => setTimeout(resolve, 50)); // Wait until ngOnInit is done
    }
    try {
      // Remove search
      if (global.removeSearch) {
        await this.mapService.removeLayer(this.map, 'searchLayerId');
        global.presentSearch = false;
        global.removeSearch = false;
      }
      // retrieve collection
      if (global.collection.length <= 0) global.collection = await this.fs.storeGet('collection') || [];
      // change map provider
      await this.changeMapProvider();
      // Audio alert
      this.selectedAudioAlert = await this.fs.check(this.selectedAudioAlert, 'audioAlert');
      global.audioAlert = this.selectedAudioAlert;
      // Altitude method
      this.selectedAltitude = await this.fs.check(this.selectedAltitude, 'altitude');
      // Display current track (updates color)
      if (this.currentTrack && this.map) await this.mapService.displayCurrentTrack(this.map, this.currentTrack, this.currentFeature, this.currentMarkers);
      // archived visible
      if (global.layerVisibility == 'archived') {
        // retrieve archived track
        this.archivedTrack = await this.fs.retrieveTrack() ?? this.archivedTrack;
        if (this.archivedTrack) {
          console.log(this.archivedTrack)
          this.ts.setArchivedTrack(this.archivedTrack);
          // Display archived track
          await this.displayArchivedTrack();
          // Set map view for archived track if no current track
          if (!this.currentTrack) await this.mapService.setMapView(this.map, this.archivedTrack);
        }
        // assign visibility
        if (this.multiLayer) this.multiLayer.setVisible(false);
      }
      else if (global.layerVisibility == 'multi') {
        // hide archived track
        try {
          if (this.archivedLayer) this.archivedLayer.setVisible(false);
        }
        catch (error) {}
        this.status = 'black'
        this.ts.setStatus(this.status);
        // display all tracks
        await this.displayAllTracks();
        // center all tracks
        if (!this.currentTrack) await this.mapService.centerAllTracks(this.map);
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
        await this.mapService.setMapView(this.map, this.currentTrack);
      }
    } catch (error) {
      console.error('Error in ionViewDidEnter:', error);
    }
  }

  // 5. START TRACKING /////////////////////////////////

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
    await ForegroundService.startForegroundService({
      id: 1234,
      title: this.translate.instant('MAP.NOTICE'),
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
      backgroundTitle: this.translate.instant('MAP.NOTICE'),
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

  // 6. REMOVE TRACK ///////////////////////////////////

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
    this.fs.displayToast(this.translate.instant('MAP.CURRENT_TRACK_DELETED'));
  }

  // 7. STOP TRACKING //////////////////////////////////

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
    await this.mapService.setMapView(this.map, this.currentTrack);
    // Toast
    this.fs.displayToast(this.translate.instant('MAP.TRACK_FINISHED'));
  }

  // 8. CONFIRM TRACK DELETION OR STOP TRACKING

  async confirm(which: string) {
    const header = which === 'stop' ? this.translate.instant('MAP.STOP_HEADER') : this.translate.instant('MAP.DELETE_HEADER');
    const message = which === 'stop' ? this.translate.instant('MAP.STOP_MESSAGE') : this.translate.instant('MAP.DELETE_MESSAGE');
    const cssClass = 'alert greenishAlert';
    const inputs: never[] = [];
    const buttons =  [
      this.cancelButton,
      {
        text:  this.translate.instant('MAP.YES'),
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

  // 9. SET TRACK NAME, TIME, DESCRIPTION, ...

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

  // 10. NO NAME TO SAVE ////////////////////////////////////

  async showValidationAlert() {
    const cssClass = 'alert greenishAlert'
    const header = 'Validation Error'
    const message = 'Please enter a name for the track.'
    const buttons = ['OK']
    const inputs: never[] = []
    const action = ''
    await this.fs.showAlert(cssClass, header, message, inputs, buttons, action)
  }

  // 11. SAVE FILE ////////////////////////////////////////

  async saveFile(name: string, place: string, description: string) {
    if (!this.currentTrack) return;
    // altitud method
    if (this.selectedAltitude === 'DEM') {
      const coordinates: number[][] = this.currentTrack.features[0].geometry.coordinates;
      var altSlopes: any = await this.getAltitudesFromMap(coordinates as [number, number][])
      console.log(altSlopes)
      if (altSlopes.slopes) this.currentTrack.features[0].properties.totalElevationGain = altSlopes.slopes.gain;
      if (altSlopes.slopes) this.currentTrack.features[0].properties.totalElevationLoss = altSlopes.slopes.loss;
      if (altSlopes.altitudes) this.currentTrack.features[0].geometry.properties.data.forEach((item, index) => {
        item.altitude = altSlopes.altitudes[index];
      });
    }
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
    this.fs.displayToast(this.translate.instant('MAP.SAVED'));
    // Update UI elements
    global.state = 'saved'
    this.show('alert', 'none');
  }

  // 12. BUILD GEOJSON ////////////////////////////////////

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

  // 13. CHECK WHETHER OR NOT WE ARE ON ROUTE //////////////////////

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

  // 14. SHOW / HIDE ELEMENTS /////////////////////////////////

  async show(id: string, action: 'block' | 'none' | 'inline' | 'flex') {
    const obj = document.getElementById(id);
    if (obj) {
      obj.style.display = action;
    }
  }

  // 15. ON DESTROY ////////////////////////

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

  // 16. DISPLAY AN ARCHIVED TRACK /////////////////////////

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
    this.archivedFeature.setStyle(this.mapService.setStrokeStyle(global.archivedColor));
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

  // 17. FIRST POINT OF THE TRACK /////////////////////////////
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
    this.ts.setCurrentTrack(this.currentTrack);
  }

  // 22. CREATE MAP ////////////////////////////////////////
  async createMap() {
    try {
      await this.createLayers(); // your existing method, or move to service
      const { map } = await this.mapService.createMap({
        mapProvider: this.mapProvider,
        currentLayer: this.currentLayer,
        archivedLayer: this.archivedLayer,
        multiLayer: this.multiLayer,
        server: this.server,
        createSource: this.createSource.bind(this), // pass the method as dependency
        getCurrentPosition: this.mapService.getCurrentPosition.bind(this.mapService),
        showCredits: this.fs.displayToast.bind(this.fs),
      });
      this.map = map;
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
  const { pinStyles, features, layers } = this.mapService.createLayers();

  // Assign to component fields
  this.greenPin = pinStyles.greenPin;
  this.redPin = pinStyles.redPin;
  this.bluePin = pinStyles.bluePin;
  this.yellowPin = pinStyles.yellowPin;
  this.blackPin = pinStyles.blackPin;

  this.currentFeature = features.currentFeature as Feature<LineString>;
  this.currentMarkers = features.currentMarkers as Feature<Point>[];
  this.multiFeature = features.multiFeature as Feature<MultiLineString>;
  this.multiMarker = features.multiMarker as Feature<MultiPoint>;
  this.archivedFeature = features.archivedFeature as Feature<LineString>;
  this.archivedMarkers = features.archivedMarkers as Feature<Point>[];
  this.archivedWaypoints = features.archivedWaypoints as Feature<MultiPoint>;

  this.currentLayer = layers.currentLayer;
  this.archivedLayer = layers.archivedLayer;
  this.multiLayer = layers.multiLayer;
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
    this.multiFeature.setStyle(this.mapService.setStrokeStyle('black'));
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
                    await this.mapService.setMapView(this.map, this.archivedTrack);
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
    // If audio alerts are off, return
    if (global.audioAlert == 'off') return;
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
          this.fs.displayToast(this.translate.instant('MAP.IMPORTED'));
        }
        else {
          console.log('not a string')
          this.fs.displayToast(this.translate.instant('MAP.NOT_IMPORTED'));
        }
      } catch (error) {
        this.fs.displayToast(this.translate.instant('MAP.NOT_IMPORTED'));
      }
    } else {
      this.fs.displayToast(this.translate.instant('MAP.NO_FILE_SELECTED'));
    }
  }

  // 45. FOREGROUND TASK ////////////////////////
  async foregroundTask(location:Location) {
    // fill the track
    const locationNew: boolean = await this.buildGeoJson(location);
    // no new point..
    if (!locationNew) return;
    // new point..
    const num = this.currentTrack?.features[0].geometry.coordinates.length ?? 0;
    // filter altitude
    await this.filterAltitude(this.currentTrack, num - this.lag - 1);
    // compute distances
    await this.computeDistances();
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
    await this.mapService.displayCurrentTrack(this.map, this.currentTrack, this.currentFeature, this.currentMarkers);
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
    // Validate and possibly normalize the new value
    this.mapProvider = await this.fs.check(this.mapProvider, 'mapProvider');
    const { newProvider } = await this.mapService.updateMapProvider({
      map: this.map,
      currentProvider: previousProvider,
      mapProvider: this.mapProvider,
      server: this.server,
      createSource: this.createSource.bind(this),
      fs: this.fs,
      onFadeEffect: () => {
        const el = document.getElementById('map');
        if (el) {
          el.classList.add('fade-in');
          setTimeout(() => el.classList.remove('fade-in'), 500);
        }
      }
    });
    this.mapProvider = newProvider; // store the final confirmed value
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
      this.fs.displayToast(this.translate.instant('MAP.WPT_ADDED'));
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
      const distances: number[] = await this.fs.computeCumulativeDistances(rawCoordinates)
      console.log('distances', distances)
      // Compute times
      const times: number[] = await this.createTimes(data, date, distances);
      console.log(times);
      // Get altitudes and compute elevation gain and loss
      var altSlopes: any = await this.getAltitudesFromMap(rawCoordinates)
      // compute speed
      const speed = (data.response.features[0].properties.summary.distance / data.response.features[0].properties.summary.duration) * 3.6;
      const rawProperties: Data[] = await this.fs.fillProperties(distances, altSlopes.altitudes, times, speed);
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
              totalElevationGain: altSlopes.slopes.gain,
              totalElevationLoss: altSlopes.slopes.loss,
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
      await this.mapService.setMapView(this.map, this.archivedTrack);
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
    await this.mapService.removeLayer(this.map, 'searchLayerId');
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
        return this.mapService.setStrokeStyle('black'); // Black line for other geometries
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
        await this.mapService.displayCurrentTrack(this.map, this.currentTrack, this.currentFeature, this.currentMarkers);
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
    try {
      const altitudes = await this.getAltitudes(coordinates)
      const slopes = await this.computeElevationGainAndLoss(altitudes)
      return {altitudes: altitudes, slopes: slopes}
    }
    catch {
      return {altitudes: null, slopes: null}
    }
  }

}
