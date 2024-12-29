import { Location, Extremes, Bounds, Track, TrackDefinition, Data, Waypoint } from '../../globald';
import { FunctionsService } from '../services/functions.service';
import { Component, NgZone, Injectable, OnInit } from '@angular/core';
import { IonicModule } from '@ionic/angular';
//import { ExploreContainerComponent } from '../explore-container/explore-container.component';
import { global } from '../../environments/environment';
import { CommonModule, DecimalPipe, DatePipe } from '@angular/common';
import { Router } from '@angular/router';
import { registerPlugin } from "@capacitor/core";
const BackgroundGeolocation: any = registerPlugin("BackgroundGeolocation");
import { Storage } from '@ionic/storage-angular';
import { FormsModule } from '@angular/forms';
import { CUSTOM_ELEMENTS_SCHEMA, ChangeDetectorRef } from '@angular/core';
import { register } from 'swiper/element/bundle';
register();
import Map from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import OSM from 'ol/source/OSM';
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import LineString from 'ol/geom/LineString';
import { Circle as CircleStyle, Fill, Stroke, Icon, Style, Circle } from 'ol/style';
import { useGeographic } from 'ol/proj.js';
import { Zoom, ScaleLine, Rotate, OverviewMap } from 'ol/control'
import { App } from '@capacitor/app';
import { MultiLineString, MultiPoint } from 'ol/geom';
import { ForegroundService } from '@capawesome-team/capacitor-android-foreground-service';
import GeoJSON from 'ol/format/GeoJSON';
import { fromLonLat } from 'ol/proj';
import { Coordinate } from 'ol/coordinate';
import Polyline from 'ol/format/Polyline.js';
import { Source } from 'ol/source';
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

useGeographic();

@Injectable({
  providedIn: 'root',
})

@Component({
  selector: 'app-tab1',
  templateUrl: 'tab1.page.html',
  styleUrls: ['tab1.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule ],
  providers: [DecimalPipe, DatePipe ],
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
  
export class Tab1Page {

  watcherId: any = 0;
  currentTrack: Track | undefined = undefined;
  archivedTrack: Track | undefined = undefined;
  track: any;
  vMax: number = 400;
  currentCtx: [CanvasRenderingContext2D | undefined, CanvasRenderingContext2D | undefined] = [undefined, undefined];
  archivedCtx: [CanvasRenderingContext2D | undefined, CanvasRenderingContext2D | undefined] = [undefined, undefined];
  canvasNum: number = 400; // canvas size
  margin: number = 10;
  threshold: number = 20;
  altitudeThreshold: number = 20;
  properties: (keyof Data)[] = ['altitude', 'compSpeed'];
  gridsize: string = '-';
  map: any;
  currentMarkers: any = [null, null, null];
  archivedMarkers: any = [null, null, null];
  multiMarker: any | undefined = undefined;
  archivedWaypoints: any | undefined = undefined; 
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
  currentUnit: string = '' // time unit for canvas ('s' seconds, 'min' minutes, 'h' hours)
  archivedUnit: string = '' // time unit for canvas ('s' seconds, 'min' minutes, 'h' hours)
  archivedFeature: any;
  currentFeature: any;
  multiFeature: any; 
  threshDist: number = 0.00000036; // 0.0006 ** 2;
  lastN: number = 0;
  archivedCanvasVisible: boolean = false;
  currentCanvasVisible: boolean = false;
  currentLayer: any;
  archivedLayer: any;
  multiLayer: any;
  foreground: boolean = true;
  extremes: Extremes | undefined
  openCanvas: boolean = true;
  status: 'black' | 'red' | 'green' = 'black'
  audioCtx: AudioContext | null = null;
  beepInterval: any;
  language: 'ca' | 'es' | 'other' = 'other';
  languageIndex: 0 | 1 | 2 = 2; // Default to 'other'
  popText: [string, string, number] | undefined = undefined;

  translations = {
    arcTitle: ['TRAJECTE DE REFERÈNCIA','TRAYECTO DE REFERENCIA','REFERENCE TRACK'],
    curTitle: ['TRAJECTE ACTUAL','TRAYECTO ACTUAL','CURRENT TRACK'],
    distance: ['Distància','Distancia','Distance'],
    eGain: ['Desnivell positiu','Desnivel positivo','Elevation gain'],
    eLoss: ['Desnivell negatiu','Desnivel negativo','Elevation loss'],
    time: ['Temps', 'Tiempo','Time'],
    motionTime: ['Temps en moviment','Tiempo en movimiento','In-motion time'],
    points: ['Punts gravats','Puntos grabados','Recorded points'],
    altitude: ['Altitud actual','Altitud actual','Current altitude'],
    speed: ['Velocitat actual','Velocidad actual','Current speed'], 
    avgSpeed: ['Velocitat mitjana','Velocidad nedia','Average speed'],
    motionAvgSpeed: ['Vel. mitjana en moviment','Vel. nedia en movimiento.','In-motion average speed'],
    canvasAltitude: ['ALTITUD (m) vs DISTÀNCIA (km)','ALTITUD (m) vs DISTANCIA (km)','ALTITUDE (m) vs DISTANCE (km)'],
    canvasSpeed: ['VELOCITAT (km/h) vs TEMPS','VELOCIDAD (km/h) vs TIEMPO','SPEED (km/h) vs TIME']
  }
  get arcTitle(): string { return this.translations.arcTitle[global.languageIndex]; }
  get curTitle(): string { return this.translations.curTitle[global.languageIndex]; }
  get distance(): string { return this.translations.distance[global.languageIndex]; }
  get eGain(): string { return this.translations.eGain[global.languageIndex]; }
  get eLoss(): string { return this.translations.eLoss[global.languageIndex]; }
  get time(): string { return this.translations.time[global.languageIndex]; }
  get motionTime(): string { return this.translations.motionTime[global.languageIndex]; }
  get points(): string { return this.translations.points[global.languageIndex]; }
  get altitude(): string { return this.translations.altitude[global.languageIndex]; }
  get speed(): string { return this.translations.speed[global.languageIndex]; }
  get avgSpeed(): string { return this.translations.avgSpeed[global.languageIndex]; }
  get motionAvgSpeed(): string { return this.translations.motionAvgSpeed[global.languageIndex]; }
  get canvasAltitude(): string { return this.translations.canvasAltitude[global.languageIndex]; }
  get canvasSpeed(): string { return this.translations.canvasSpeed[global.languageIndex]; }
  get layerVisibility(): string { return global.layerVisibility; }

  constructor(
    public fs: FunctionsService,
    private router: Router,
    public storage: Storage,
    private zone: NgZone,
    private cd: ChangeDetectorRef,
    //public popoverController: PopoverController,
    private modalController: ModalController,
    private nominatimService: NominatimService
  ) {
    this.listenToAppStateChanges();
  }

  /* FUNCTIONS

  1. listenToAppStateChanges
  2. ngOnInit
  3. addFileListener
  4. ionViewDidEnter
  5. centerAllTracks
  6. displayCurrentTrack
  7. startTracking
  8. removeTrack
  9. stopTracking
  10. confirm
  11. setTrackDetails
  12. showValidationAlert
  13. saveFile
  14. gotoPage
  15. gotoMap
  16. gotoData
  17. buildGeoJson
  18. onRoute
  19. show
  20. displayArchivedTrack
  21. updateAllCanvas
  22. setMapView
  23. firstPoint
  24. createMap 
  25. createCanvas
  26. grid
  27. gridValue
  28. filterAltitude
  29. createLayers
  30. updateCanvas
  31. displayAllTracks
  32. handleMapClick()
  33. drawCircle()
  34. averageSpeed()

  drawPoint
  computeMinMaxProperty
  retrieveTrack

  */

  // 1. LISTEN TO CHANGES IN FOREGROUND - BACKGROUND
  listenToAppStateChanges() {
    App.addListener('appStateChange', (state) => {
      this.foreground = state.isActive;  // true if in foreground, false if in background
      // Went to background
      if (!this.foreground) this.startBeepInterval();
      // Went to background
      else this.stopBeepInterval();
      // Exit early if the app is going to the background or there is no current track
      if (!state.isActive || !this.currentTrack) return;
      // Run updates outside of Angular's zone to avoid change detection overhead
      this.zone.runOutsideAngular(async () => {
        try{
          // display current track
          await this.displayCurrentTrack();
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
          // average speed
          await this.averageSpeed();
          // Update HTML values
          await this.htmlValues();
          // Trigger Angular's change detection
          this.cd.detectChanges();
          // Update the canvas
          await this.updateAllCanvas(this.currentCtx, this.currentTrack);
          console.log('Transition.',this.currentTrack?.features[0].properties.totalNumber || 0, 'points. Process completed')
        } catch (error) {
          console.error('Error during foreground transition processing:', error);
        }
      });  
    });
  }

  // 2. ON INIT ////////////////////////////////
  async ngOnInit() {
    try {
      // create storage 
      await this.storage.create();
      // retrieve collection
      global.collection = await this.fs.storeGet('collection') || [];
      // Determine language
      this.determineLanguage();
      // Determine line color
      this.determineColors();
      // elements shown, elements hidden
      this.show('map', 'block');
      this.show('search', 'block');
      this.show('data', 'none');
      this.show('start', 'block');
      this.show('stop', 'none');
      this.show('alert', 'none');
      this.show('save', 'none');
      this.show('trash', 'none');
      this.show('mapbutton', 'none');
      this.show('databutton', 'block');
      // uncheck all
      await this.fs.uncheckAll();
      // create canvas
      await this.createCanvas();
      // create map
      await this.createMap()
      // Listen for app URL open events (e.g., file tap)
      this.addFileListener();
    } catch (error) {
      console.error('Error during ngOnInit:', error);
    }  
  }

  // 3. LISTENING FOR OPEN EVENTS 
  addFileListener() {
    // Listen for app URL open events (e.g., file tap)
    App.addListener('appUrlOpen', async (data: any) => {
      this.gotoPage('tab1');
      await this.processUrl(data);
      global.layerVisibility = 'archived'
      // retrieve archived track
      this.archivedTrack = await this.fs.retrieveTrack() ?? this.archivedTrack;
      if (this.archivedTrack) this.extremes = await this.fs.computeExtremes(this.archivedTrack);
      // assign visibility
      if (this.multiLayer) await this.multiLayer.setVisible(false);
      // iF archived track is available...
      if (this.archivedTrack) {
        // show archived track
        await this.showArchivedTrack();
        // Set map view for archived track if no current track
        if (!this.currentTrack) {
          await this.setMapView(this.archivedTrack);
        }
        // Show canvas for archived track
        await this.showCanvas('a', 'block');
      }  
    });
  }

  // 4. ION VIEW DID ENTER
  async ionViewDidEnter() {
    try {
      // retrieve collection
      if (global.collection.length <= 0) global.collection = await this.fs.storeGet('collection') || [];
      // change map provider
      await this.changeMapProvider();
      // only visible for layerVisibility == 'archived' 
      await this.showCanvas('a','none')
      // archived visible
      if (global.layerVisibility == 'archived') {
        // retrieve archived track
        this.archivedTrack = await this.fs.retrieveTrack() ?? this.archivedTrack;
        if (this.archivedTrack) this.extremes = await this.fs.computeExtremes(this.archivedTrack);
        // assign visibility
        if (this.multiLayer) await this.multiLayer.setVisible(false);
        // iF archived track is available...
        if (this.archivedTrack) {
          // show archived track
          await this.showArchivedTrack();
          // Set map view for archived track if no current track
          if (!this.currentTrack) {
            await this.setMapView(this.archivedTrack);
          }
          // Show canvas for archived track
          await this.showCanvas('a', 'block');
        }
      }
      else if (global.layerVisibility == 'multi') {
        // hide archived track
        try {
          this.archivedLayer.setVisible(false); 
        } catch (error) {}
        this.status = 'black'
        // display all tracks
        await this.displayAllTracks();
        // center all tracks
        if (!this.currentTrack) await this.centerAllTracks();
      }
      else {
        this.status = 'black'
        // Hide archived and multi layers
        if (this.archivedLayer) await this.archivedLayer.setVisible(false);
        if (this.multiLayer) await this.multiLayer.setVisible(false);
      }
      // update canvas
      this.currentUnit = await this.updateAllCanvas(this.currentCtx, this.currentTrack);
      // center current track and show canvas
      if (this.currentTrack) {
        await this.setMapView(this.currentTrack);
        await this.showCanvas('c','block');        
      }
    } catch (error) {
      console.error('Error in ionViewDidEnter:', error);
    }  
  }

  // 5. CENTER ALL TRACKS
  async centerAllTracks() {
    // get current position
    let currentPosition: [number, number] | undefined = await this.fs.getCurrentPosition();
    // center map
    await this.map.getView().setCenter(currentPosition);
    await this.map.getView().setZoom(8);
  }

  // 6. DISPLAY CURRENT TRACK
  async displayCurrentTrack() {
    // Ensure current track and map exist
    if (!this.currentTrack || !this.map) return;
    // Number of points in the track
    const coordinates = this.currentTrack.features[0].geometry.coordinates;
    const num = coordinates.length;
    // Ensure there are enough points to display
    if (num < 2) return;
    // Set line geometry and style
    this.currentFeature.setGeometry(new LineString(coordinates));
    this.currentFeature.setStyle(this.fs.setStrokeStyle(global.currentColor));
    // Set the last point as the marker geometry  
    this.currentMarkers[1].setGeometry(new Point(coordinates[num - 1]));
    // Adjust map view at specific intervals
    if (num === 5 || num === 10 || num === 25 || num % 50 === 0) {
      await this.setMapView(this.currentTrack);
    }
  }

  // 7. START TRACKING /////////////////////////////////
  async startTracking() {
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
      title: 'Tracking Your Location.',
      body: 'Location tracking in progress.',
      smallIcon: 'splash.png',     
    });
    console.log ('Foreground service started successfully')
    // Reset current track and related variables
    this.currentTrack = undefined;
    this.currentUnit = await this.updateAllCanvas(this.currentCtx, this.currentTrack);
    try { 
      this.currentLayer.setVisible(false); 
    } catch (error) { 
      console.warn("Error hiding current layer:", error); 
    }
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
      backgroundMessage: "Cancel to prevent battery drain",
      backgroundTitle: "Tracking Your Location.",
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
    this.show('start', 'none');
    this.show('stop', 'block');
    this.show('trash', 'none');
    this.show('save', 'none');
  }

  // 8. REMOVE TRACK ///////////////////////////////////
  async removeTrack() {
    // show / hide elements
    this.show('start', 'block');
    this.show('stop', 'none');
    this.show('alert', 'none');
    this.show('save', 'none');
    this.show('trash', 'none');
    // Reset current track and corresponding canvases
    this.status = 'black'
    this.currentTrack = undefined;
    this.currentUnit = await this.updateAllCanvas(this.currentCtx, this.currentTrack);
    // Toast
    const toast = ["El trajecte actual s'ha esborrat",'El trayecto actual se ha eliminado','The current track has been removed']
    this.fs.displayToast(toast[global.languageIndex]);
    try{if (this.currentLayer) await this.currentLayer.setVisible(false);} catch{}
  }

  // 9. STOP TRACKING //////////////////////////////////
  async stopTracking() {
    // show / hide elements
    this.show('start', 'none');
    this.show('stop', 'none');
    this.show('alert', 'none');
    this.show('save', 'block');
    this.show('trash', 'block');
    // Set the red marker at the last coordinate
    const num = this.currentTrack?.features[0].geometry.coordinates.length ?? 0;
    if (num > 0 && this.currentMarkers[2] && this.currentTrack) {
      this.currentMarkers[2].setGeometry(new Point(
        this.currentTrack.features[0].geometry.coordinates[num - 1]
      ));
      this.currentMarkers[2].setStyle(this.drawCircle('red'));
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
    // update canvas
    this.currentUnit = await this.updateAllCanvas(this.currentCtx, this.currentTrack);
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
    const text = ['Si','Si','Yes']
    const cssClass = 'alert yellowAlert';
    const inputs: never[] = [];
    const buttons =  [
      global.cancelButton,
      {
        text: text[global.languageIndex],
        cssClass: 'alert-button',
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
    const cssClass = 'alert yellowAlert'
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
    this.show('start', 'none');
    this.show('stop', 'none');
    this.show('alert', 'none');
    this.show('save', 'none');
    this.show('trash', 'block');
  }

  // 14. GO TO PAGE ... //////////////////////////////
  async gotoPage(option: string) {
    this.router.navigate([option]);
  }

  // 15. GO TO MAP ////////////////////////////
  async gotoMap() {
    // Show map and adjust buttons
    this.show('map', 'block');
    this.show('search', 'block');
    this.show('data', 'none');
    this.show('mapbutton', 'none');
    this.show('databutton', 'block');
    // Center map based on available track
    if (this.currentTrack) {
      await this.setMapView(this.currentTrack);
    } else if (this.archivedTrack) {
      await this.setMapView(this.archivedTrack);
    }
  }

  // 16. GO TO DATA ////////////////////////////
  async gotoData() {
    // Show data and adjust buttons
    global.mapVisible = false
    this.show('map', 'none');
    this.show('search', 'none');
    this.show('data', 'block');
    this.show('mapbutton', 'block');
    this.show('databutton', 'none');
    // Update canvas after view change
    setTimeout(async () => {
      if (this.currentTrack) {
        this.currentUnit = await this.updateAllCanvas(this.currentCtx, this.currentTrack);
      }
    }, 200);
  }

  // 17. BUILD GEOJSON ////////////////////////////////////
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
    let num = this.currentTrack.features[0].geometry.coordinates.length;
    if ((num % 3 == 0) && (this.archivedTrack)) {
      await this.checkWhetherOnRoute();
    }
    return true;
  }

  // 18. CHECK WHETHER OR NOT WE ARE ON ROUTE //////////////////////
  async onRoute() {
    // Return 'black' if conditions aren't met
    if (!this.currentTrack || !this.archivedTrack || global.layerVisibility != 'archived') return 'black';
    // Define current and archived coordinates
    const currentCoordinates = this.currentTrack.features[0].geometry.coordinates;
    const archivedCoordinates = this.archivedTrack.features[0].geometry.coordinates;
    if (currentCoordinates.length === 0 || archivedCoordinates.length === 0) return 'black';
    // Define parameters
    const bounding = (this.status === 'red' ? 0.3 : 1) * Math.sqrt(this.threshDist);
    const reduction = Math.max(Math.round(archivedCoordinates.length / 2000), 1);
    const multiplier = 10;
    const skip = 5;
    // Get the point to check from the current track
    const point = currentCoordinates[currentCoordinates.length - 1];
    // Boundary check
    if (this.extremes) {
      if (point[0] < this.extremes.minX - bounding || point[0] > this.extremes.maxX + bounding ||
          point[1] < this.extremes.minY - bounding || point[1] > this.extremes.maxY + bounding) {
        return 'red';
      }
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
    console.log('checked forward')
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
    console.log('checked backward')
    // No match found
    return 'red';
  }
  
  // 19. SHOW / HIDE ELEMENTS ///////////////////////////////// 
  async show(id: string, action: 'block' | 'none' | 'inline' | 'flex') {
    const obj = document.getElementById(id);
    if (obj) {
      obj.style.display = action;
    }
  }

  // 20. DISPLAY AN ARCHIVED TRACK /////////////////////////
  async displayArchivedTrack() {
    // Ensure the map and archived track exist
    if (!this.map || !this.archivedTrack) return;
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
      this.archivedMarkers[0].setStyle(this.drawCircle('green'));
      this.archivedMarkers[2].setGeometry(new Point(coordinates[num - 1]));
      this.archivedMarkers[2].setStyle(this.drawCircle('red'));
    }
    // Display waypoints
    const waypoints = this.archivedTrack.features[0].waypoints || []
    const multiPoint = waypoints.map(point => [point.longitude, point.latitude]);
    this.archivedWaypoints.setGeometry(new MultiPoint(multiPoint));
    this.archivedWaypoints.set('waypoints', waypoints);
    this.archivedWaypoints.setStyle(this.drawCircle('yellow'));
  }

  // 21. UPDATE ALL CANVAS ////////////////////////////////
  async updateAllCanvas(context: Record<string, any>, track: Track | undefined): Promise<string> {
    // Validate context
    if (!context) {
      this.openCanvas = false;
      return '';
    }
    // Open canvas
    this.openCanvas = true;
    try {
      // Hide canvas for the current or archived track
      if (track === this.currentTrack || track === this.archivedTrack) {
        const type = track === this.currentTrack ? 'c' : 'a';
        await this.showCanvas(type, 'none');
      }
      // Update canvas
      let lastUnit = '';
      for (const [index, property] of Object.entries(this.properties)) {
        const mode = property === 'altitude' ? 'x' : 't';
        lastUnit = await this.updateCanvas(context[index], track, property, mode);
      }
      return lastUnit;
    } finally {
      // Close canvas
      this.openCanvas = false;
    }
  }
  
  // 22. SET MAP VIEW /////////////////////////////////////////
  async setMapView(track: any) {
    var boundaries: Extremes | undefined;
    if (track == this.archivedTrack) boundaries = this.extremes
    else boundaries = await this.fs.computeExtremes(track)
    if (!boundaries) return;
    // Set a minimum area
    const minVal = 0.002;
    if ((boundaries.maxX - boundaries.minX < minVal) && (boundaries.maxY - boundaries.minY < minVal)) {
      const centerX = 0.5 * (boundaries.minX + boundaries.maxX);
      const centerY = 0.5 * (boundaries.minY + boundaries.maxY);
      boundaries.minX = centerX - minVal / 2;
      boundaries.maxX = centerX + minVal / 2;
      boundaries.minY = centerY - minVal / 2;
      boundaries.maxY = centerY + minVal / 2;
    }
    // map extent
    var extent = [boundaries.minX, boundaries.minY, boundaries.maxX, boundaries.maxY];
    // map view
    setTimeout(() => {
      this.map.getView().fit(extent, {
        size: this.map.getSize(),
        padding: [50, 50, 50, 50],
        duration: 1000  // Optional: animation duration in milliseconds
      }, 100);
    })
  }
    
  // 23. FIRST POINT OF THE TRACK /////////////////////////////
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
          totalNumber: 0,
          currentAltitude: undefined, 
          currentSpeed: undefined
        },
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
    // Add location data to the track
    this.currentTrack.features[0].geometry.properties.data.push({
      altitude: location.altitude,
      speed: location.speed,
      time: location.time,
      compSpeed: 0,
      distance: 0,
    });
    // Display waypoint button
    this.show('alert', 'block');
    // Add coordinates for the first point
    this.currentTrack.features[0].geometry.coordinates.push(
      [location.longitude, location.latitude]
    );
    // Set the geometry and style for the first marker
    if (this.currentMarkers[0]) {
      await this.currentMarkers[0].setGeometry(new Point(
        this.currentTrack.features[0].geometry.coordinates[0]
      ));
      await this.currentMarkers[0].setStyle(this.drawCircle('green'));
    }
    // Set the geometry and style for the second marker (for tracking progress)
    const num = this.currentTrack.features[0].geometry.coordinates.length;
    if (this.currentMarkers[1]) {
      await this.currentMarkers[1].setGeometry(new Point(
        this.currentTrack.features[0].geometry.coordinates[num - 1]
      ));
      await this.currentMarkers[1].setStyle(this.drawCircle('blue'));
    }
    // Reset the style for the third marker (if applicable)
    if (this.currentMarkers[2]) {
      await this.currentMarkers[2].setStyle(undefined);
    }
    // Make the layer visible, with improved error handling
    try {
      await this.currentLayer.setVisible(true);
    } catch (error) {}
    // display number of points (1)
    this.currentTrack.features[0].properties.totalNumber = 1;
    // show current canvas
    await this.showCanvas('c','block')  
  }
  
  // 24. CREATE MAP /////////////////////////////
  async createMap() {
    // current position
    const currentPosition = await this.fs.getCurrentPosition();
    // create layers
    await this.createLayers();
    // Create the map layer
    var olLayer: any;
    var credits: string = '';
    if (this.mapProvider == 'OpenStreetMap') {
      credits = '© OpenStreetMap contributors'
      olLayer = new TileLayer({ source: new OSM() })
    }
    else if (this.mapProvider == 'OpenTopoMap') {
      credits = '© OpenStreetMap contributors, SRTM | Map style: © OpenTopoMap (CC-BY-SA)';
      olLayer = new TileLayer({
        source: new XYZ({
          url: 'https://{a-c}.tile.opentopomap.org/{z}/{x}/{y}.png',
        })
      })
    }
    else if (this.mapProvider == 'ICGC') {
      credits = 'Institut Cartogràfic i Geològic de Catalunya'
      olLayer = new TileLayer({ 
        source: new XYZ({
          url: 'https://tiles.icgc.cat/xyz/mtn1000m/{z}/{x}/{y}.jpeg'
        })
      })
    }
    else if (this.mapProvider == 'IGN') {
      credits = 'Instituto Geográfico Nacional (IGN)'
      olLayer = new TileLayer({ 
        source: new XYZ({
          url: 'https://www.ign.es/wmts/mapa-raster?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=MTN&STYLE=default&TILEMATRIXSET=GoogleMapsCompatible&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image/jpeg',
        }),
      });
    }
    // Create the map view
    var view = new View({
      center: currentPosition,
      zoom: 8,
    });
    // Controls
    const controls = [ new Zoom(), new ScaleLine(), new Rotate()]
    // Create the map
    this.map = new Map({
      target: 'map',
      layers: [olLayer, this.currentLayer, this.archivedLayer, this.multiLayer],
      view: view,
      controls: controls
    });
    // Report
    this.fs.displayToast(`${credits}`) 
    // Set up click events
    this.map.on('click', this.handleMapClick.bind(this));
  }
  
  // 25. CREATE CANVASES //////////////////////////////////////////
  async createCanvas() {
    this.openCanvas = true;
    let currentCanvas: HTMLCanvasElement | undefined;
    let archivedCanvas: HTMLCanvasElement | undefined;
    // show canvases
    await this.showCanvas('c','block')
    await this.showCanvas('a','block')
    // Get window size for canvas size
    const size = Math.min(window.innerWidth, window.innerHeight);
    // Loop through properties to create canvases and their contexts
    for (var i in this.properties) {
      // Get canvas for current track
      currentCanvas = document.getElementById('currentCanvas' + i) as HTMLCanvasElement;
      if (currentCanvas) {
        currentCanvas.width = size;
        currentCanvas.height = size;
        const ctx = currentCanvas.getContext("2d");
        if (ctx) this.currentCtx[i] = ctx
      } else {
        console.error(`Canvas with ID currentCanvas${i} not found.`);
      }
      // Get canvas for archived track
      archivedCanvas = document.getElementById('archivedCanvas' + i) as HTMLCanvasElement;
      if (archivedCanvas) {
        archivedCanvas.width = size;
        archivedCanvas.height = size;
        const ctx = archivedCanvas.getContext("2d");
        if (ctx) this.archivedCtx[i] = ctx
      } else {
        console.error(`Canvas with ID archivedCanvas${i} not found.`);
      }
    }
    // Define canvasNum as height and width
    this.canvasNum = size;
    // Hide canvases after setup
    await this.showCanvas('c', 'none');
    await this.showCanvas('a', 'none');
    this.openCanvas = false;
  }

  // 26. GRID /////////////////////////////////////////////////////
  async grid(  ctx: CanvasRenderingContext2D | undefined,
    xMin: number,
    xMax: number,
    yMin: number,
    yMax: number,
    a: number,
    d: number,
    e: number,
    f: number) {
      // Return if there is no canvascontext
      if (!ctx) return;
      // Define fonts and styles
      ctx.font = "15px Arial"
      ctx.save();
      ctx.setLineDash([5, 15]);
      ctx.strokeStyle = 'black';
      ctx.fillStyle = 'black'
      // Define line spacing and position
      const gridx = this.gridValue(xMax - xMin);
      const gridy = this.gridValue(yMax - yMin);
      const fx = Math.ceil(xMin / gridx);
      const fy = Math.ceil(yMin / gridy);
      // Draw vertical lines
      for (var xi = fx * gridx; xi <= xMax; xi += gridx) {
        ctx.beginPath();
        ctx.moveTo(xi * a + e, yMin * d + f);
        ctx.lineTo(xi * a + e, yMax * d + f);
        ctx.stroke();
        ctx.fillText(xi.toLocaleString(), xi * a + e + 2, yMax * d + f + 15)
      }
      // Draw horizontal lines
      for (var yi = fy * gridy; yi <= yMax; yi += gridy) {
        ctx.beginPath();
        ctx.moveTo(xMin * a + e, yi * d + f);
        ctx.lineTo(xMax * a + e, yi * d + f);
        ctx.stroke();
        ctx.fillText(yi.toLocaleString(), xMin * a + e + 2, yi * d + f - 10)
      }
      // Restore context
      ctx.restore();
      ctx.setLineDash([]);
  }

  // 27. DETERMINATION OF GRID STEP //////////////////////
  gridValue(dx: number) {
    const nx = Math.floor(Math.log10(dx));
    const x = dx / (10 ** nx);
    if (x < 2.5) return 0.5 * (10 ** nx);
    else if (x < 5) return 10 ** nx;
    else return 2 * (10 ** nx);
  }

  // SHOW ARCHIVED TRACK ///////////////////////////
  async showArchivedTrack() {
    try {
      this.archivedLayer.setVisible(true);  // No need for await
    } catch (error) {}
    this.archivedUnit = await this.updateAllCanvas(this.archivedCtx, this.archivedTrack);
    await this.showCanvas('a', 'block');
    await this.displayArchivedTrack();
  }

  // 28. FI8LTER ALTITUDE /////////////////////////////
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

  // 29. CREATE FEATURES /////////////////////////////
  async createLayers() {
    // create features to hold current track and markers
    this.currentMarkers[2] = new Feature({ geometry: new Point([0, 40]) });
    this.currentMarkers[1] = new Feature({ geometry: new Point([0, 40]) });
    this.currentMarkers[0] = new Feature({ geometry: new Point([0, 40]) });
    this.currentFeature = new Feature({ geometry: new LineString([[0, 40], [0, 40]]) });
    // create features to hold multiple track and markers
    this.multiFeature = new Feature({ geometry: new MultiLineString([[[0, 40], [0, 40]]]) });
    this.multiMarker = new Feature({ geometry: new MultiPoint([0, 40]) });
    // create features to hold archived track, markers and waypoints
    this.archivedFeature = new Feature({ geometry: new LineString([[0, 40], [0, 40]]) });
    this.archivedMarkers[0] = new Feature({ geometry: new Point([0, 40]) });
    this.archivedMarkers[1] = new Feature({ geometry: new Point([0, 40]) });
    this.archivedMarkers[2] = new Feature({ geometry: new Point([0, 40]) });
    this.archivedWaypoints = new Feature({geometry: new MultiPoint([0, 40]) });  
    // Vector sources for current, archived and multiple tracks
    var csource = new VectorSource({ features: [this.currentFeature, ...this.currentMarkers] });
    var asource = new VectorSource({ features: [this.archivedFeature, ...this.archivedMarkers, this.archivedWaypoints] });
    var msource = new VectorSource({ features: [this.multiFeature, this.multiMarker] });
    // layers for current, archived and multiple tracks
    this.currentLayer = new VectorLayer({source: csource});
    this.archivedLayer = new VectorLayer({source: asource});
    this.multiLayer = new VectorLayer({source: msource});
  } 

  // 30. UPDATE CANVAS ///////////////////////////////////
  async updateCanvas(ctx: any, track: Track | undefined, propertyName: keyof Data, xParam: string) {
    var tUnit: string = ''
    if (!ctx) return tUnit;
    // Reset and clear the canvas
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvasNum, this.canvasNum);
    if (!track) return tUnit;
    // Show appropriate canvas
    if (track === this.currentTrack) {
      await this.showCanvas('c', 'block');
    } else if (track === this.archivedTrack) {
      await this.showCanvas('a', 'block');
    }
    // Define data array
    const data = track.features[0].geometry.properties.data;
    const num = data.length ?? 0;
    if (num === 0) return tUnit;
    // Determine time/distance scale and units
    let xDiv: number = 1;
    let xTot: number;
    if (xParam === 'x') {
      xTot = data[num - 1].distance;
    } else {
      xTot = data[num - 1].time - data[0].time;
      if (xTot > 3600000) {
        tUnit = 'h';
        xDiv = 3600000;
      } else if (xTot > 60000) {
        tUnit = 'min';
        xDiv = 60000;
      } else {
        tUnit = 's';
        xDiv = 1000;
      }
      xTot /= xDiv;
    }
    // Compute min and max bounds
    const bounds = await this.fs.computeMinMaxProperty(data, propertyName);
    if (bounds.max === bounds.min) {
      bounds.max += 2;
      bounds.min -= 2;
    }
    // Compute scaling factors for drawing
    const scaleX = (this.canvasNum - 2 * this.margin) / xTot;
    const scaleY = (this.canvasNum - 2 * this.margin) / (bounds.min - bounds.max);
    const offsetX = this.margin;
    const offsetY = this.margin - bounds.max * scaleY;
    // Draw the line graph
    ctx.setTransform(scaleX, 0, 0, scaleY, offsetX, offsetY);
    ctx.beginPath();
    ctx.moveTo(0, bounds.min);
    for (const point of data) {
      const xValue = xParam === 'x' ? point.distance : (point.time - data[0].time) / xDiv;
      const yValue = point[propertyName];
      ctx.lineTo(xValue, yValue);
    }
    // Close the path and fill with color
    ctx.lineTo(xTot, bounds.min);
    ctx.closePath();
    ctx.fillStyle = 'yellow';
    ctx.fill();
    // Reset transformation matrix
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // Draw grid
    await this.grid(ctx, 0, xTot, bounds.min, bounds.max, scaleX, scaleY, offsetX, offsetY);
    return tUnit;
  }
  
  // 31. DISPLAY ALL ARCHIVED TRACKS
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
      if (coord) {
        multiLine.push(coord);
        multiPoint.push(coord[0]);
        multiKey.push(item.date);
      }
    }
    // Set geometries for multiFeature and multiMarker
    this.multiFeature.setGeometry(new MultiLineString(multiLine));
    this.multiMarker.setGeometry(new MultiPoint(multiPoint));
    this.multiMarker.set('multikey', multiKey) 
    // Apply styles to the features
    this.multiFeature.setStyle(this.fs.setStrokeStyle('black'));
    this.multiMarker.setStyle(this.drawCircle('green'));
    // Set visibility of multiLayer
    this.multiLayer.setVisible(true);
  }

  // 32. HANDLE MAP CLICK //////////////////////////////
  async handleMapClick(event: { coordinate: any; pixel: any }) {
    switch(global.layerVisibility) {
      case 'multi':
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
              this.extremes = await this.fs.computeExtremes(this.archivedTrack);
              this.multiLayer.setVisible(false);
              global.layerVisibility = 'archived';
              await this.showCanvas('a', 'block');
              await this.showArchivedTrack();
              await this.setMapView(this.archivedTrack);
            }
          }
        });
        break;
      case 'archived':
        let hit: boolean = false
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
        if (!hit) this.map.forEachFeatureAtPixel(event.pixel, async (feature: any) => {  
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

  // 33. DRAW A CIRCLE //////////////////////////////////////
  drawCircle(color: string): Style {
    return new Style({
      image: new CircleStyle({
        radius: 10,
        fill: new Fill({ color: color })
      })
    });
  }

  // 34. COMPUTE AVERAGE SPEEDS AND TIMES
  async averageSpeed() {
    if (!this.currentTrack) return;
    // get data array
    const data = this.currentTrack.features[0].geometry.properties.data;
    const num = data.length ?? 0;
    if (num < 2) return;
    // Compute time at rest
    for (let i = this.averagedSpeed + 1; i < num; i++) {
      if (data[i].compSpeed < this.vMin) {
        // Add the time spent at rest
        this.stopped += (data[i].time - data[i - 1].time) / 1000; // Convert milliseconds to seconds
      }
      this.averagedSpeed = i;  // Track last processed index
    }
    // Compute total time
    let totalTime = data[num - 1].time - data[0].time;
    totalTime = totalTime / 1000; // Convert milliseconds to seconds
    // Calculate average speed (in km/h)
    this.currentAverageSpeed = (3600 * data[num - 1].distance) / totalTime;
    // If the total time minus stopped time is greater than 5 seconds, calculate motion speed
    if (totalTime - this.stopped > 5) {
      this.currentMotionSpeed = (3600 * data[num - 1].distance) / (totalTime - this.stopped);
    }
    // Format the motion time
    this.currentMotionTime = this.fs.formatMillisecondsToUTC(1000 * (totalTime - this.stopped));  
  } 

  // COMPUTE DISTANCES //////////////////////////////////////
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

  // GET VALUES TO SHOW ON THE TABLE ////////////////////////////////////
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
  }

  // CHECK WHETHER OR NOT WE ARE ON ROUTE ///////////////////
  async checkWhetherOnRoute() {
    // Return early if essential conditions are not met
    if (!this.currentTrack || !this.archivedTrack || global.layerVisibility !== 'archived') return;
    // Store previous color for comparison
    const previousStatus = this.status;
    // Determine the current route color based on `onRoute` function
    this.status = await this.onRoute() || 'black';
    // Beep for off-route transition
    if (previousStatus === 'green' && this.status === 'red') {
      this.playDoubleBeep(1800, .3, 1, .15);
    }  
    // Beep for on-route transition  
    else if (previousStatus === 'red' && this.status === 'green') {
      this.playBeep(1800, .4, 1);
    }
  }

  // CASE OF LOCATIONS IN WRONG ORDER
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
      } else {
        break;
      }
    }
  }

  // SHOW / HIDE CANVAS OF CURRENT TRACK
  async showCanvas(track: string, visible: 'block' | 'none' | 'inline' | 'flex') {
    await this.show(track+'c0',visible);
    await this.show(track+'c1',visible); 
  }

  // ON LEAVE ////////////////////////////

  async ionViewWillLeave() {
    global.archivedPresent = !!this.archivedTrack;
  }

  // PLAY A BEEP /////////////////////////////////////
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

  // PLAY A DOUBLE BEEP
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
  
  // PARSE CONTENT OF A GPX FILE ////////////////////////
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
    // Parse waypoints
    const wptNodes = xmlDoc.getElementsByTagName("wpt");
    for (const wpt of Array.from(wptNodes)) {
      const latitude = parseFloat(wpt.getAttribute("lat") || "0");
      const longitude = parseFloat(wpt.getAttribute("lon") || "0");
      const altitude = parseFloat(wpt.getElementsByTagName("ele")[0]?.textContent || "0");
      const name = wpt.getElementsByTagName("name")[0]?.textContent || undefined;
      let comment = wpt.getElementsByTagName("cmt")[0]?.textContent || undefined;
      if (name == comment) comment = undefined
      //if (!name && !comment) continue
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
    // Track name
    track.features[0].properties.name = tracks[0].getElementsByTagName('name')[0]?.textContent || 'No Name';
    // Track comment
    track.features[0].properties.description = tracks[0].getElementsByTagName('cmt')[0]?.innerHTML || '';
    // Initialize distance
    let distance = 0;
    // Loopo on points
    for (let k = 0; k < trackPoints.length; k++) {
      const lat = parseFloat(trackPoints[k].getAttribute('lat') || '');
      const lon = parseFloat(trackPoints[k].getAttribute('lon') || '');
      const ele = parseFloat(trackPoints[k].getElementsByTagName('ele')[0]?.textContent || '0');
      const time = trackPoints[k].getElementsByTagName('time')[0]?.textContent;
      if (isNaN(lat) || isNaN(lon)) continue;
      // Add coordinates
      track.features[0].geometry.coordinates.push([lon, lat]);
      const num = track.features[0].geometry.coordinates.length;
      // Handle distance
      if (k > 0) {
        const prevCoord = track.features[0].geometry.coordinates[k - 1];
        distance += await this.fs.computeDistance(prevCoord[0], prevCoord[1], lon, lat);
      }
      if (ele) var alt: number | undefined = +ele;
      else {
        alt = undefined;
      }
      if (alt == 0 && num > 1) alt = track.features[0].geometry.properties.data[num-2].altitude; 
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
    await this.fs.storeSet(JSON.stringify(date), track);
    // Update collection
    const trackDef = {
      name: track.features[0].properties.name, 
      date: track.features[0].properties.date, 
      place: track.features[0].properties.place, 
      description: track.features[0].properties.description, 
      isChecked: true
    };
    // add new track definition and save collection and    
    // uncheck all tracks except the new one
    for (const item of global.collection) {
      if ('isChecked' in item) {
        item.isChecked = false;
      }
    }
    global.collection.push(trackDef);
    await this.fs.storeSet('collection', global.collection);
  }

/*

  export interface TrackSegment {
    points: Waypoint[];
  }
  
  export interface Track {
    name?: string;
    segments: TrackSegment[];
  }
  
  export interface ParsedGPX {
    waypoints: Waypoint[];
    tracks: Track[];
  }

  async parseGPX(gpxContent: string): ParsedGPX {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(gpxContent, "application/xml");
    const tracks: Track[] = [];
    // Parse waypoints (<wpt>)
    // Parse tracks (<trk>)
    const trkNodes = xmlDoc.getElementsByTagName("trk");
    for (const trk of Array.from(trkNodes)) {
      const name = trk.getElementsByTagName("name")[0]?.textContent || undefined;
      const segments: TrackSegment[] = [];
      // Parse track segments (<trkseg>)
      const trksegNodes = trk.getElementsByTagName("trkseg");
      for (const trkseg of Array.from(trksegNodes)) {
        const points: Waypoint[] = [];
        const trkptNodes = trkseg.getElementsByTagName("trkpt");
        for (const trkpt of Array.from(trkptNodes)) {
          const lat = parseFloat(trkpt.getAttribute("lat") || "0");
          const lon = parseFloat(trkpt.getAttribute("lon") || "0");
          const ele = parseFloat(trkpt.getElementsByTagName("ele")[0]?.textContent || "0");
          const time = trkpt.getElementsByTagName("time")[0]?.textContent || undefined;
          points.push({ lat, lon, ele, cmt: time });
        }
        segments.push({ points });
      }
      tracks.push({ name, segments });
    }
    return { waypoints, tracks };
  }

*/

  // PROCESS FILE AFTER TAPPING ON IT /////////////
  async processUrl(data: any) {
    if (data.url) {
      try {
        const fileContent = await Filesystem.readFile({
          path: data.url,
          encoding: Encoding.UTF8,
        });
        if (typeof fileContent.data === 'string') {
            await this.parseGpx(fileContent.data);
            const toast = ["El fitxer s'ha importat correctament","El fichero se ha importado correctamente",'File uploaded successfully']
            this.fs.displayToast(toast[global.languageIndex]);
        }
        else {
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

  async foregroundTask(location:Location) {
    // fill the track
    const locationNew: boolean = await this.buildGeoJson(location);
    // no new point..
    if (!locationNew) return;
    // new point..
    const num = this.currentTrack?.features[0].geometry.coordinates.length ?? 0;
    // filter altitude 
    await this.filterAltitude(this.currentTrack, num - this.lag - 1)
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
    // average speed
    await this.averageSpeed();
    // html values
    await this.htmlValues();
    // update canvas
    if (num % 20 == 0) {
      this.currentUnit = await this.updateAllCanvas(this.currentCtx, this.currentTrack);
    }
    // display the current track
    await this.displayCurrentTrack();
    // detect changes for Angular
    this.cd.detectChanges();
    console.log('Foreground',this.currentTrack?.features[0].properties.totalNumber || 0, 'points. Process completed')
  }

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
  
  
  stopBeepInterval() {
    if (this.beepInterval) {
      clearInterval(this.beepInterval);
      this.beepInterval = null; // Reset the interval reference
    }
  }

  async changeMapProvider() {
    const previousProvider: any = this.mapProvider;
    var credits: string = '';
    try {
      this.mapProvider = await this.fs.check(this.mapProvider, 'mapProvider');
    }
    catch {
      console.log('Could not check the map provider yhat had been selected')
    }
    if (previousProvider == this.mapProvider) return;
    // Find map layers
    const olLayer = this.map.getLayers();
    const baseLayer = olLayer.getArray()[0]; // Assume the first layer is the base map
    // Replace the base layer with the selected one
    if (this.mapProvider == 'OpenStreetMap') {
      credits = '© OpenStreetMap contributors'
      olLayer.setAt(0, new TileLayer({
        source: new OSM()
      }));
    }
    else if (this.mapProvider == 'OpenTopoMap') {
      credits = '© OpenStreetMap contributors, SRTM | Map style: © OpenTopoMap (CC-BY-SA)'
      olLayer.setAt(0, new TileLayer({source: new XYZ({
        url: 'https://{a-c}.tile.opentopomap.org/{z}/{x}/{y}.png',
      })}))
    }
    else if (this.mapProvider == 'ICGC') {
      credits = 'Institut Cartogràfic i Geològic de Catalunya'
      olLayer.setAt(0, new TileLayer({source: new XYZ({
        url: 'https://tiles.icgc.cat/xyz/mtn1000m/{z}/{x}/{y}.jpeg',
      })}))
    }
    else if (this.mapProvider == 'IGN') {
      credits = 'Instituto Geográfico Nacional (IGN)'
      olLayer.setAt(0, new TileLayer({source: new XYZ({
        url: 'https://www.ign.es/wmts/mapa-raster?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=MTN&STYLE=default&TILEMATRIXSET=GoogleMapsCompatible&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image/jpeg',
      })}))
    }
    // Apply the fade-in effect
    const mapContainer = document.getElementById('map');
    if (mapContainer) {
      mapContainer.classList.add('fade-in');
      setTimeout(() => mapContainer.classList.remove('fade-in'), 500); // Match animation duration
    }
    // Report
    this.fs.displayToast(`${credits}`) 
  }

  async determineLanguage() {
    try {
      const info = await Device.getLanguageCode();
      let deviceLanguage = info.value.split('-')[0]; // Extract the base language code
      console.log('Device Language:', deviceLanguage);
      // Check if there is a replacement
      deviceLanguage = await this.fs.check(global.language, 'language');
      // Map the device language and assign index
      if (deviceLanguage === 'ca') {
        global.language = 'ca';
        global.languageIndex = 0;
      } else if (deviceLanguage === 'es') {
        global.language = 'es';
        global.languageIndex = 1;
      } else {
        global.language = 'other';
        global.languageIndex = 2;
      }
    } catch (error) {
      console.error('Error determining language:', error);
    }
  }

  async determineColors() {
    try {
      global.archivedColor = await this.fs.check(global.archivedColor, 'archivedColor');
      global.currentColor = await this.fs.check(global.currentColor, 'currentColor');
    } catch (error) {
      console.error('Error determining language:', error);
    }
  }

  async waypoint() {
    if (!this.currentTrack) return;
    const num: number = this.currentTrack.features[0].geometry.coordinates.length
    let point = this.currentTrack.features[0].geometry.coordinates[num-1];
    console.log(point)
    const address = await this.nominatimService.reverseGeocode(point[1],point[0]) || {name:'',address_name:''};
    console.log(address)
    let waypoint: Waypoint = {
      longitude: point[0],
      latitude: point[1],
      altitude: num - 1, // At this moment, this value is the position of the point in the track
      name: address.name,
      comment: address.display_name
    }
    const response: {action: string, name: string, comment: string} = await this.fs.editWaypoint(waypoint, false, true)
    if (response.action == 'ok') {
      waypoint.name = response.name,
      waypoint.comment = response.comment
      this.currentTrack.features[0].waypoints?.push(waypoint); 
      // Toast
      const toast = ["S'ha afegit el punt de pas",'Se ha añadido el punto de paso','The waypoint has been added']
      this.fs.displayToast(toast[global.languageIndex]);
    }
  }

  async setWaypointAltitude() {
    if (!this.currentTrack) return;
    // Retrieve waypoints
    const waypoints: Waypoint[] = this.currentTrack.features[0].waypoints || [];
    for (const wp of waypoints) {
      if (wp.altitude != null && wp.altitude >= 0) wp.altitude = this.currentTrack.features[0].geometry.properties.data[wp.altitude].altitude
    }
    console.log(this.currentTrack)
  }

  async search() {
    const modal = await this.modalController.create({
      component: SearchModalComponent,
      cssClass: ['modal-class','yellow-class'] ,
      backdropDismiss: true, // Allow dismissal by tapping the backdrop
    });
    await modal.present();
    const padding = 0.005
    const { data } = await modal.onDidDismiss();
    if (data) {
      const { bbox } = data;
      let [minLat, maxLat, minLon, maxLon] = bbox.map((coord: string | number) => +coord);
      // Apply padding
      minLat -= padding;
      maxLat += padding;
      minLon -= padding;
      maxLon += padding;
      const extent = [minLon, minLat, maxLon, maxLat]; // OpenLayers extent
      this.map.getView().fit(extent);
    };
    }
  }

   

  

