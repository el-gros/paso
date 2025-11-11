/**
 * Main component for the application's first tab, responsible for map display, GPS tracking, and track management.
 * Integrates map rendering, real-time location tracking, GPX import/export, audio alerts, and multilingual support.
 * Provides methods for starting/stopping tracking, managing tracks and waypoints, handling map events, and updating UI state.
 * Relies on organization-specific services for map, storage, geolocation, and translation functionalities.
 */

import { Component, NgZone, Inject } from '@angular/core';
import { DecimalPipe, DatePipe, CommonModule } from '@angular/common';
import { CapacitorHttp, PluginListenerHandle, registerPlugin } from "@capacitor/core";
import { Storage } from '@ionic/storage-angular';
import { CUSTOM_ELEMENTS_SCHEMA, ChangeDetectorRef } from '@angular/core';
import { register } from 'swiper/element/bundle';
import Map from 'ol/Map';
import Feature, { FeatureLike } from 'ol/Feature';
import Point from 'ol/geom/Point';
import LineString from 'ol/geom/LineString';
import { ParsedPoint, Location, Track, TrackDefinition, Data, Waypoint } from '../../globald';
import { FunctionsService } from '../services/functions.service';
import { MapService } from '../services/map.service';
import { ServerService } from '../services/server.service';
import { global } from '../../environments/environment';
const BackgroundGeolocation: any = registerPlugin("BackgroundGeolocation");
import { Circle as CircleStyle, Fill, Stroke, Style } from 'ol/style';
import { useGeographic } from 'ol/proj.js';
import { App } from '@capacitor/app';
import { Geometry, MultiLineString, MultiPoint } from 'ol/geom';
import { ForegroundService } from '@capawesome-team/capacitor-android-foreground-service';
import GeoJSON from 'ol/format/GeoJSON';
import { Filesystem, Encoding, Directory } from '@capacitor/filesystem';
import { BackgroundTask } from '@capawesome/capacitor-background-task';
import { IonicModule, ModalController } from '@ionic/angular';
import { LocalNotifications } from '@capacitor/local-notifications';
import { EditModalComponent } from '../edit-modal/edit-modal.component';
import { SearchModalComponent } from '../search-modal/search-modal.component';
import { lastValueFrom } from 'rxjs';
import { LanguageService } from '../services/language.service';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import JSZip from 'jszip';
import { LocationResult, Route } from '../../globald';
import { SpeechRecognition } from '@capacitor-community/speech-recognition';
import { FormsModule } from '@angular/forms';


useGeographic();
register();

@Component({
    standalone: true,
    selector: 'app-tab1',
    templateUrl: 'tab1.page.html',
    styleUrls: ['tab1.page.scss'],
    imports: [
      IonicModule, CommonModule, FormsModule, TranslateModule
    ],
    providers: [DecimalPipe, DatePipe],
    schemas: [CUSTOM_ELEMENTS_SCHEMA]
})

export class Tab1Page {

  watcherId: number = 0;
  //track: Track | undefined = undefined;
  vMax: number = 400;
  margin: number = 10;
  threshold: number = 20;
  altitudeThreshold: number = 20;
  properties: (keyof Data)[] = ['altitude', 'compSpeed'];
  gridsize: string = '-';

  distanceFilter: number = 10; // .05 / 5
  altitudeFiltered: number = 0;
  speedFiltered: number = 0;
  averagedSpeed: number = 0;
  computedDistances: number = 0;
  vMin: number = 1;

  threshDist: number = 0.0000002;
  foreground: boolean = true;

  audioCtx: AudioContext | null = null;
  beepInterval: any;
  appStateListener?: PluginListenerHandle;
  styleSearch?: (featureLike: FeatureLike) => Style | Style[] | undefined;
  state: string = '';

  isRecordPopoverOpen = false;
  isConfirmStopOpen = false;
  isConfirmDeletionOpen = false;
  isSearchGuidePopoverOpen = false;
  isSearchPopoverOpen = false;
  isGuidePopoverOpen = false;

  query: string = '';
  query2: string = '';
  query3: string = '';
  results: LocationResult[] = [];
  loading: boolean = false;

  constructor(
    public fs: FunctionsService,
    public mapService: MapService,
    public server: ServerService,
    public storage: Storage,
    @Inject(NgZone) private zone: NgZone,
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
  6. deleteTrack
  7. stopTracking

  9. setTrackDetails
  10. showValidationAlert
  11. saveFile
  12. updateTrack
  13. onRoute
  14. show
  15. onDestroy
  16. showArchivedTrack

  18. handleClicks
  19. filterAltitude

  21. handleMapClick
  22. computeDistances
  23. htmValues
  24. checkWhetherOnRoute

  26. playBeep
  27. playDoubleBeep
  28. computeTrackStats
  29. saveTrack
  30. processUrl
  31. foregroundTask
  32. backgroundTask
  33. startBeepInterval
  34. stopBeepInterval

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
      await this.mapService.loadMap();
      // Handle clicks on map
      await this.handleClicks();
    } catch (error) {
      console.error('Error during ngOnInit:', error);
    }
    global.ngOnInitFinished = true;
  }

  // 2. LISTEN TO CHANGES IN FOREGROUND - BACKGROUND
  async listenToAppStateChanges() {
    this.appStateListener = await App.addListener('appStateChange', async (state) => {
      if (!this.fs.currentTrack) return;
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
      // iF an archived track has been parsed...
      if (this.fs.archivedTrack) await this.mapService.displayArchivedTrack();
    });
  }

  // 4. ION VIEW DID ENTER
  async ionViewDidEnter() {
    while (!global.ngOnInitFinished) {
      await new Promise(resolve => setTimeout(resolve, 50)); // Wait until ngOnInit is done
    }
    if (this.fs.reDraw) await this.mapService.updateColors();
    if (this.fs.buildTrackImage) await this.buildTrackImage()
  }

  // 5. START TRACKING /////////////////////////////////
  async startTracking() {
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
    this.fs.currentTrack = undefined;
    this.fs.currentLayer?.getSource()?.clear();
    this.fs.currentPoint = 0;
    // Initialize variables
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
    this.fs.state = 'tracking';
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
  async deleteTrack() {
    // show / hide elements
    this.fs.state = 'inactive';
    // Reset current track
    this.fs.status = 'black';
    this.fs.currentTrack = undefined;
    this.fs.currentLayer?.getSource()?.clear();
    this.fs.displayToast(this.translate.instant('MAP.CURRENT_TRACK_DELETED'));
  }

  // 7. STOP TRACKING //////////////////////////////////
  async stopTracking(): Promise<void> {
    // Always stop the watcher and foreground service, even if no layer yet
    this.fs.state = 'stopped';
    this.show('alert', 'none');
    try {
      await BackgroundGeolocation.removeWatcher({ id: this.watcherId });
    } catch (err) {
      console.warn('Failed to remove watcher:', err);
    }
    try {
      await ForegroundService.stopForegroundService();
    } catch (err) {
      console.warn('Failed to stop foreground service:', err);
    }
    // If no current layer yet → nothing to update on the map, just finish cleanly
    if (!this.fs.currentLayer?.getSource() || !this.fs.currentTrack || !this.fs.map) return;
    const source = this.fs.currentLayer.getSource();
    if (!source) return;
    const features = source.getFeatures();
    // If we have coordinates, finalize track geometry
    let coordinates = this.fs.currentTrack.features?.[0]?.geometry?.coordinates;
    if (!Array.isArray(coordinates) || coordinates.length < 1) {
      this.fs.displayToast(this.translate.instant('MAP.TRACK_EMPTY'));
      return;
    }
    await this.filterAltitude(this.fs.currentTrack, coordinates.length - 1);
    await this.setWaypointAltitude();
    coordinates = this.fs.currentTrack.features?.[0]?.geometry?.coordinates;
    if (!Array.isArray(coordinates) || coordinates.length < 1) return;
    if (features.length >= 3) {
      features[0].setGeometry(new LineString(coordinates));
      features[0].setStyle(this.mapService.setStrokeStyle(this.fs.currentColor));
      features[1].setGeometry(new Point(coordinates[0]));
      features[1].setStyle(this.mapService.createPinStyle('green'));
      features[2].setGeometry(new Point(coordinates.at(-1)!));
      features[2].setStyle(this.mapService.createPinStyle('red'));
    }
    this.mapService.setMapView(this.fs.currentTrack);
    this.fs.displayToast(this.translate.instant('MAP.TRACK_FINISHED'));
    // Update state
    this.fs.state = 'stopped';
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
    if (!this.fs.currentTrack) return;
    // altitud method
    if (this.fs.selectedAltitude === 'DEM') {
      const coordinates: number[][] = this.fs.currentTrack.features[0].geometry.coordinates;
      var altSlopes: any = await this.getAltitudesFromMap(coordinates as [number, number][])
      console.log(altSlopes)
      if (altSlopes.slopes) this.fs.currentTrack.features[0].properties.totalElevationGain = altSlopes.slopes.gain;
      if (altSlopes.slopes) this.fs.currentTrack.features[0].properties.totalElevationLoss = altSlopes.slopes.loss;
      if (altSlopes.altitudes) this.fs.currentTrack.features[0].geometry.properties.data.forEach((item, index) => {
        item.altitude = altSlopes.altitudes[index];
      });
    }
    // build new track definition
    const currentProperties = this.fs.currentTrack.features[0].properties;
    currentProperties.name = name;
    currentProperties.place = place;
    currentProperties.description = description;
    currentProperties.date = new Date();
    // Save the current track to storage with date as key
    const dateKey = JSON.stringify(currentProperties.date);
    await this.fs.storeSet(dateKey, this.fs.currentTrack);
    await this.fs.storeSet(JSON.stringify(this.fs.currentTrack.features[0].properties.date), this.fs.currentTrack);
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
    this.fs.state = 'saved'
    this.show('alert', 'none');
  }

  // 12. UPDATE TRACK POINTS ////////////////////////////////////
  async updateTrack(location: Location): Promise<boolean> {
    if (!this.fs.map || !this.fs.currentLayer) return false;
    // If no current track exists → initialize it (first point)
    if (!this.fs.currentTrack) {
      var features = [new Feature(), new Feature(), new Feature()]
      this.fs.currentTrack = {
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
            coordinates: [[location.longitude, location.latitude]],
            properties: {
              data: [{
                altitude: location.altitude,
                speed: location.speed,
                time: location.time,
                compSpeed: 0,
                distance: 0
              }]
            }
          },
          waypoints: []
        }]
      };
      this.fs.stopped = 0;
      this.fs.averagedSpeed = 0;
      // Display waypoint button
      this.show('alert', 'block');
      // Create markers (start, green, blue)
      features[1].setGeometry(new Point([location.longitude, location.latitude]));
      features[1].setStyle(this.mapService.createPinStyle('green'));
      features[2].setGeometry(new Point([location.longitude, location.latitude]));
      features[2].setStyle(this.mapService.createPinStyle('blue'));
      // Register track
      this.fs.currentLayer.getSource()?.clear();
      this.fs.currentLayer.getSource()?.addFeatures(features);
      return true;
    }
    // Otherwise, we are adding a new point (subsequent update)
    const num = this.fs.currentTrack.features[0].geometry.coordinates.length;
    const prevData = this.fs.currentTrack.features[0].geometry.properties.data[num - 1];
    const previousTime = prevData?.time || 0;
    const previousAltitude = prevData?.altitude || 0;
    // Wrong order
    if (previousTime > location.time) return false;
    // Avoid unrealistic altitude jumps (if GPS still running)
    if (location.time - previousTime < 60000 && Math.abs(location.altitude - previousAltitude) > 50) {
      location.altitude = previousAltitude + 10 * Math.sign(location.altitude - previousAltitude);
    }
    // Convert m/s to km/h
    location.speed = location.speed * 3.6;
    // Add point to geojson
    await this.fs.fillGeojson(this.fs.currentTrack, location);
    // Optional route check
    if (this.fs.archivedTrack && this.fs.alert === 'on') {
      await this.checkWhetherOnRoute();
    } else {
      this.fs.status = 'black';
    }
    return true;
  }

  // 13. CHECK WHETHER OR NOT WE ARE ON ROUTE //////////////////////
  async onRoute() {
    // Return 'black' if conditions aren't met
    if (!this.fs.currentTrack || !this.fs.archivedTrack) return 'black';
    // Define current and archived coordinates
    const currentCoordinates = this.fs.currentTrack.features[0].geometry.coordinates;
    const archivedCoordinates = this.fs.archivedTrack.features[0].geometry.coordinates;
    if (currentCoordinates.length === 0 || archivedCoordinates.length === 0) return 'black';
    // Define parameters
    const bounding = (this.fs.status === 'red' ? 0.25 : 42.5) * Math.sqrt(this.threshDist);
    //const reduction = Math.max(Math.round(archivedCoordinates.length / 2000), 1);
    const reduction = 1 // no reduction
    const multiplier = 10;
    const skip = 5;
    // Get the point to check from the current track
    const point = currentCoordinates[currentCoordinates.length - 1];
    // Boundary check
    const bbox = this.fs.archivedTrack.features[0].bbox;
    if (bbox)  {
      if (point[0] < bbox[0] - bounding || point[0] > bbox[2] + bounding ||
        point[1] < bbox[1] - bounding || point[1] > bbox[3] + bounding) return 'red'
    }
    // Forward search
    for (let i = this.fs.currentPoint; i < archivedCoordinates.length; i += reduction) {
      const point2 = archivedCoordinates[i];
      const distSq = (point[0] - point2[0]) ** 2 + (point[1] - point2[1]) ** 2;
      if (distSq < this.threshDist) {
        //this.lastN = i;
        this.fs.currentPoint = i;
        return 'green';
      } else if (distSq > multiplier * this.threshDist) {
        i += (skip - 1) * reduction;
      }
    }
    // Reverse search
    for (let i = this.fs.currentPoint; i >= 0; i -= reduction) {
      const point2 = archivedCoordinates[i];
      const distSq = (point[0] - point2[0]) ** 2 + (point[1] - point2[1]) ** 2;
      if (distSq < this.threshDist) {
        //this.lastN = i;
        this.fs.currentPoint = i;
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

  // 18. CREATE MAP ////////////////////////////////////////
  async handleClicks() {
    try {
      if (!this.fs.map) return
      // Type guard ensures map is defined before calling 'on'
      (this.fs.map as Map).on('click', this.handleMapClick.bind(this));
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

  // 21. HANDLE MAP CLICK //////////////////////////////
  async handleMapClick(event: { coordinate: any; pixel: any }) {
    if (this.fs.archivedLayer?.getSource() && !this.fs.archivedTrack) {
      const source = this.fs.archivedLayer?.getSource();
      if (!source || !this.fs.map) return;
      const features = source.getFeatures();
      if (!features || features.length<2) return;
      this.fs.map.forEachFeatureAtPixel(event.pixel, async (feature: any) => {
        if (feature === features[1]) {
          // Retrieve clicked coordinate and find its index
          const clickedCoordinate = feature.getGeometry().getClosestPoint(event.coordinate);
          const multiPointCoordinates = feature.getGeometry().getCoordinates();
          const index = multiPointCoordinates.findIndex((coord: [number, number]) =>
            coord[0] === clickedCoordinate[0] && coord[1] === clickedCoordinate[1]
          );
          // Retrieve the archived track based on the index key
          const multiKey = feature.get('multikey'); // Retrieve stored waypoints
          const key = multiKey[index];
          this.fs.archivedTrack = await this.fs.storeGet(JSON.stringify(key));
          // Display archived track details if it exists
          if (this.fs.archivedTrack) await this.mapService.displayArchivedTrack();
        }
      }); }
    else if (this.fs.archivedTrack) {
      let hit: boolean = false;
      const asource = this.fs.archivedLayer?.getSource();
      if (!asource || !this.fs.map) return;
      const afeatures = asource.getFeatures();
      if (!afeatures || afeatures.length<5) return;
      this.fs.map.forEachFeatureAtPixel(event.pixel, feature => {
        const match = [afeatures?.[1], afeatures?.[3]].includes(feature as Feature<Geometry>);
        if (!match) return;
        hit = true;
        const archivedDate = this.fs.archivedTrack?.features?.[0]?.properties?.date;
        const index = this.fs.collection.findIndex(
          (item: TrackDefinition) =>
            item.date instanceof Date &&
            archivedDate instanceof Date &&
            item.date.getTime() === archivedDate.getTime()
        );
        if (index >= 0) {
          this.fs.editTrack(index, '#ffffbb', false).catch(console.error);
        }
      });
      if (!hit && this.fs.map) this.fs.map.forEachFeatureAtPixel(event.pixel, async (feature: any) => {
        if (feature === afeatures[4]) {
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
              if (this.fs.archivedTrack) {
                this.fs.archivedTrack.features[0].waypoints = waypoints;
                if (this.fs.key) await this.fs.storeSet(this.fs.key,this.fs.archivedTrack)
              }
            }
          }
        };
      });
    }
  }

  // 22. COMPUTE DISTANCES //////////////////////////////////////
  async computeDistances() {
    if (!this.fs.currentTrack) return;
    // get coordinates and data arrays
    const coordinates = this.fs.currentTrack.features[0].geometry.coordinates;
    const data = this.fs.currentTrack.features[0].geometry.properties.data;
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
    if (!this.fs.currentTrack) return;
    // Get the data array
    const data = this.fs.currentTrack.features[0].geometry.properties.data;
    // Ensure data exists and has elements
    const num = data.length ?? 0;
    if (num < 1) return;
    // Update HTML values
    this.fs.currentTrack.features[0].properties.totalDistance = data[num - 1].distance;
    this.fs.currentTrack.features[0].properties.totalTime = this.fs.formatMillisecondsToUTC(data[num - 1].time - data[0].time);
    this.fs.currentTrack.features[0].properties.totalNumber = num;
    this.fs.currentTrack.features[0].properties.currentSpeed = data[num - 1].compSpeed;
  }

  // 24. CHECK WHETHER OR NOT WE ARE ON ROUTE ///////////////////
  async checkWhetherOnRoute() {
    // Return early if essential conditions are not met
    if (!this.fs.currentTrack || !this.fs.archivedTrack) return;
    // Store previous color for comparison
    const previousStatus = this.fs.status;
    // Determine the current route color based on `onRoute` function
    this.fs.status = await this.onRoute() || 'black';
    // If audio alerts are off, return
    if (this.fs.audioAlert == 'off') return;
    // Beep for off-route transition
    if (previousStatus === 'green' && this.fs.status === 'red') {
      this.playDoubleBeep(1800, .3, 1, .12);
    }
    // Beep for on-route transition
    else if (previousStatus === 'red' && this.fs.status === 'green') {
      this.playBeep(1800, .4, 1);
    }
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
      this.fs.archivedTrack = track;
      this.fs.displayToast(this.translate.instant('MAP.IMPORTED'));
    } catch (error) {
      console.error('Import failed:', error);
      this.fs.displayToast(this.translate.instant('MAP.NOT_IMPORTED'));
    }
  }

  // 31. FOREGROUND TASK ////////////////////////
  async foregroundTask(location:Location) {
    const updated = await this.updateTrack(location);
    if (!updated) return;    // new point..
    const num = this.fs.currentTrack?.features[0].geometry.coordinates.length ?? 0;
    // filter altitude
    await this.filterAltitude(this.fs.currentTrack, num - this.fs.lag - 1);
    // compute distances
    await this.computeDistances();
    // filter speed
    if (this.fs.currentTrack) {
      this.fs.currentTrack.features[0].geometry.properties.data = await this.fs.filterSpeed(
        this.fs.currentTrack.features[0].geometry.properties.data,
        this.speedFiltered + 1
      );
    }
    this.speedFiltered = num - 1;
    // html values
    await this.htmlValues();
    // display the current track
    await this.mapService.displayCurrentTrack(this.fs.currentTrack);
    // Ensure UI updates are reflected
    this.zone.run(() => {
      this.cd.detectChanges();
    });
    console.log('Foreground',this.fs.currentTrack?.features[0].properties.totalNumber || 0, 'points. Process completed')
  }

  // 32. BACKGROUND TASK /////////////////////////////////////
  async backgroundTask(location: Location) {
    const taskId = await BackgroundTask.beforeExit(async () => {
      await this.updateTrack(location);
    });
    BackgroundTask.finish({ taskId });
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

  // 37. ADD WAYPOINT ////////////////////////////////////
  async waypoint() {
    if (!this.fs.currentTrack) return;
    const num: number = this.fs.currentTrack.features[0].geometry.coordinates.length;
    const point = this.fs.currentTrack.features[0].geometry.coordinates[num - 1];
    // Wrap the reverse geocode in a timeout
    const addressObservable = this.mapService.reverseGeocode(point[1], point[0]);
    const addressPromise = lastValueFrom(addressObservable);
    // Timeout promise (rejects or resolves after 500 ms)
    const timeoutPromise = new Promise(resolve =>
      setTimeout(() => resolve(null), 500)
    );
    // Race both
    const address: any = (await Promise.race([addressPromise, timeoutPromise])) || {
      name: '',
      display_name: '',
      short_name: ''
    };
    const waypoint: Waypoint = {
      longitude: point[0],
      latitude: point[1],
      altitude: num - 1,
      name: address?.short_name ?? address?.name ?? address?.display_name ?? '',
      comment: ''
    };
    const response: { action: string; name: string; comment: string } =
      await this.fs.editWaypoint(waypoint, false, true);
    if (response.action === 'ok') {
      waypoint.name = response.name;
      waypoint.comment = response.comment;
      this.fs.currentTrack?.features[0].waypoints?.push(waypoint);
      this.fs.displayToast(this.translate.instant('MAP.WPT_ADDED'));
    }
  }

  // 38. SET WAYPOINT ALTITUDE ////////////////////////////////////////
  async setWaypointAltitude() {
    if (!this.fs.currentTrack) return;
    // Retrieve waypoints
    const waypoints: Waypoint[] = this.fs.currentTrack.features[0].waypoints || [];
    for (const wp of waypoints) {
      if (wp.altitude != null && wp.altitude >= 0) wp.altitude = this.fs.currentTrack.features[0].geometry.properties.data[wp.altitude].altitude
    }
    console.log(this.fs.currentTrack)
  }

  async search() {
    if (!this.fs.map || !this.fs.searchLayer) return;
    // Define a style function for the search results
    const styleSearch = (featureLike: FeatureLike) => {
      const geometryType = featureLike.getGeometry()?.getType();
      const blackPin = this.mapService.createPinStyle('black');
      if (geometryType === 'Point') return blackPin;
      if (geometryType === 'Polygon' || geometryType === 'MultiPolygon') {
        return new Style({
          stroke: new Stroke({ color: 'black', width: 2 }),
          fill: new Fill({ color: 'rgba(128, 128, 128, 0.5)' }),
        });
      }
      return this.mapService.setStrokeStyle('black');
    };
    this.fs.searchLayer.setStyle(styleSearch);
    this.isSearchPopoverOpen = true;
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
      trackName = data.respo7nse.trackName;
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
      console.log(rawCoordinates, rawProperties)
      // Increase the number of coordinates
      const result = await this.fs.adjustCoordinatesAndProperties(rawCoordinates, rawProperties, 0.025);
      if (result) {
        var num = result.newCoordinates.length;
        this.fs.archivedTrack = {
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
    if (this.fs.archivedTrack) await this.mapService.displayArchivedTrack();
  }

  // 42. MORNING TASK
  async morningTask() {
    // Run updates outside of Angular's zone to avoid change detection overhead
    this.zone.runOutsideAngular(async () => {
      try{
        // Filter altitude data
        const num = this.fs.currentTrack?.features[0].geometry.coordinates.length ?? 0;
        await this.filterAltitude(this.fs.currentTrack, num - this.fs.lag - 1);
        // compute distances
        await this.computeDistances();
        // Filter speed data
        if (this.fs.currentTrack) this.fs.currentTrack.features[0].geometry.properties.data = await this.fs.filterSpeed(
          this.fs.currentTrack.features[0].geometry.properties.data,
          this.speedFiltered + 1
        );
        this.speedFiltered = num - 1;
        // Update HTML values
        await this.htmlValues();
        // display current track
        await this.mapService.displayCurrentTrack(this.fs.currentTrack);
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
    // Hide current track
    this.fs.currentLayer?.setVisible(false);
    // Optional: adjust zoom/scale if needed
    const scale = 1;
    const mapWrapperElement: HTMLElement | null = document.getElementById('map-wrapper');
    if (mapWrapperElement) {
      mapWrapperElement.style.transform = `scale(${scale})`;
    }
    // Convert map to image
    let success = false;
    if (this.fs.map) {
      success = await this.exportMapToImage(this.fs.map);
    }
    // Restore visibility of current track
    this.fs.currentLayer?.setVisible(true);
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
    this.fs.archivedTrack = track;
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

  closeAllPopovers() {
    this.isConfirmStopOpen = false;
    this.isConfirmDeletionOpen = false;
    this.isRecordPopoverOpen = false;
    this.isSearchPopoverOpen = false;
  }

  async selectResult(location: LocationResult | null) {
    if (location?.boundingbox && location?.geojson) {
      this. isSearchPopoverOpen = false;
      const [minLat, maxLat, minLon, maxLon] = location.boundingbox.map(Number);
      const latRange = maxLat - minLat;
      const lonRange = maxLon - minLon;
      const padding = Math.max(Math.max(latRange, lonRange) * 0.1, 0.005);
      const extent = [minLon - padding, minLat - padding, maxLon + padding, maxLat + padding];
      const geojson = typeof location.geojson === 'string'
        ? JSON.parse(location.geojson)
        : location.geojson;
      // readFeatures assumes geographic coordinates since useGeographic() is active
      const features = new GeoJSON().readFeatures(geojson);
      if (features.length > 0) {
        const source = this.fs.searchLayer?.getSource();
        source?.clear();
        source?.addFeatures(features);
        this.fs.map?.getView().fit(extent, { duration: 800 }); // small animation
      }
    }
  }

  async openList() {
    if (!this.query) return;
    this.loading = true;
    try {
      let url: string;
      let headers: any = { 'Accept': 'application/json' };

      if (this.fs.geocoding === 'mapTiler') {
        // 🌍 MapTiler forward geocoding
        url = `https://api.maptiler.com/geocoding/${encodeURIComponent(this.query)}.json?key=${global.mapTilerKey}`;
      } else {
        // 🌍 Nominatim forward geocoding (default)
        url = `https://nominatim.openstreetmap.org/search?format=json&polygon_geojson=1&q=${encodeURIComponent(this.query)}`;
        headers['User-Agent'] = 'YourAppName/1.0 (you@example.com)'; // required
      }

      const response = await CapacitorHttp.get({ url, headers });

      if (this.fs.geocoding === 'mapTiler') {
        // ✅ Normalize MapTiler results
        const features = response.data?.features ?? [];
        this.results = features.map((f: any, idx: number) => {
          const [lon, lat] = f.geometry.coordinates;

          // compute bbox from geometry if not provided
          const coords = f.geometry.type === 'Point'
            ? [[lon, lat]]
            : f.geometry.coordinates.flat(Infinity).reduce((acc: any[], v: any, i: number) => {
                if (i % 2 === 0) acc.push([v]);
                else acc[acc.length - 1].push(v);
                return acc;
              }, []);

          const lons = coords.map((c: any) => c[0]);
          const lats = coords.map((c: any) => c[1]);
          const boundingbox = [
            Math.min(...lats), // south
            Math.max(...lats), // north
            Math.min(...lons), // west
            Math.max(...lons)  // east
          ];

          return {
            lat,
            lon,
            name: f.text ?? '(no name)',
            display_name: f.place_name ?? f.text ?? '(no name)',
            short_name: f.text ?? f.place_name ?? '(no name)', // 👈 added
            type: f.place_type?.[0] ?? 'unknown',
            place_id: f.id ?? idx,
            boundingbox,
            geojson: f.geometry
          };
        });
      } else {
        // ✅ Normalize Nominatim results
        const rawResults = Array.isArray(response.data) ? response.data : [];
        this.results = rawResults.map((r: any) => {
          const display = r.display_name ?? '(no name)';
          const short = r.address?.road
            ? [r.address.road, r.address.house_number].filter(Boolean).join(' ')
            : (r.address?.city ?? r.address?.town ?? r.address?.village ?? display);

          return {
            lat: parseFloat(r.lat),
            lon: parseFloat(r.lon),
            name: display,
            display_name: display,
            short_name: this.shortenName(display),
            type: r.type ?? 'unknown',
            place_id: r.place_id,
            boundingbox: r.boundingbox?.map((n: string) => parseFloat(n)) ?? [],
            geojson: r.geojson ?? null
          };
        });
      }

    } catch (error) {
      console.error(`Error fetching ${this.fs.geocoding} geocoding data:`, error);
      this.fs.displayToast(this.translate.instant('SEARCH.NETWORK_ERROR'));
      this.results = [];
    } finally {
      this.loading = false;
    }
  }

  async startDictation() {
    const available = await SpeechRecognition.available();
    if (!available.available) {
      console.log('❌ Speech recognition not available');
      return;
    }

    const permission = await SpeechRecognition.checkPermissions();
    if (permission.speechRecognition !== 'granted') {
      await SpeechRecognition.requestPermissions();
    }

    const lang = this.languageService.getCurrentLangValue();
    await SpeechRecognition.start({
      language: lang,
      partialResults: true,
      popup: false,
    });

    SpeechRecognition.addListener('partialResults', (data: { matches: string[] }) => {
      this.zone.run(() => {
        this.query = data.matches[0] || '';
      });
      console.log('🎤 Heard:', data.matches[0]);
    });

    SpeechRecognition.addListener('listeningState', (data: { status: 'started' | 'stopped' }) => {
      console.log('🎧 Listening state:', data.status);
    });
  }

  private shortenName(fullName: string): string {
    if (!fullName) return '(no name)';
    const parts = fullName.split(',').map(p => p.trim());
    return parts.slice(0, 2).join(', ');
  }

}


