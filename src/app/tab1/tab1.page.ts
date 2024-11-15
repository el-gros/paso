import { Location, Extremes, Bounds, Track, TrackDefinition, Data } from '../../globald';
import { FunctionsService } from '../functions.service';
import { Component, NgZone, Injectable, OnInit } from '@angular/core';
import { IonicModule, AlertController } from '@ionic/angular';
import { ExploreContainerComponent } from '../explore-container/explore-container.component';
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
import { Circle as CircleStyle, Fill, Stroke, Icon, Style } from 'ol/style';
import { useGeographic } from 'ol/proj.js';
import { Zoom, ScaleLine, Rotate, OverviewMap } from 'ol/control'
import { App } from '@capacitor/app';
import { MultiLineString, MultiPoint } from 'ol/geom';
import { Geolocation } from '@capacitor/geolocation';
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

useGeographic();

@Injectable({
  providedIn: 'root',
})

@Component({
  selector: 'app-tab1',
  templateUrl: 'tab1.page.html',
  styleUrls: ['tab1.page.scss'],
  standalone: true,
  imports: [IonicModule, ExploreContainerComponent, CommonModule, FormsModule ],
  providers: [DecimalPipe, DatePipe],
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
  
export class Tab1Page {

  watcherId: any = 0;
  currentTrack: Track | undefined = undefined;
  archivedTrack: Track | undefined = undefined;
  importedTrack: any;
  vMax: number = 400;
  currentCtx: [CanvasRenderingContext2D | undefined, CanvasRenderingContext2D | undefined] = [undefined, undefined];
  archivedCtx: [CanvasRenderingContext2D | undefined, CanvasRenderingContext2D | undefined] = [undefined, undefined];
  canvasNum: number = 400; // canvas size
  margin: number = 10;
  threshold: number = 20;
  properties: (keyof Data)[] = ['altitude', 'compSpeed'];
  gridsize: string = '-';
  map: any;
  currentMarkers: any = [null, null, null];
  archivedMarkers: any = [null, null, null];
  multiMarker: any | undefined = undefined;
  lag: number = global.lag; // 8
  distanceFilter: number = 5; // .05 / 5
  altitudeFiltered: number = 0;
  speedFiltered: number = 0;
  averagedSpeed: number = 0;
  computedDistances: number = 0; 
  currentColor: string = 'orange';
  archivedColor: string = 'green';
  stopped: any = 0;
  vMin: number = 1; 
  currentAverageSpeed: number | undefined = undefined;
  currentMotionSpeed: number | undefined = undefined;
  currentMotionTime: any = undefined;
  currentUnit: string = '' // time unit for canvas ('s' seconds, 'min' minutes, 'h' hours)
  archivedUnit: string = '' // time unit for canvas ('s' seconds, 'min' minutes, 'h' hours)
  archivedFeature: any;
  currentFeature: any;
  multiFeature: any; 
  threshDist: number = 0.00000036; // 0.0006 ** 2;
  lastN: number = 0;
  onRouteColor: string = 'black';
  archivedCanvasVisible: boolean = false;
  currentCanvasVisible: boolean = false;
  currentLayer: any;
  archivedLayer: any;
  multiLayer: any;
  foreground: boolean = true;
  extremes: Extremes | undefined
  openCanvas: boolean = true;
  layerVisibility: string = 'archived' // archived, multi or none 
  multiPoint: any = [];
  multiKey: any = [];
  audioCtx : AudioContext | undefined = new (window.AudioContext || window.AudioContext)()
  uploaded: any;
  
  constructor(
    public fs: FunctionsService,
    private alertController: AlertController,
    private router: Router,
    public storage: Storage,
    private zone: NgZone,
    private cd: ChangeDetectorRef,
  ) {
    this.listenToAppStateChanges();
  }

  /* FUNCTIONS

  listenToAppStateChanges
  ngOnInit
  addFileListener
  ionViewDidEnter
  centerAllTracks
  computeExtremes
  displayCurrentTrack
  startTracking
  removeTrack
  stopTracking
  confirm
  setTrackDetails
  showValidationAlert
  saveFile
  gotoPage
  gotoMap
  gotoData
  buildGeoJson
  onRoute
  show
  check
  displayArchivedTrack
  changeColor
  updateAllCanvas
  drawPoint
  computeMinMaxProperty
  retrieveTrack
  setMapView
  */

  // LISTEN TO CHANGES IN FOREGROUND - BACKGROUND
  listenToAppStateChanges() {
    App.addListener('appStateChange', (state) => {
      this.foreground = state.isActive;  // true if in foreground, false if in background
      // Exit early if the app is going to the background or there is no current track
      if (!state.isActive || !this.currentTrack) return;
      // Run updates outside of Angular's zone to avoid change detection overhead
      this.zone.runOutsideAngular(async () => {
        try{
          // display current track
          await this.displayCurrentTrack();
          // Filter altitude data
          const num = this.currentTrack?.features[0].geometry.coordinates.length ?? 0;
          await this.filterAltitude(num - this.lag - 1);
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

  // ON INIT ////////////////////////////////
  async ngOnInit() {
    try {
      // create storage 
      await this.storage.create();
      // elements shown, elements hidden
      this.show('map', 'block');
      this.show('data', 'none');
      this.show('start', 'block');
      this.show('stop', 'none');
      this.show('save', 'none');
      this.show('trash', 'none');
      this.show('mapbutton', 'none');
      this.show('databutton', 'block');
      // uncheck all
      await this.uncheckAll();
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

  // LISTENING FOR OPEN EVENTS 
  addFileListener() {
    // Listen for app URL open events (e.g., file tap)
    App.addListener('appUrlOpen', async (data: any) => {
      this.gotoPage('tab1');
      await this.processUrl(data);
      this.layerVisibility = 'archived'
      // retrieve archived track
      this.archivedTrack = await this.retrieveTrack() ?? this.archivedTrack;
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

  // ION VIEW DID ENTER
  async ionViewDidEnter() {
    try {
      // initialize layerVisibility
      this.layerVisibility = global.layerVisibility
      // change color for current and archived tracks
      await this.changeColor();
      // only visible for layerVisibility == 'archived' 
      await this.showCanvas('a','none')
      // archived visible
      if (this.layerVisibility == 'archived') {
        // retrieve archived track
        this.archivedTrack = await this.retrieveTrack() ?? this.archivedTrack;
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
      else if (this.layerVisibility == 'multi') {
        // hide archived track
        await this.hideArchivedTrack();  
        // display all tracks
        await this.displayAllTracks();
        // center all tracks
        if (!this.currentTrack) await this.centerAllTracks();
      }
      else {
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

  // CENTER ALL TRACKS
  async centerAllTracks() {
    // get current position
    let currentPosition: [number, number] | undefined = await this.getCurrentPosition();
    // center map
    await this.map.getView().setCenter(currentPosition);
    await this.map.getView().setZoom(8);
  }

  // COMPUTE EXTREMES OF ARCHIVED TRACK
  async computeExtremes(track: any): Promise<{ minX: number; minY: number; maxX: number; maxY: number } | undefined> {
    // initiate variables
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    // Ensure track data exists and has coordinates
    const coordinates = track?.features?.[0]?.geometry?.coordinates;
    if (!coordinates || !Array.isArray(coordinates)) return undefined;
    // Iterate over each coordinate pair in the array
    for (const [x, y] of coordinates) {
      // Update min and max values for x
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      // Update min and max values for y
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;    
    }
    // Return the computed extremes
    return { minX, minY, maxX, maxY };
  } 

  // DISPLAY CURRENT TRACK
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
    this.currentFeature.setStyle(this.drawPoint(this.currentColor));
    // Set the last point as the marker geometry  
    this.currentMarkers[1].setGeometry(new Point(coordinates[num - 1]));
    // Adjust map view at specific intervals
    if (num === 5 || num === 10 || num === 25 || num % 50 === 0) {
      await this.setMapView(this.currentTrack);
    }
  }

  // START TRACKING /////////////////////////////////
  async startTracking() {
    // start foreground service
    await ForegroundService.startForegroundService({
      id: 1234,
      title: 'Tracking Your Location.',
      body: 'Location tracking in progress.',
      smallIcon: 'splash.png', // icon in `res/drawable` or default
    });
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
    this.currentMotionTime = undefined;
    this.speedFiltered = 0;
    this.altitudeFiltered = 0;
    this.averagedSpeed = 0;
    this.computedDistances = 0;
    this.onRouteColor = 'black'
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
        // build geojson
        const locationNew: boolean = await this.buildGeoJson(location);
        if (!this.foreground && locationNew) console.log('Background', this.currentTrack?.features[0].geometry.coordinates.length, 'points. Geojson updated')
       // Update the current track when in the foreground
        if (this.foreground && locationNew) {
          const num = this.currentTrack?.features[0].geometry.coordinates.length ?? 0;
          // filter altitude 
          await this.filterAltitude(num - this.lag - 1)
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
      }
    }).then((value: any) => this.watcherId = value);
    // show / hide UI elements
    this.show('start', 'none');
    this.show('stop', 'block');
    this.show('trash', 'none');
    this.show('save', 'none');
  }

  // REMOVE TRACK ///////////////////////////////////
  async removeTrack() {
    // show / hide elements
    this.show('start', 'block');
    this.show('stop', 'none');
    this.show('save', 'none');
    this.show('trash', 'none');
    // Reset current track and corresponding canvases
    this.currentTrack = undefined;
    this.currentUnit = await this.updateAllCanvas(this.currentCtx, this.currentTrack);
    try{if (this.currentLayer) await this.currentLayer.setVisible(false);} catch{}
  }

  // STOP TRACKING //////////////////////////////////
  async stopTracking() {
    // show / hide elements
    this.show('start', 'none');
    this.show('stop', 'none');
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
    await this.filterAltitude(num - 1);
    // set map view
    await this.setMapView(this.currentTrack);
    // update canvas
    this.currentUnit = await this.updateAllCanvas(this.currentCtx, this.currentTrack);
  }

  // CONFIRM TRACK DELETION OR STOP TRACKING
  async confirm(header: string, message: string, action: string) {
    const alert = await this.alertController.create({
      cssClass: 'alert yellowAlert',
      header: header,
      message: 'Are you sure you want to ' + message,
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel',
          cssClass: 'alert-cancel-button',
          handler: () => {
          }
        },
        {
          text: 'Yes',
          cssClass: 'alert-button',
          handler: async () => {
            if (action === 'remove') {
              await this.removeTrack();
            } else if (action === 'stop') {
              await this.stopTracking();
            }
          }
        }
      ]
    })
    alert.present();
  } 

  // SET TRACK NAME, TIME, DESCRIPTION, ... 
  async setTrackDetails() {
    const alert = await this.alertController.create({
      cssClass: 'alert yellowAlert',
      header: 'Track Details',
      message: 'Kindly set the track details',
      inputs: [
        {
          name: 'name',
          type: 'text',
          id: 'name-id',
          value: '',
          placeholder: 'Name',
        },
        {
          name: 'place',
          type: 'text',
          id: 'place-id',
          value: '',
          placeholder: 'Place',
        },
        {
          name: 'description',
          type: 'textarea',
          id: 'description-id',
          value: '',
          placeholder: 'Description',
        },
      ],
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel',
          cssClass: 'alert-cancel-button',
          handler: () => {
          }
        },
        {
          text: 'Ok',
          cssClass: 'alert-button',
          handler: (data) => {
            if (!data.name.trim()) {
              this.showValidationAlert();
              return false;
            }
            this.saveFile(data.name, data.place, data.description);
            return true;
          }
        }
      ]
    });
    alert.present();
  }
  
  // NO NAME TO SAVE ////////////////////////////////////
  async showValidationAlert() {
    const validationAlert = await this.alertController.create({
      cssClass: 'alert redAlert',
      header: 'Validation Error',
      message: 'Please enter a name for the track.',
      buttons: ['OK']
    });
    await validationAlert.present();
  }

  // SAVE FILE ////////////////////////////////////////
  async saveFile(name: string, place: string, description: string) {
    if (!this.currentTrack) return;
    // retrieve tracks definition
    var collection: TrackDefinition[] = await this.storage.get('collection') ?? [];
    // build new track definition
    const currentProperties = this.currentTrack.features[0].properties;
    currentProperties.name = name;
    currentProperties.place = place;
    currentProperties.description = description;
    currentProperties.date = new Date();
    // Save the current track to storage with date as key
    const dateKey = JSON.stringify(currentProperties.date);
    await this.storage.set(dateKey, this.currentTrack);
    await this.storage.set(JSON.stringify(this.currentTrack.features[0].properties.date), this.currentTrack);
    // Create a new track definition
    const trackDef: TrackDefinition = { 
      name, 
      date: currentProperties.date, 
      place, 
      description, 
      isChecked: false 
    };
    // Add new track definition to the collection and save it
    collection.push(trackDef);
    await this.storage.set('collection', collection);    
    // Update UI elements
    this.show('start', 'block');
    this.show('stop', 'none');
    this.show('save', 'none');
    this.show('trash', 'block');
  }

  // GO TO PAGE ... //////////////////////////////
  async gotoPage(option: string) {
    this.router.navigate([option]);
  }

  // GO TO MAP ////////////////////////////
  async gotoMap() {
    // Show map and adjust buttons
    this.show('map', 'block');
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

  // GO TO DATA ////////////////////////////
  async gotoData() {
    // Show data and adjust buttons
    this.show('map', 'none');
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

  // BUILD GEOJSON ////////////////////////////////////
  async buildGeoJson(location: Location) {
    // excessive uncertainty / no altitude measured
    if (location.accuracy > this.threshold) return false;
    if (location.altitude == null || location.altitude == undefined) return false;
    if (location.altitude == 0) return false;
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
    if ((num % 10 == 0) && (this.archivedTrack)) {
      await this.checkWhetherOnRoute();
    }
    return true;
  }

  // CHECK WHETHER OR NOT WE ARE ON ROUTE //////////////////////
  async onRoute() {
    // Return 'black' if conditions aren't met
    if (!this.currentTrack || !this.archivedTrack || this.layerVisibility != 'archived') return 'black';
    // Define current and archived coordinates
    const currentCoordinates = this.currentTrack.features[0].geometry.coordinates;
    const archivedCoordinates = this.archivedTrack.features[0].geometry.coordinates;
    if (currentCoordinates.length === 0 || archivedCoordinates.length === 0) return 'black';
    // Define parameters
    const bounding = (this.onRouteColor === 'red' ? 0.5 : 1) * Math.sqrt(this.threshDist);
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
  
  // SHOW / HIDE ELEMENTS ///////////////////////////////// 
  async show(id: string, action: 'block' | 'none' | 'inline' | 'flex') {
    const obj = document.getElementById(id);
    if (obj) {
      obj.style.display = action;
    }
  }

  // CHECK IN STORAGE //////////////////////////
  async check<T>(variable: T, key: string): Promise<T> {
    try {
      const result = await this.storage.get(key);
      return result !== null && result !== undefined ? result : variable;
    } catch {
      return variable;
    }
  }

  // DISPLAY AN ARCHIVED TRACK /////////////////////////
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
    this.archivedFeature.setStyle(this.drawPoint(this.archivedColor));
    if (this.archivedMarkers.length >= 3) {
      this.archivedMarkers[0].setGeometry(new Point(coordinates[0]));
      this.archivedMarkers[0].setStyle(this.drawCircle('green'));
      this.archivedMarkers[2].setGeometry(new Point(coordinates[num - 1]));
      this.archivedMarkers[2].setStyle(this.drawCircle('red'));
    }
  }

  // CHANGE THE TRACK COLORS /////////////////////////////////
  async changeColor() {
    try {
      this.archivedColor = await this.check(this.archivedColor, 'archivedColor');
      this.currentColor = await this.check(this.currentColor, 'currentColor');
      // Apply new styles if features exist
      this.currentFeature && this.currentFeature.setStyle(this.drawPoint(this.currentColor));
      this.archivedFeature && this.archivedFeature.setStyle(this.drawPoint(this.archivedColor));
    } catch (error) {
      console.error("Error updating colors:", error);
    }
  }

  async updateAllCanvas(context: any, track: Track | undefined) {
    this.openCanvas = true;
    // Hide canvas for the current or archived track
    if (track == this.currentTrack) await this.showCanvas('c','none')
    else if (track == this.archivedTrack) await this.showCanvas('a','none')
    // Exit if context is not provided
    if (!context) {
      this.openCanvas = false;
      return '';
    }
    // update canvas
    let tUnit = '';
    for (var i in this.properties) {
      if (this.properties[i] === 'altitude') {
        await this.updateCanvas(context[i], track, this.properties[i], 'x');
      } else {
        tUnit = await this.updateCanvas(context[i], track, this.properties[i], 't');
      }
    }
    // Return
    this.openCanvas = false;
    return tUnit;
  }

  // DRAW A POINT /////////////////////////////////////////
  drawPoint(color: string) {
    var style = new Style({ stroke: new Stroke({ color: color, width: 5 })})
    return style;
  } 

  // COMPUTE MINIMUM AND MAXIMUM OF A PROPERTY ////////////////////////
  async computeMinMaxProperty<T extends Record<string, number>>(data: T[], propertyName: keyof T) {
    // Initialize
    let bounds: Bounds = {
      min: Number.POSITIVE_INFINITY,
      max: Number.NEGATIVE_INFINITY
    }
    // Loop
    for (const datum of data) {
      const value = datum[propertyName];
      if (typeof value !== 'number') {
        throw new Error(`Property ${String(propertyName)} is not a number.`);
      }
      if (value < bounds.min) bounds.min = value;
      if (value > bounds.max) bounds.max = value;
    }
    // Return
    return bounds;
  }

  // RETRIEVE ARCHIVED TRACK //////////////////////////
  async retrieveTrack() {
    var track: Track | undefined;
    // get collection
    const collection: TrackDefinition[] = await this.storage.get('collection') ?? [];
    // Filter checked tracks and count them
    const checkedTracks = collection.filter(item => item.isChecked);
    // If more than one track is checked, uncheck all
    if (checkedTracks.length > 1) {
      collection.forEach(item => item.isChecked = false);
    }
    // If no tracks are checked, return undefined
    if (checkedTracks.length === 0) return undefined;
    // Retrieve the track associated with the checked item
    const key = checkedTracks[0].date; // Assuming `date` is the key
    track = await this.storage.get(JSON.stringify(key));
    // Compute extremes if track exists
    if (track) {
      this.extremes = await this.computeExtremes(track);
    }
    // Return the retrieved track
    return track;
  }

  // SET MAP VIEW /////////////////////////////////////////
  async setMapView(track: any) {
    var boundaries: Extremes | undefined;
    if (track == this.archivedTrack) boundaries = this.extremes
    else boundaries = await this.computeExtremes(track)
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
    
  // FIRST POINT OF THE TRACK /////////////////////////////
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
          totalTime: 0,
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
        }
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
    // show current canvas
    await this.showCanvas('c','block')  
  }
  
  // CREATE MAP /////////////////////////////
  async createMap() {
    // current position
    const currentPosition = await this.getCurrentPosition();
    // create layers
    await this.createLayers();
    // Create the map layer
    const olLayer = new TileLayer({ source: new OSM() })
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
    // Set up click event
    this.map.on('click', this.handleMapClick.bind(this));
  }
  
  // CREATE CANVASES //////////////////////////////////////////
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

  // GRID /////////////////////////////////////////////////////
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

  // DETERMINATION OF GRID STEP //////////////////////
  gridValue(dx: number) {
    const nx = Math.floor(Math.log10(dx));
    const x = dx / (10 ** nx);
    if (x < 2.5) return 0.5 * (10 ** nx);
    else if (x < 5) return 10 ** nx;
    else return 2 * (10 ** nx);
  }
  
  // HIDE ARCHIVED TRACK
  async hideArchivedTrack() {
    try {
      this.archivedLayer.setVisible(false);  // No need for await
    } catch (error) {}
    await this.showCanvas('a', 'none');
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

  // FI8LTER ALTITUDE /////////////////////////////
  async filterAltitude(final: number) {
    if (!this.currentTrack) return;
    // number of points
    const num = this.currentTrack.features[0].geometry.properties.data.length ?? 0;
    // Skip processing if final index is not the last point, or if points are fewer than lag
    if ((final != num - 1) && (num <= this.lag)) return
    // Get the track data once to simplify access
    const data = this.currentTrack.features[0].geometry.properties.data;
    // Loop through each point to filter altitude
    for (let i = this.altitudeFiltered + 1; i <=final; i++) {
      const start = Math.max(0, i - this.lag);
      const end = Math.min(i + this.lag, num - 1);
      // Calculate the average altitude in the window
      const sum = data.slice(start, end + 1)
        .reduce((acc, point) => acc + point.altitude, 0);
      data[i].altitude = sum / (end - start + 1);
      // Calculate elevation gains/losses
      const slope = data[i].altitude - data[i - 1].altitude;
      if (slope > 0) {
        this.currentTrack.features[0].properties.totalElevationGain += slope;
      } else {
        this.currentTrack.features[0].properties.totalElevationLoss -= slope;
      }
      // Update current altitude
      this.currentTrack.features[0].properties.currentAltitude = data[i].altitude;
      // Update the last processed index
      this.altitudeFiltered = i;
    }
  }

  // CREATE FEATURES /////////////////////////////
  async createLayers() {
    // create features to hold current track and markers
    this.currentMarkers[2] = new Feature({ geometry: new Point([0, 40]) });
    this.currentMarkers[1] = new Feature({ geometry: new Point([0, 40]) });
    this.currentMarkers[0] = new Feature({ geometry: new Point([0, 40]) });
    this.currentFeature = new Feature({ geometry: new LineString([[0, 40], [0, 40]]) });
    // create features to hold multiple track and markers
    this.multiFeature = new Feature({ geometry: new MultiLineString([[[0, 40], [0, 40]]]) });
    this.multiMarker = new Feature({ geometry: new MultiPoint([0, 40]) });
    // create features to hold archived track and markers
    this.archivedFeature = new Feature({ geometry: new LineString([[0, 40], [0, 40]]) });
    this.archivedMarkers[0] = new Feature({ geometry: new Point([0, 40]) });
    this.archivedMarkers[1] = new Feature({ geometry: new Point([0, 40]) });
    this.archivedMarkers[2] = new Feature({ geometry: new Point([0, 40]) });
    // Vector sources for current, archived and multiple tracks
    var csource = new VectorSource({ features: [this.currentFeature, ...this.currentMarkers] });
    var asource = new VectorSource({ features: [this.archivedFeature, ...this.archivedMarkers] });
    var msource = new VectorSource({ features: [this.multiFeature, this.multiMarker] });
    // layers for current, archived and multiple tracks
    this.currentLayer = new VectorLayer({source: csource});
    this.archivedLayer = new VectorLayer({source: asource});
    this.multiLayer = new VectorLayer({source: msource});
  } 

  // UPDATE CANVAS ///////////////////////////////////
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
    const bounds = await this.computeMinMaxProperty(data, propertyName);
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
  
  // DISPLAY ALL ARCHIVED TRACKS
  async displayAllTracks() {
    var key: any;
    var track: any;
    var multiLine: any = [];
    this.multiPoint = [];
    this.multiKey = [];        
    // get collection
    var collection: TrackDefinition[] = await this.storage.get('collection') ?? [];
    // Loop through each item in the collection
    for (const item of collection) {
      key = item.date;
      track = await this.storage.get(JSON.stringify(key));
      // If the track does not exist, remove the key and skip this iteration
      if (!track) {
        await this.storage.remove(key);
        continue;
      }
      // Extract coordinates and add to multiLine and multiPoint
      const coord = track.features[0]?.geometry?.coordinates;
      if (coord) {
        multiLine.push(coord);
        this.multiPoint.push(coord[0]);
        this.multiKey.push(item.date);
      }
    }
    // Set geometries for multiLine and multiPoint layers
    this.multiFeature.setGeometry(new MultiLineString(multiLine));
    this.multiMarker.setGeometry(new MultiPoint(this.multiPoint));
    // Apply styles to the features
    this.multiFeature.setStyle(this.drawPoint('black'));
    this.multiMarker.setStyle(this.drawCircle('green'));
    // Set visibility of multiLayer
    this.multiLayer.setVisible(true);
  }

  // HANDLE MAP CLICK //////////////////////////////
  private async handleMapClick(event: { coordinate: any; pixel: any }) {
    this.map.forEachFeatureAtPixel(event.pixel, async (feature: any) => {
      if (feature === this.multiMarker) {
        // Retrieve clicked coordinate and find its index
        const clickedCoordinate = feature.getGeometry().getClosestPoint(event.coordinate);
        const multiPointCoordinates = feature.getGeometry().getCoordinates();
        const index = multiPointCoordinates.findIndex((coord: [number, number]) =>
          coord[0] === clickedCoordinate[0] && coord[1] === clickedCoordinate[1]
        );
        // Retrieve the archived track based on the index key
        const key = this.multiKey[index];
        this.archivedTrack = await this.storage.get(JSON.stringify(key));
        // Display archived track details if it exists
        if (this.archivedTrack) {
          this.extremes = await this.computeExtremes(this.archivedTrack);
          this.multiLayer.setVisible(false);
          this.layerVisibility = 'archived';
          await this.showCanvas('a', 'block');
          await this.showArchivedTrack();
          await this.setMapView(this.archivedTrack);
        }
      }
    });
  }

  // DRAW A CIRCLE //////////////////////////////////////
  drawCircle(color: string): Style {
    return new Style({
      image: new CircleStyle({
        radius: 10,
        fill: new Fill({ color: color })
      })
    });
  }

  // GET CURRENT POSITION ////////////////////////////////// 
  async getCurrentPosition(): Promise<[number, number]> {
    try {
      const coordinates = await Geolocation.getCurrentPosition();
      return [coordinates.coords.longitude, coordinates.coords.latitude];
    } 
    catch (error) { return [1, 41.5]; } // Default coordinates 
  }

  // COMPUTE AVERAGE SPEEDS AND TIMES
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
    if (!this.currentTrack || !this.archivedTrack || this.layerVisibility !== 'archived') return;
    // Store previous color for comparison
    const previousColor = this.onRouteColor;
    // Determine the current route color based on `onRoute` function
    this.onRouteColor = await this.onRoute() || 'black';
    // Play beep based on route status change
    if (previousColor === 'green' && this.onRouteColor === 'red') {
      await this.playBeep(600, 0.8); // Beep for off-route transition
    } else if (previousColor === 'red' && this.onRouteColor === 'green') {
      await this.playBeep(1800, 0.4); // Beep for on-route transition
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

  // UNCHECK ALL ///////////////////////////////////////////
  async uncheckAll() {
    const collection: TrackDefinition[] = (await this.storage.get('collection')) ?? [];
    for (const item of collection) {
      if ('isChecked' in item) {
        item.isChecked = false;
      }
    }
    await this.storage.set('collection', collection);
  }

  // ON LEAVE ////////////////////////////
  async ionViewWillLeave() {
    global.layerVisibility = this.layerVisibility;
    global.archivedPresent = !!this.archivedTrack;
  }

  // PLAY A BEEP /////////////////////////////////////
  async playBeep(freq: number, time: number) {
    // Initialize audio context if not already created
    if (!this.audioCtx) {
      this.audioCtx = new (window.AudioContext || window.AudioContext)();
    }
    const oscillator = this.audioCtx.createOscillator();
    const gainNode = this.audioCtx.createGain();  // Create a gain node
    // Configure oscillator
    oscillator.type = 'sine'; // Other waveforms: 'square', 'sawtooth', 'triangle'
    oscillator.frequency.setValueAtTime(freq, this.audioCtx.currentTime);  // Set frequency
    // Set initial gain (volume)
    gainNode.gain.setValueAtTime(1, this.audioCtx.currentTime);       // Set initial volume
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
  
  // PARSE CONTENT OF A GPX FILE ////////////////////////
  async parseGpx(gpxText: string) {
    this.importedTrack = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: {
          name: undefined,
          place: undefined,
          date: undefined,
          description: undefined,
          totalDistance: '',
          totalElevationGain: 0,
          totalElevationLoss: 0,
          totalTime: '',
          totalNumber: ''
        },
        geometry: {
          type: 'LineString',
          coordinates: [],
          properties: {
            data: [],
          }
        }  
      }]
    }
    // Parse GPX data
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(gpxText, 'application/xml');
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
    this.importedTrack.features[0].properties.name = tracks[0].getElementsByTagName('name')[0]?.textContent || 'No Name';
    // Initialize variable
    let altitudeOk = true;
    let distance = 0;
    // Loopo on points
    for (let k = 0; k < trackPoints.length; k++) {
      const lat = parseFloat(trackPoints[k].getAttribute('lat') || '');
      const lon = parseFloat(trackPoints[k].getAttribute('lon') || '');
      const ele = parseFloat(trackPoints[k].getElementsByTagName('ele')[0]?.textContent || '0');
      const time = trackPoints[k].getElementsByTagName('time')[0]?.textContent;
      if (isNaN(lat) || isNaN(lon)) continue;
      // Add coordinates
      this.importedTrack.features[0].geometry.coordinates.push([lon, lat]);
      const num = this.importedTrack.features[0].geometry.coordinates.length;
      // Handle distance
      if (k > 0) {
        const prevCoord = this.importedTrack.features[0].geometry.coordinates[k - 1];
        distance += await this.fs.computeDistance(prevCoord[0], prevCoord[1], lon, lat);
      }
      // Handle altitude
      if (alt === undefined) altitudeOk = false;
      if (isNaN(ele)) {
        altitudeOk = false;
      }
      if (ele) var alt: number | undefined = +ele;
      else {
        alt = undefined;
        altitudeOk = false;
      }
      if (alt == 0 && num > 1) alt = await this.importedTrack.features[0].geometry.properties.data[num-2].altitude; 
      // Handle time
      const locTime = time ? new Date(time) : undefined;
      // Add data
      this.importedTrack.features[0].geometry.properties.data.push({
        altitude: alt,
        speed: undefined,
        time: locTime,
        compSpeed: 0,
        distance: distance,
      });
    }
    // Fill values
    var num: number = this.importedTrack.features[0].geometry.properties.data.length ?? 0;
    this.importedTrack.features[0].properties.totalDistance = distance;
    this.importedTrack.features[0].properties.totalTime = this.fs.formatMillisecondsToUTC(this.importedTrack.features[0].geometry.properties.data[num - 1].time - 
      this.importedTrack.features[0].geometry.properties.data[0].time);
    this.importedTrack.features[0].properties.totalNumber = num;
    // Speed filter
    try {
      this.fs.filterSpeed(this.importedTrack.features[0].geometry.properties.data, num - 1);
    }
    catch {}  
    // Altitude filter
    try{
      this.importedTrack.features[0].properties.totalElevationGain = 0;
      this.importedTrack.features[0].properties.totalElevationLoss = 0;
      await this.filterAltitude(this.importedTrack)
      this.altitudeFiltered = 0;
    }
    catch {}
    // speed filter      
    this.importedTrack.features[0].geometry.properties.data = await this.fs.filterSpeed(this.importedTrack.features[0].geometry.properties.data, 1);
    // Save imported track
    const date = new Date(this.importedTrack.features[0].geometry.properties.data[num - 1]?.time || Date.now());
    this.importedTrack.features[0].properties.date = date;
    await this.storage.set(JSON.stringify(date), this.importedTrack);
    // Update collection
    const trackDef = {
      name: this.importedTrack.features[0].properties.name, 
      date: this.importedTrack.features[0].properties.date, 
      place: this.importedTrack.features[0].properties.place, 
      description: this.importedTrack.features[0].properties.description, 
      isChecked: true
    };
    // add new track definition and save collection and    
    // uncheck all tracks except the new one
    const collection: any = await this.storage. get('collection');
    for (const item of collection) {
      if ('isChecked' in item) {
        item.isChecked = false;
      }
    }
    collection.push(trackDef);
    await this.storage.set('collection', collection);
  }

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
            this.uploaded = 'File uploaded'
        }
        else this.uploaded = 'No file uploaded'
      } 
      catch (error) {this.uploaded = 'No file uploaded'}
    }
    else {this.uploaded = ''}
  }
}

