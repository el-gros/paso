/**
 * Main component for the application's first tab, responsible for map display, GPS tracking, and track management.
 * Integrates map rendering, real-time location tracking, GPX import/export, audio alerts, and multilingual support.
 * Provides methods for starting/stopping tracking, managing tracks and waypoints, handling map events, and updating UI state.
 * Relies on organization-specific services for map, storage, geolocation, and translation functionalities.
 */

import { Component, NgZone } from '@angular/core';
import { SharedImports } from '../shared-imports';
import { DecimalPipe, DatePipe } from '@angular/common';
import { Capacitor, PluginListenerHandle, registerPlugin } from "@capacitor/core";
import { Storage } from '@ionic/storage-angular';
import { CUSTOM_ELEMENTS_SCHEMA, ChangeDetectorRef } from '@angular/core';
import { register } from 'swiper/element/bundle';
import Map from 'ol/Map';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import LineString from 'ol/geom/LineString';
import { ParsedPoint, Location, Track, TrackDefinition, Data, Waypoint } from '../../globald';
import { FunctionsService } from '../services/functions.service';
import { MapService } from '../services/map.service';
import { TrackService } from '../services/track.service';
import { ServerService } from '../services/server.service';
import { global } from '../../environments/environment';
const BackgroundGeolocation: any = registerPlugin("BackgroundGeolocation");
import { Circle as CircleStyle, Style } from 'ol/style';
import { useGeographic } from 'ol/proj.js';
import { App } from '@capacitor/app';
import { Geometry, MultiLineString, MultiPoint } from 'ol/geom';
import { ForegroundService } from '@capawesome-team/capacitor-android-foreground-service';
import GeoJSON from 'ol/format/GeoJSON';
import { Filesystem, Encoding, Directory } from '@capacitor/filesystem';
import { BackgroundTask } from '@capawesome/capacitor-background-task';
import { ModalController } from '@ionic/angular';
import { LocalNotifications } from '@capacitor/local-notifications';
import { EditModalComponent } from '../edit-modal/edit-modal.component';
import { SearchModalComponent } from '../search-modal/search-modal.component';
import { lastValueFrom } from 'rxjs';
import { LanguageService } from '../services/language.service';
import { TranslateService } from '@ngx-translate/core';
import JSZip from 'jszip';

useGeographic();
register();

@Component({
    selector: 'app-tab1',
    templateUrl: 'tab1.page.html',
    styleUrls: ['tab1.page.scss'],
    imports: [SharedImports],
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
  distanceFilter: number = 10; // .05 / 5
  altitudeFiltered: number = 0;
  speedFiltered: number = 0;
  averagedSpeed: number = 0;
  computedDistances: number = 0;
  stopped: any = 0;
  vMin: number = 1;
  currentAverageSpeed: number | undefined = undefined;
  currentMotionSpeed: number | undefined = undefined;
  currentMotionTime: any = '00:00:00';
  archivedFeature: any;
  currentFeature: any;
  multiFeature: any;
  threshDist: number = 0.0000002;
  currentLayer: VectorLayer<VectorSource> | undefined;
  archivedLayer: VectorLayer<VectorSource> | undefined;
  multiLayer: VectorLayer<VectorSource> | undefined;
  foreground: boolean = true;
  status: 'black' | 'red' | 'green' = 'black'
  currentPoint: number = 0;
  audioCtx: AudioContext | null = null;
  beepInterval: any;
  appStateListener?: PluginListenerHandle;
  greenPin?: Style;
  redPin?: Style;
  bluePin?: Style;
  yellowPin?: Style;
  blackPin?: Style;
  state: string = '';

  constructor(
    public fs: FunctionsService,
    public mapService: MapService,
    public ts: TrackService,
    public server: ServerService,
    public storage: Storage,
    private zone: NgZone,
    private cd: ChangeDetectorRef,
    private modalController: ModalController,
    private languageService: LanguageService,
    private translate: TranslateService,
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
  12. nextPoints
  13. onRoute
  14. show
  15. onDestroy
  16. showArchivedTrack
  17. firstPoint
  18. createMap
  19. filterAltitude
  20. createLayers
  21. handleMapClick
  22. computeDistances
  23. htmValues
  24. checkWhetherOnRoute
  25. ionViewWillLeave
  26. playBeep
  27. playDoubleBeep
  28. computeTrackStats
  29. saveTrack
  30. processUrl
  31. foregroundTask
  32. backgroundTask
  33. startBeepInterval
  34. stopBeepInterval
  35. changeMapProvider
  36. determineColors
  37. waypoint
  38. setWaypointAltitude
  39. search
  40. guide
  41. addSearchLayer
  42. morningTask
  43. gettitudes
  44. getAltitudesFromMap

  */

  // 1. ON INIT ////////////////////////////////
  async ngOnInit() {
    try {
      // Listen for state changes
      this.listenToAppStateChanges();
      // Listen for app URL open events (e.g., file tap)
      this.addFileListener();
      // Determine language
      this.languageService.determineLanguage();
      // Initialize variables
      await this.initializeVariables()
      // elements shown, elements hidden
      this.show('alert', 'none');
      // uncheck all
      await this.fs.uncheckAll();
      // create map
      await this.createMap();
      // Save initialized currentPoint
      this.ts.setCurrentPoint(this.currentPoint);
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
      this.fs.layerVisibility = 'archived'
      // assign visibility
      this.multiLayer?.setVisible(false);
      // iF an archived track has been parsed...
      if (this.archivedTrack) {
        this.ts.setArchivedTrack(this.archivedTrack);
        // Display archived track
        await this.showArchivedTrack();
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
      // change map provider
      await this.changeMapProvider();
      // Remove search (if needed)
      await this.removeSearch();
      // Display current track (updates color)
      if (this.currentTrack && this.map) await this.mapService.displayCurrentTrack(this.map, this.currentTrack, this.currentFeature, this.currentMarkers, this.fs.currentColor);
      // archived visible
      if (this.fs.layerVisibility == 'archived') {
        // retrieve archived track
        this.archivedTrack = await this.fs.retrieveTrack() ?? this.archivedTrack;
        if (this.archivedTrack) {
          this.ts.setArchivedTrack(this.archivedTrack);
          // Display archived track
          await this.showArchivedTrack();
          // Set map view for archived track if no current track
          if (!this.currentTrack || this.fs.buildTrackImage) this.mapService.setMapView(this.map, this.archivedTrack);
        }
        // assign visibility
        this.multiLayer?.setVisible(false);
        if (this.fs.buildTrackImage) await this.buildTrackImage()
      }
      else if (this.fs.layerVisibility == 'multi') {
        // hide archived track
        this.archivedLayer?.setVisible(false);
        this.status = 'black'
        this.ts.setStatus(this.status);
        // display all tracks
        await this.mapService.displayAllTracks({
          fs: this.fs,
          collection: this.fs.collection,
          multiFeature: this.multiFeature,
          multiMarker: this.multiMarker,
          greenPin: this.greenPin,
          multiLayer: this.multiLayer,
        });
        // center all tracks
        if (!this.currentTrack) await this.mapService.centerAllTracks(this.map);
      }
      else {
        this.status = 'black';
        this.ts.setStatus(this.status);
        // Hide archived and multi layers
        this.archivedLayer?.setVisible(false);
        this.multiLayer?.setVisible(false);
      }
      // center current track
      if (this.currentTrack) {
        this.mapService.setMapView(this.map, this.currentTrack);
      }
    } catch (error) {
      console.error('Error in ionViewDidEnter:', error);
    }
  }

  // 5. START TRACKING /////////////////////////////////
  async startTracking() {
    // In case there is something wrong
    if (!this.currentLayer) return;
    // Check-request permissions
    const permissionGranted = await ForegroundService.checkPermissions();
    if (!permissionGranted) {
      await ForegroundService.requestPermissions();
    }
    // Check if overlay permission is needed and granted
    const overlayPermissionGranted = await ForegroundService.checkManageOverlayPermission();
    if (!overlayPermissionGranted) {
      await ForegroundService.requestManageOverlayPermission();
    }
    // Start foreground service
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
    // Initialize variables
    this.stopped = 0;
    this.currentAverageSpeed = undefined;
    this.currentMotionSpeed = undefined;
    this.currentMotionTime = '00:00:00';
    this.speedFiltered = 0;
    this.altitudeFiltered = 0;
    this.averagedSpeed = 0;
    this.computedDistances = 0;
    this.audioCtx = new window.AudioContext();
    // Request notification permission
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
    // ✅ Start Background Geolocation watcher (official API)
    this.watcherId = await BackgroundGeolocation.addWatcher(
      {
        backgroundMessage: '',
        backgroundTitle: this.translate.instant('MAP.NOTICE'),
        requestPermissions: true,
        stale: false,
        distanceFilter: this.distanceFilter,
      },
      async (location: Location, error: any) => {
        if (error) {
          console.error('Geolocation error:', error);
          return;
        }
        if (!location) return;
        const success = await this.checkLocation(location);
        if (!success) return;
        if (this.foreground) {
          await this.foregroundTask(location);
        } else {
          await this.backgroundTask(location);
        }
      }
    );
    // Update state
    this.ts.state = 'tracking';
  }

  // 5 bis. CHECK LOCATION //////////////////////////////////
  async checkLocation(location: Location) {
    // excessive uncertainty / no altitude or time measured
    if (location.accuracy > this.threshold ||
      location.altitude == null || location.altitude == undefined ||
      location.altitude == 0 ||
      location.altitudeAccuracy > this.altitudeThreshold ||
      !location.time) return false;
    else return true;
  }

  // 6. REMOVE TRACK ///////////////////////////////////
  async removeTrack() {
    // show / hide elements
    this.ts.state = 'inactive';
    this.show('alert', 'none');
    // Reset current track
    this.status = 'black';
    this.ts.setStatus(this.status);
    this.currentTrack = undefined;
    this.ts.setCurrentTrack(this.currentTrack);
    this.currentLayer?.setVisible(false);
    // Toast
    this.fs.displayToast(this.translate.instant('MAP.CURRENT_TRACK_DELETED'));
  }

  // 7. STOP TRACKING //////////////////////////////////
  async stopTracking() {
    console.log('initiate stop tracking')
    // show / hide elements
    this.ts.state = 'stopped';
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
    if (this.currentTrack?.features?.length) {
      this.mapService.setMapView(this.map, this.currentTrack);
    }
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
      {
        text: this.translate.instant('SETTINGS.CANCEL'),
        role: 'cancel',
        cssClass: 'alert-cancel-button'
      },
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
      cssClass: ['modal-class','green-class'] ,
      backdropDismiss: true, // Allow dismissal by tapping the backdrop
    });
    await modal.present();
    // Handle the modal's dismissal
    const { data } = await modal.onDidDismiss();
    if (data) {
      let { action, name, place, description } = data;
      if (action === 'ok') {
        // Update collection
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
    if (this.fs.selectedAltitude === 'DEM') {
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
    this.fs.collection.push(trackDef);
    await this.fs.storeSet('collection', this.fs.collection);
    // Toast
    this.fs.displayToast(this.translate.instant('MAP.SAVED'));
    // Update UI elements
    this.ts.state = 'saved'
    this.show('alert', 'none');
  }

  // 12. NEXT POINTS ////////////////////////////////////
  async nextPoints(location: Location) {
    // Compute previous time and altitude
    let num: number = this.currentTrack?.features[0].geometry.coordinates.length || 0;
    const previousTime = this.currentTrack?.features[0]?.geometry?.properties?.data[num-1]?.time || 0;
    const previousAltitude = this.currentTrack?.features[0]?.geometry?.properties?.data[num-1]?.altitude || 0;
    // Wrong order
    if (previousTime > location.time) return false;
    // Avoid altitude differences greater than 50m unless gps has been stopped
    if (location.time - previousTime < 60000 && Math.abs(location.altitude - previousAltitude) > 50) {
      location.altitude = previousAltitude + 10 * Math.sign(location.altitude - previousAltitude);
    }
    // m/s to km/h
    location.speed = location.speed * 3.6
    // add location
    await this.fs.fillGeojson(this.currentTrack, location);
    // check whether on route...
    if (this.archivedTrack && this.fs.alert == 'on') {
      await this.checkWhetherOnRoute();
    }
    else {
      this.status = 'black';
      this.ts.setStatus(this.status);
    }
    // Return
    return true;
  }

  // 13. CHECK WHETHER OR NOT WE ARE ON ROUTE //////////////////////
  async onRoute() {
    // Return 'black' if conditions aren't met
    if (!this.currentTrack || !this.archivedTrack || this.fs.layerVisibility != 'archived') return 'black';
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
    for (let i = this.currentPoint; i < archivedCoordinates.length; i += reduction) {
      const point2 = archivedCoordinates[i];
      const distSq = (point[0] - point2[0]) ** 2 + (point[1] - point2[1]) ** 2;
      if (distSq < this.threshDist) {
        //this.lastN = i;
        this.currentPoint = i;
        this.ts.setCurrentPoint(this.currentPoint);
        return 'green';
      } else if (distSq > multiplier * this.threshDist) {
        i += (skip - 1) * reduction;
      }
    }
    // Reverse search
    for (let i = this.currentPoint; i >= 0; i -= reduction) {
      const point2 = archivedCoordinates[i];
      const distSq = (point[0] - point2[0]) ** 2 + (point[1] - point2[1]) ** 2;
      if (distSq < this.threshDist) {
        //this.lastN = i;
        this.currentPoint = i;
        this.ts.setCurrentPoint(this.currentPoint);
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
    this.appStateListener?.remove();
    this.appStateListener = undefined;
    // Clear beep interval
    this.beepInterval?.remove();
    this.beepInterval = undefined;
  }

  // 16. SHOW ARCHIVED TRACK
  async showArchivedTrack() {
    await this.mapService.displayArchivedTrack({
      map: this.map,
      archivedTrack: this.archivedTrack,
      archivedLayer: this.archivedLayer,
      archivedFeature: this.archivedFeature,
      archivedMarkers: this.archivedMarkers,
      archivedWaypoints: this.archivedWaypoints,
      greenPin: this.greenPin,
      redPin: this.redPin,
      yellowPin: this.yellowPin,
      archivedColor: this.fs.archivedColor
    });
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
    this.currentLayer?.setVisible(true);
    // Set current track
    this.ts.setCurrentTrack(this.currentTrack);
  }

  // 18. CREATE MAP ////////////////////////////////////////
  async createMap() {
    try {
      // 🔹 Clean up old map if it exists
      if (this.map) {
        this.map.setTarget(undefined); // detach from DOM and free controls
        this.map = undefined;
      }
      await this.createLayers(); // your existing method, or move to service
      const { map } = await this.mapService.createMap({
        currentLayer: this.currentLayer,
        archivedLayer: this.archivedLayer,
        multiLayer: this.multiLayer,
        server: this.server,
        //createSource: this.createSource.bind(this), // pass the method as dependency
        getCurrentPosition: this.mapService.getCurrentPosition.bind(this.mapService),
        showCredits: this.fs.displayToast.bind(this.fs),
      });
      this.map = map;
      this.map.on('click', this.handleMapClick.bind(this));
    } catch (error) {
      console.error('Error creating map:', error);
    }
  }

  // 19. FILTER ALTITUDE /////////////////////////////
  async filterAltitude(track: any, final: number) {
    if (!track) return;
    // number of points
    const num = track.features[0].geometry.properties.data.length ?? 0;
    // Skip processing if final index is not the last point, or if points are fewer than lag
    if ((final != num - 1) && (num <= this.fs.lag)) return
    // Get the track data once to simplify access
    const data = track.features[0].geometry.properties.data;
    // Loop through each point to filter altitude
    for (let i = this.altitudeFiltered + 1; i <=final; i++) {
      const start = Math.max(0, i - this.fs.lag);
      const end = Math.min(i + this.fs.lag, num - 1);
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

// 20. CREATE LAYERS /////////////////////////////
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

  // 21. HANDLE MAP CLICK //////////////////////////////
  async handleMapClick(event: { coordinate: any; pixel: any }) {
    switch(this.fs.layerVisibility) {
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
                    this.multiLayer?.setVisible(false);
                    this.fs.layerVisibility = 'archived';
                    await this.showArchivedTrack();
                    this.mapService.setMapView(this.map, this.archivedTrack);
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
              const index = this.fs.collection.findIndex((item: TrackDefinition) =>
                item.date instanceof Date &&
                this.archivedTrack?.features[0]?.properties?.date instanceof Date &&
                item.date && this.archivedTrack.features[0].properties.date &&
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
                  if (this.fs.key) await this.fs.storeSet(this.fs.key,this.archivedTrack)
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

  // 22. COMPUTE DISTANCES //////////////////////////////////////
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
      const distance = this.fs.computeDistance(lastPoint[0], lastPoint[1], currentPoint[0], currentPoint[1]);
      // Update the data with the new distance
      data[i].distance = data[i - 1].distance + distance;
      // Track the last computed distance index
      this.computedDistances = i;
    }
  }

  // 23. GET VALUES TO SHOW ON THE TABLE ////////////////////////////////////
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

  // 24. CHECK WHETHER OR NOT WE ARE ON ROUTE ///////////////////
  async checkWhetherOnRoute() {
    // Return early if essential conditions are not met
    if (!this.currentTrack || !this.archivedTrack || this.fs.layerVisibility !== 'archived') return;
    // Store previous color for comparison
    const previousStatus = this.status;
    // Determine the current route color based on `onRoute` function
    this.status = await this.onRoute() || 'black';
    this.ts.setStatus(this.status);
    // If audio alerts are off, return
    if (this.fs.audioAlert == 'off') return;
    // Beep for off-route transition
    if (previousStatus === 'green' && this.status === 'red') {
      this.playDoubleBeep(1800, .3, 1, .12);
    }
    // Beep for on-route transition
    else if (previousStatus === 'red' && this.status === 'green') {
      this.playBeep(1800, .4, 1);
    }
  }

  // 25. ON LEAVE ////////////////////////////
  async ionViewWillLeave() {
    this.fs.archivedPresent = !!this.archivedTrack;
  }

  // 26. PLAY A BEEP /////////////////////////////////////
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

  // 27. PLAY A DOUBLE BEEP
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

  // 28. COMPUTE TRACK STATS /////////////////////////
  async computeTrackStats(
    trackPoints: ParsedPoint[],
    waypoints: Waypoint[],
    trk: Element
  ) {
    const track: Track = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: {
          name: this.fs.sanitize(trk.getElementsByTagName('name')[0]?.textContent || 'No Name') || 'No Name',
          place: '',
          date: undefined,
          description: this.fs.sanitize(trk.getElementsByTagName('cmt')[0]?.textContent || '') || '',
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
        waypoints
      }]
    };
    // Initialize distance and bounding box
    let distance = 0;
    let lonMin = Infinity, latMin = Infinity;
    let lonMax = -Infinity, latMax = -Infinity;
    for (let k = 0; k < trackPoints.length; k++) {
      const { lat, lon, ele, time } = trackPoints[k];
      if (isNaN(lat) || isNaN(lon)) continue;
      // Update bounding box
      lonMin = Math.min(lonMin, lon);
      latMin = Math.min(latMin, lat);
      lonMax = Math.max(lonMax, lon);
      latMax = Math.max(latMax, lat);
      // Add coordinates
      track.features[0].geometry.coordinates.push([lon, lat]);
      const num = track.features[0].geometry.coordinates.length;
      // Distance
      if (k > 0) {
        const prev = trackPoints[k - 1];
        distance += await this.fs.computeDistance(prev.lon, prev.lat, lon, lat);
      }
      // Altitude
      let alt = ele ?? 0;
      if (alt === 0 && num > 1) {
        alt = track.features[0].geometry.properties.data[num - 2].altitude;
      }
      // Time
      const locTime = time || 0;
      // Store point data
      track.features[0].geometry.properties.data.push({
        altitude: alt,
        speed: 0,
        time: locTime,
        compSpeed: 0,
        distance: distance,
      });
      track.features[0].bbox = [lonMin, latMin, lonMax, latMax];
    }
    const num = track.features[0].geometry.properties.data.length ?? 0;
    track.features[0].properties.totalDistance = distance;
    if (num > 1) {
      track.features[0].properties.totalTime = this.fs.formatMillisecondsToUTC(
        track.features[0].geometry.properties.data[num - 1].time -
        track.features[0].geometry.properties.data[0].time
      );
    }
    track.features[0].properties.totalNumber = num;
    // Post-process: filters
    try {
      this.fs.filterSpeed(track.features[0].geometry.properties.data, num - 1);
    } catch {}
    try {
      track.features[0].properties.totalElevationGain = 0;
      track.features[0].properties.totalElevationLoss = 0;
      await this.filterAltitude(track, num - 1);
      this.altitudeFiltered = 0;
    } catch {}
    // Second speed filter
    track.features[0].geometry.properties.data = await this.fs.filterSpeed(
      track.features[0].geometry.properties.data, 1 );
    // Save date
    const date = new Date(track.features[0].geometry.properties.data[num - 1]?.time || Date.now());
    track.features[0].properties.date = date;
    return track;
  }

  // 29. SAVE TRACK INTO COLLECTION
  async saveTrack(track: Track) {
    const dateKey = JSON.stringify(track.features[0].properties.date);
    const existing = await this.fs.storeGet(dateKey);
    if (existing) return;
    await this.fs.storeSet(dateKey, track);
    const trackDef = {
      name: track.features[0].properties.name,
      date: track.features[0].properties.date,
      place: track.features[0].properties.place,
      description: track.features[0].properties.description,
      isChecked: true
    };
    this.fs.collection.push(trackDef);
    await this.fs.storeSet('collection', this.fs.collection);
  }

  // 30. PROCESS FILE AFTER TAPPING ON IT /////////////
  async processUrl(data: any) {
    if (!data.url) {
      this.fs.displayToast(this.translate.instant('MAP.NO_FILE_SELECTED'));
      return;
    }
    try {
      console.log('url', data);
      // Try to extract extension from URL
      let ext = data.url.split('.').pop()?.toLowerCase();
      // Fallback: detect type from content if no extension (common with content:// URIs)
      if (!ext || data.url.startsWith('content://')) {
        try {
          const probe = await Filesystem.readFile({
            path: data.url,
          });
          let sample = '';
          if (typeof probe.data === 'string') {
            // Native: base64 string
            sample = atob(probe.data.substring(0, 100));
          } else if (probe.data instanceof Blob) {
            // Web: Blob
            const text = await probe.data.text(); // read blob as text
            sample = text.substring(0, 100);
          }
          // Decide type from sample
          if (sample.includes('<gpx')) {
            ext = 'gpx';
          } else if (sample.includes('<kml')) {
            ext = 'kml';
          } else if (typeof probe.data === 'string' && probe.data.startsWith('UEsDB')) {
            // Base64 of "PK" → ZIP → KMZ
            ext = 'kmz';
          } else {
            ext = 'unknown';
          }
        } catch (probeErr) {
          console.warn('Could not probe file type:', probeErr);
          this.fs.displayToast(this.translate.instant('MAP.UNSUPPORTED_FILE'));
          return;
        }
      }
      let waypoints: Waypoint[] = [];
      let trackPoints: ParsedPoint[] = [];
      let trk: Element | null = null;
      if (ext === 'gpx') {
        console.log('Processing GPX file');
        const fileContent = await Filesystem.readFile({
          path: data.url,
          encoding: Encoding.UTF8,
        });
        console.log(fileContent);
        ({ waypoints, trackPoints, trk } = await this.mapService.parseGpxXml(fileContent.data as string));
      } else if (ext === 'kmz') {
        console.log('Processing KMZ file');
        const fileContent = await Filesystem.readFile({
          path: data.url,
        });
        console.log(fileContent);
        ({ waypoints, trackPoints, trk } = await this.parseKmz(fileContent.data as string));
      } else {
        this.fs.displayToast(this.translate.instant('MAP.UNSUPPORTED_FILE'));
        return;
      }
      console.log('trk', trk);
      // ✅ Common track handling
      if (!trackPoints.length || !trk) {
        this.fs.displayToast(this.translate.instant('MAP.NO_TRACK'));
        return;
      }
      const track = await this.computeTrackStats(trackPoints, waypoints, trk);
      await this.saveTrack(track);
      this.archivedTrack = track;
      this.fs.displayToast(this.translate.instant('MAP.IMPORTED'));
    } catch (error) {
      console.error('Import failed:', error);
      this.fs.displayToast(this.translate.instant('MAP.NOT_IMPORTED'));
    }
  }

  // 31. FOREGROUND TASK ////////////////////////
  async foregroundTask(location:Location) {
    if (this.currentTrack) {
      const locationNew: boolean = await this.nextPoints(location);
      if (!locationNew) return;
    }
    else {
      await this.firstPoint(location);
      return;
    }
    // new point..
    const num = this.currentTrack?.features[0].geometry.coordinates.length ?? 0;
    // filter altitude
    await this.filterAltitude(this.currentTrack, num - this.fs.lag - 1);
    // compute distances
    await this.computeDistances();
    // filter speed
    if (this.currentTrack) {
      this.currentTrack.features[0].geometry.properties.data = await this.fs.filterSpeed(
        this.currentTrack.features[0].geometry.properties.data,
        this.speedFiltered + 1
      );
    }
    this.speedFiltered = num - 1;
    // html values
    await this.htmlValues();
    // display the current track
    await this.mapService.displayCurrentTrack(this.map, this.currentTrack, this.currentFeature, this.currentMarkers, this.fs.currentColor);
    // Ensure UI updates are reflected
    this.zone.run(() => {
      this.cd.detectChanges();
    });
    console.log('Foreground',this.currentTrack?.features[0].properties.totalNumber || 0, 'points. Process completed')
  }

  // 32. BACKGROUND TASK /////////////////////////////////////
  async backgroundTask(location: Location) {
    const taskId = await BackgroundTask.beforeExit(async () => {
      try {
        if (this.currentTrack) {
          const locationNew: boolean = await this.nextPoints(location);
          if (!locationNew) return;
        }
        else {
          await this.firstPoint(location);
          return;
        }
      } catch (error) {
        console.error('Error in background task:', error);
      }
      finally {
        //Always call finish
      BackgroundTask.finish({ taskId });
      }
    });
  }

  // 33. START BEEP INTERVAL /////////////////////
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

  // 34. STOP BEEP INTERVAL ////////////////////////////
  stopBeepInterval() {
    if (this.beepInterval) {
      clearInterval(this.beepInterval);
      this.beepInterval = null; // Reset the interval reference
    }
  }

  // 35. CHANGE MAP PROVIDER /////////////////////
  async changeMapProvider() {
    const previousProvider = this.fs.mapProvider;
    // Validate and possibly normalize the new value
    this.fs.mapProvider = await this.fs.check(this.fs.mapProvider, 'mapProvider');
    await this.mapService.updateMapProvider({
      map: this.map,
      server: this.server,
      fs: this.fs,
      onFadeEffect: () => {
        const el = document.getElementById('map');
        if (el) {
          el.classList.add('fade-in');
          setTimeout(() => el.classList.remove('fade-in'), 500);
        }
      }
    });
  }

  // 37. ADD WAYPOINT ////////////////////////////////////
  async waypoint() {
    if (!this.currentTrack) return;
    const num: number = this.currentTrack.features[0].geometry.coordinates.length
    let point = this.currentTrack.features[0].geometry.coordinates[num-1];
    const addressObservable = this.mapService.reverseGeocode(point[1], point[0]);
    const address = addressObservable ? await lastValueFrom(addressObservable) : { name: '', display_name: '', short_name: '' };
    console.log(address)
    let waypoint: Waypoint = {
      longitude: point[0],
      latitude: point[1],
      altitude: num - 1, // At this moment, this value is the position of the point in the track
      name: address?.short_name ?? address?.name ?? address?.display_name ?? '',
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

  // 38. SET WAYPOINT ALTITUDE ////////////////////////////////////////
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

  // 39. SEARCH SITE /////////////////////////////////////////
  async search() {
    this.fs.comingFrom = 'search';
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

  // 40. SEARCH ROUTE /////////////////////////////////////////////
  async guide() {
    this.fs.comingFrom = 'guide';
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
      trackName = data.response.trackName;
      console.log('trackName', trackName)
      // Coordinates
      const rawCoordinates = data.response.features[0].geometry.coordinates;
      // Case of no route
      if (!rawCoordinates || rawCoordinates?.length === 0) {
        this.fs.displayToast(this.translate.instant('MAP.NO_ROUTE'));
        return;
      }
      // Compute distances
      const distances: number[] = await this.fs.computeCumulativeDistances(rawCoordinates)
      // Compute times
      const times: number[] = await this.fs.createTimes(data, date, distances);
      // Get altitudes and compute elevation gain and loss
      var altSlopes: any = await this.getAltitudesFromMap(rawCoordinates)
      // compute speed
      const speed = (data.response.features[0].properties.summary.distance / data.response.features[0].properties.summary.duration) * 3.6;
      const rawProperties: Data[] = await this.fs.fillProperties(distances, altSlopes.altitudes, times, speed);
      // Increase the number of coordinates
      //var num = rawCoordinates.length;
      const result = await this.fs.adjustCoordinatesAndProperties(rawCoordinates, rawProperties, 0.025);
      if (result) {
        var num = result.newCoordinates.length;
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
      this.multiLayer?.setVisible(false);
      this.archivedLayer?.setVisible(true);  // No need for await
      this.fs.layerVisibility = 'archived';
      await this.showArchivedTrack();
      this.mapService.setMapView(this.map, this.archivedTrack);
      this.archivedTrack.features[0].properties.date = date;
      const dateKey = JSON.stringify(date);
      await this.fs.storeSet(dateKey, this.archivedTrack);
      // Track definition for collection
      const trackDef = {
        name: trackName,
        date: date,
        place: '',
        description: '',
        isChecked: false
      };
      // add new track definition and save collection
      this.fs.collection.push(trackDef);
      await this.fs.storeSet('collection', this.fs.collection);
    }
  }

  // 41. ADD SEARCH LAYER
  async addSearchLayer(feature: Feature<Geometry>) {
    if (!this.map) return;
    await this.mapService.addSearchLayer({
      map: this.map,
      feature,
      blackPin: this.blackPin,
      setStrokeStyle: this.mapService.setStrokeStyle.bind(this.mapService),
    });
  }

  // 42. MORNING TASK
  async morningTask() {
    // Run updates outside of Angular's zone to avoid change detection overhead
    this.zone.runOutsideAngular(async () => {
      try{
        // Filter altitude data
        const num = this.currentTrack?.features[0].geometry.coordinates.length ?? 0;
        await this.filterAltitude(this.currentTrack, num - this.fs.lag - 1);
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
        await this.mapService.displayCurrentTrack(this.map, this.currentTrack, this.currentFeature, this.currentMarkers, this.fs.currentColor);
        // Trigger Angular's change detection
        this.cd.detectChanges();
      } catch (error) {
        console.error('Error during foreground transition processing:', error);
      }
    });
  }

  // 43. COMPUTE ALTITUDES
  async getAltitudes(rawCoordinates: [number, number][]): Promise<number[]> {
    const requestBody = {
      locations: rawCoordinates.map(([lon, lat]) => ({
        latitude: lat,
        longitude: lon
      }))
    };
    try {
/*      const response = await CapacitorHttp.post({
        url: 'https://api.open-elevation.com/api/v1/lookup',
        headers: { 'Content-Type': 'application/json' },
        data: requestBody, // no need to JSON.stringify
      }); */
      const response = await fetch('https://api.open-elevation.com/api/v1/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });
      //const result = await response.json();
      console.log(response)
      // Check status
      if (response.status < 200 || response.status >= 300) {
        this.fs.displayToast('Failed to fetch elevation data.');
        return [];
      }
      // Parse response as JSON and extract elevations
      const result = await response.json();
      return result.results.map((result: any) => result.elevation);
    } catch (error) {
      // Handle network or parsing errors gracefully
      this.fs.displayToast('Error retrieving elevation data.');
      return [];
    }
  }

  // 44. GET ALTITUDES FROM MAP /////////////////////////////////
  async getAltitudesFromMap(coordinates: [number, number][] ) {
    try {
      const altitudes = await this.getAltitudes(coordinates)
      const slopes = await this.fs.computeElevationGainAndLoss(altitudes)
      return {altitudes: altitudes, slopes: slopes}
    }
    catch {
      return {altitudes: null, slopes: null}
    }
  }

  async buildTrackImage() {
  try {
    // Give Angular time to finish ngOnInit
    await new Promise(resolve => setTimeout(resolve, 150));
    // Save current visibility
    const visible = this.currentLayer?.getVisible() || false;
    this.currentLayer?.setVisible(false);
    // Center map on archived track
    this.mapService.setMapView(this.map, this.archivedTrack);
    // Optional: adjust zoom/scale if needed
    const scale = 1;
    const mapWrapperElement: HTMLElement | null = document.getElementById('map-wrapper');
    if (mapWrapperElement) {
      mapWrapperElement.style.transform = `scale(${scale})`;
    }
    // Convert map to image
    let success = false;
    if (this.map) {
      success = await this.exportMapToImage(this.map);
    }
    // Restore visibility of current track
    this.currentLayer?.setVisible(visible);
    // Restore map provider
    this.fs.mapProvider = this.fs.savedProvider
    await this.fs.storeSet('mapProvider', this.fs.mapProvider);
    // Handle result
    if (success) {
      this.fs.gotoPage('canvas');
    } else {
      this.fs.buildTrackImage = false;
      await this.fs.displayToast(this.translate.instant('MAP.TOIMAGE_FAILED'));
      this.fs.gotoPage('archive');
    }
  } catch (err) {
    console.error('buildTrackImage failed:', err);
    this.fs.buildTrackImage = false;
    await this.fs.displayToast(this.translate.instant('MAP.TOIMAGE_FAILED'));
    this.fs.gotoPage('archive');
  }
}

  async exportMapToImage(map: Map): Promise<boolean> {
    // Wait for full map render
    const waitForRenderComplete = (map: Map): Promise<void> => {
      return new Promise((resolve) => {
        map.once('rendercomplete', () => {
          // add a slight delay for WebGL/vector layers
          setTimeout(() => resolve(), 300);
        });
        map.renderSync();
      });
    };
    try {
      // Ensure map is sized & rendered correctly
      map.updateSize();
      await waitForRenderComplete(map);
      const width = map.getSize()?.[0] ?? window.innerWidth;
      const height = map.getSize()?.[1] ?? window.innerHeight;
      const mapCanvas = document.createElement('canvas');
      mapCanvas.width = width;
      mapCanvas.height = height;
      const ctx = mapCanvas.getContext('2d');
      if (!ctx) throw new Error('No 2D rendering context');
      // Composite all OL layer canvases
      document.querySelectorAll<HTMLCanvasElement>('.ol-layer canvas').forEach((canvas) => {
        if (canvas.width > 0) {
          const opacity = (canvas.parentNode as HTMLElement)?.style.opacity || '1';
          ctx.globalAlpha = Number(opacity);
          // respect transform from OL
          const transform = canvas.style.transform;
          if (transform && transform.startsWith('matrix')) {
            const matrix = transform.match(/^matrix\(([^)]+)\)$/);
            if (matrix) {
              const values = matrix[1].split(',').map(Number);
              // setTransform expects 6 numbers: a, b, c, d, e, f
              ctx.setTransform(values[0], values[1], values[2], values[3], values[4], values[5]);
            }
          } else {
            ctx.setTransform(1, 0, 0, 1, 0, 0); // reset
          }
          ctx.drawImage(canvas, 0, 0);
        }
      });
      // Reset any transform
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1.0;
      // Export as PNG
      const dataUrl = mapCanvas.toDataURL('image/png');
      const base64Data = dataUrl.split(',')[1];
      await Filesystem.writeFile({
        path: 'map.png',
        data: base64Data,
        directory: Directory.ExternalCache, // Cache is more reliable than External
      });
      return true; // success
    } catch (err) {
      console.error('Failed to export map image:', err);
      return false;
    }
  }

async processKmz(data: any) {
  try {
    // 1. Read binary file
    const fileContent = await Filesystem.readFile({
      path: data.url,
    });
    // 2. Load KMZ (ZIP)
    const zip = await JSZip.loadAsync(fileContent.data, { base64: true });
    // 3. Find KML inside (usually "doc.kml")
    const kmlFile = zip.file(/\.kml$/i)[0];
    if (!kmlFile) {
      this.fs.displayToast(this.translate.instant('MAP.NOT_IMPORTED'));
      return;
    }
    // 4. Parse KML text
    const kmlText = await kmlFile.async("string");
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(kmlText, 'application/xml');
    // 5. Extract waypoints and trackpoints
    const { waypoints, trackPoints, trk } = await this.mapService.parseKmlXml(xmlDoc);
    if (!trackPoints.length || !trk) return;
    // 6. Compute and save track
    const track = await this.computeTrackStats(trackPoints, waypoints, trk);
    await this.saveTrack(track);
    this.archivedTrack = track;
    this.fs.displayToast(this.translate.instant('MAP.IMPORTED'));
  } catch (err) {
    console.error(err);
    this.fs.displayToast(this.translate.instant('MAP.NOT_IMPORTED'));
  }
}

// PARSE KMZ ///////////////////////////////////////
  async parseKmz(base64Data: string): Promise<{ waypoints: Waypoint[], trackPoints: ParsedPoint[], trk: Element | null }> {
    try {
      // Decode Base64 → ArrayBuffer
      const binary = atob(base64Data);
      const len = binary.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binary.charCodeAt(i);
      }

      // Load KMZ as zip
      const zip = await JSZip.loadAsync(bytes);

      // Find the first .kml file in the KMZ
      const kmlFile = Object.keys(zip.files).find(name => name.toLowerCase().endsWith('.kml'));
      if (!kmlFile) {
        throw new Error('No KML file found inside KMZ.');
      }

      // Extract KML text
      const kmlText = await zip.files[kmlFile].async('string');
      if (!kmlText || !kmlText.includes('<kml')) {
        throw new Error('Invalid KML content in KMZ.');
      }

      // Convert string → XML Document
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(kmlText, 'application/xml');

      // Reuse your existing KML parser
      return this.mapService.parseKmlXml(xmlDoc);

    } catch (error) {
      console.error('parseKmz failed:', error);
      this.fs.displayToast(this.translate.instant('MAP.UNSUPPORTED_FILE'));
      return { waypoints: [], trackPoints: [], trk: null };
    }
  }

  async removeSearch() {
    if (!this.fs.deleteSearch) return;
    await this.mapService.removeLayer(this.map, 'searchLayerId');
    this.fs.deleteSearch = false;
  }

  async initializeVariables() {
    // Check map provider
    this.fs.mapProvider = await this.fs.check(this.fs.mapProvider, 'mapProvider');
    // retrieve collection
    this.fs.collection = await this.fs.storeGet('collection') || [];
    // Determine colors
    this.fs.archivedColor = await this.fs.check(this.fs.archivedColor, 'archivedColor');
    this.fs.currentColor = await this.fs.check(this.fs.currentColor, 'currentColor');
    // Aert
    this.fs.alert = await this.fs.check(this.fs.alert,'alert')
    // Audio alert
    this.fs.audioAlert = await this.fs.check(this.fs.audioAlert,'audioAlert')
    // Altitude method
    this.fs.selectedAltitude = await this.fs.check(this.fs.selectedAltitude, 'altitude');
    // Geocoding Service
    this.fs.geocoding = await this.fs.check(this.fs.geocoding, 'geocoding');
  }

}


