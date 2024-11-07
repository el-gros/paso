// 1. IMPORTS

import { Location, Bounds, Track, TrackDefinition, Data } from '../../globald';
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
import GeoJSON from 'ol/format/GeoJSON';
import LineString from 'ol/geom/LineString';
import { Circle as CircleStyle, Fill, Stroke, Icon, Style } from 'ol/style';
import { fromLonLat } from 'ol/proj';
import { Coordinate } from 'ol/coordinate';
import { useGeographic } from 'ol/proj.js';
import Polyline from 'ol/format/Polyline.js';
import { Source } from 'ol/source';
import { Zoom, ScaleLine, Rotate, OverviewMap } from 'ol/control'
import XYZ from 'ol/source/XYZ';
import VectorTileLayer from 'ol/layer/VectorTile';
import VectorTileSource from 'ol/source/VectorTile';
import { Capacitor } from '@capacitor/core';
import MVT from 'ol/format/MVT';
import { TileGrid, createXYZ } from 'ol/tilegrid';
import { App } from '@capacitor/app';
import { MultiLineString, MultiPoint } from 'ol/geom';
import LayerRenderer from 'ol/renderer/Layer';
import { Geolocation } from '@capacitor/geolocation';
import { ForegroundService } from '@capawesome-team/capacitor-android-foreground-service';

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
  archivedTrack: any;
  vMax: number = 400;
  currentCtx: CanvasRenderingContext2D[] = [];
  archivedCtx: CanvasRenderingContext2D[] = [];
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
  threshDist: number = 0.00000025; // 0.0005 ** 2;
  lastN: number = 0;
  onRouteColor: string = 'black';
  archivedCanvasVisible: boolean = false;
  currentCanvasVisible: boolean = false;
  currentLayer: any;
  archivedLayer: any;
  multiLayer: any;
  foreground: boolean = true;
  //lastForeground: boolean = true;
  minX: number = Infinity;
  maxX: number = -Infinity;
  minY: number = Infinity;
  maxY: number = -Infinity;
  openCanvas: boolean = true;
  layerVisibility: string = 'archived' // archived, multi or none 
  audioCtx: AudioContext | null = null;  // Declare outside of function to reuse the context
  multiPoint: any = [];
  multiKey: any = [];
  
  constructor(
    public fs: FunctionsService,
    private alertController: AlertController,
    private router: Router,
    public storage: Storage,
    private zone: NgZone,
    private cd: ChangeDetectorRef
  ) {
    this.listenToAppStateChanges();
  }

  // LISTEN TO CHANGES IN FOREGROUND - BACKGROUND
  listenToAppStateChanges() {
    App.addListener('appStateChange', (state) => {
      this.foreground = state.isActive;  // true if in foreground, false if in background
      // if app changes to foreground  
      if (state.isActive && this.currentTrack) {
        this.zone.runOutsideAngular(async () => {
          // display current track
          await this.displayCurrentTrack();
          // filter altitude 
          let num = this.currentTrack?.features[0].geometry.coordinates.length ?? 0;
          await this.filterAltitude(num - this.lag - 1)
          // compute distances
          await this.computeDistances();
          // filter speed
          if (this.currentTrack) this.currentTrack.features[0].geometry.properties.data = await this.fs.filterSpeed(this.currentTrack.features[0].geometry.properties.data, this.speedFiltered + 1);
          this.speedFiltered = num - 1;
          // average speed
          await this.averageSpeed();
          // html values
          await this.htmlValues();
          // detect changes
          this.cd.detectChanges();
          // update canvas
          await this.updateAllCanvas(this.currentCtx, this.currentTrack);
          console.log('Transition.',this.currentTrack?.features[0].properties.totalNumber || 0, 'points. Process completed')
        });  
      }
    });
  }

  // ON INIT ////////////////////////////////
  async ngOnInit() {
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
  }

  addFileListener() {
    App.addListener('appUrlOpen', (data: any) => {
      console.log('I send to tab3: ', data.url, 'but have', data);
      const filePath = data.url;
      this.router.navigate(['tab3'], { queryParams: { filePath: data.url } });
    });
  }

  // ION VIEW DID ENTER
  async ionViewDidEnter() {
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
      try {await this.multiLayer.setVisible(false)} catch{}
      // show archived track
      if (this.archivedTrack) await this.showArchivedTrack();
      // set map view 
      if (this.archivedTrack && !this.currentTrack) await this.setMapView(this.archivedTrack);
      // show canvas
      if (this.archivedTrack) await this.showCanvas('a','block')
    }
    else if (this.layerVisibility == 'multi') {
      await this.hideArchivedTrack();  
      await this.displayAllTracks();
      var currentPosition: any | undefined = await this.getCurrentPosition();
      if (!currentPosition) currentPosition = [1, 41.5];
      var view = new View({
        center: currentPosition,
        zoom: 8,
      });
      if (!this.currentTrack) await this.map.setView(view);
    }
    else {
      try {await this.archivedLayer.setVisible(false);} catch{}
      try {await this.multiLayer.setVisible(false);} catch{}
    }
    if (this.currentTrack) await this.setMapView(this.currentTrack);
    this.currentUnit = await this.updateAllCanvas(this.currentCtx, this.currentTrack);
  }

  // COMPUTE EXTREMES OF ARCHIVED TRACK
  async computeExtremes(track: any) {
    // initiate variables
    this.minX = Infinity;
    this.minY = Infinity;
    this.maxX = -Infinity;
    this.maxY = -Infinity;
    // Iterate over each element of the array
    for (var [x, y] of track.features[0].geometry.coordinates) {
      // Check for the minimum and maximum of the first component (x)
      if (x < this.minX) this.minX = x;
      if (x > this.maxX) this.maxX = x;
      // Check for the minimum and maximum of the second component (y)
      if (y < this.minY) this.minY = y;
      if (y > this.maxY) this.maxY = y;
    }
  } 

  // DISPLAY CURRENT TRACK
  async displayCurrentTrack() {
    // no current track
    if (!this.currentTrack) return;
    // no map
    if (!this.map) return;
    // number of points
    let num: number = this.currentTrack?.features[0].geometry.coordinates.length ?? 0;
    // no points enough
    if (num < 2) return;
    // set line, marker and style
    this.currentFeature.setGeometry(new LineString(
      this.currentTrack.features[0].geometry.coordinates
    ))
    this.currentFeature.setStyle(this.drawPoint(this.currentColor));
    this.currentMarkers[1].setGeometry(new Point(
      this.currentTrack.features[0].geometry.coordinates[num - 1]
    ))
    // set map view
    if (num == 5 || num == 10 || num == 25 || num % 50 == 0) await this.setMapView(this.currentTrack);
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
    // if there was a track, remove it
    this.currentTrack = undefined;
    this.currentUnit = await this.updateAllCanvas(this.currentCtx, this.currentTrack);
    try{await this.currentLayer.setVisible(false);} catch{}
    // initialize
    this.stopped = 0;
    this.currentAverageSpeed = undefined;
    this.currentMotionSpeed = undefined;
    this.currentMotionTime = undefined;
    this.speedFiltered = 0;
    this.altitudeFiltered = 0;
    this.averagedSpeed = 0;
    this.computedDistances = 0;
    this.onRouteColor = 'black'
    var oldAltitude: number = -1
    // start tracking
    BackgroundGeolocation.addWatcher({
      backgroundMessage: "Cancel to prevent battery drain",
      backgroundTitle: "Tracking Your Location.",
      requestPermissions: true,
      stale: false,
      distanceFilter: this.distanceFilter
    }, async (location: Location, error: Error) => {
      if (location) {
        // build geojson always
        const locationNew: boolean = await this.buildGeoJson(location, oldAltitude);
        if (!this.foreground && locationNew) console.log('Background', this.currentTrack?.features[0].geometry.coordinates.length, 'points. Geojson updated')
        // in foreground update canvas and display current track
        if (this.foreground && locationNew) {
          let num = this.currentTrack?.features[0].geometry.coordinates.length ?? 0;
          // filter altitude 
          await this.filterAltitude(num - this.lag - 1)
          // compute distances
          await this.computeDistances();
          // filter speed
          if (this.currentTrack) this.currentTrack.features[0].geometry.properties.data = await this.fs.filterSpeed(this.currentTrack.features[0].geometry.properties.data, this.speedFiltered + 1);
          this.speedFiltered = num - 1;
          // average speed
          await this.averageSpeed();
          // html values
          await this.htmlValues();
          // update canvas
          if (num % 20 == 0) this.currentUnit = await this.updateAllCanvas(this.currentCtx, this.currentTrack);
          // display track
          await this.displayCurrentTrack();
          // detect changes
          this.cd.detectChanges();
          console.log('Foreground',this.currentTrack?.features[0].properties.totalNumber || 0, 'points. Process completed')
        }
      }
    }).then((value: any) => this.watcherId = value);
    // show / hide elements
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
    // new track: initialize all variables and plots
    this.currentTrack = undefined;
    this.currentUnit = await this.updateAllCanvas(this.currentCtx, this.currentTrack);
    try{await this.currentLayer.setVisible(false);} catch{}
  }

  // STOP TRACKING //////////////////////////////////
  async stopTracking() {
    // show / hide elements
    this.show('start', 'none');
    this.show('stop', 'none');
    this.show('save', 'block');
    this.show('trash', 'block');
    // red marker
    let num = this.currentTrack?.features[0].geometry.coordinates.length ?? 0;
    if (num > 0) {
      if (this.currentTrack) this.currentMarkers[2].setGeometry(new Point(
        this.currentTrack.features[0].geometry.coordinates[num - 1]
      ))
      this.currentMarkers[2].setStyle(this.drawCircle('red'))
      this.currentMarkers[1].setStyle(undefined)
    }
    // remove watcher
    await BackgroundGeolocation.removeWatcher({ id: this.watcherId });
    // stop foreground service
    await ForegroundService.stopForegroundService();
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
          handler: () => {
            if (action == 'remove') this.removeTrack();
            else if (action == 'stop') this.stopTracking();
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
            this.saveFile(data.name, data.place, data.description);
          }
        }
      ]
    });
    alert.present();
  }

  // SAVE FILE ////////////////////////////////////////
  async saveFile(name: string, place: string, description: string) {
    if (!this.currentTrack) return;
    // retrieve tracks definition
    var collection: TrackDefinition[] = await this.storage.get('collection') ?? [];
    // build new track definition
    this.currentTrack.features[0].properties.name = name;
    this.currentTrack.features[0].properties.place = place;
    this.currentTrack.features[0].properties.description = description;
    this.currentTrack.features[0].properties.date = new Date();
    await this.storage.set(JSON.stringify(this.currentTrack.features[0].properties.date), this.currentTrack);
    const trackDef = { name: name, date: this.currentTrack.features[0].properties.date, place: place, description: description, isChecked: false };
    // add new track definition and save collection
    collection.push(trackDef);
    await this.storage.set('collection', collection)
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
    this.show('map', 'block');
    this.show('data', 'none');
    this.show('mapbutton', 'none');
    this.show('databutton', 'block');
    // center map
    if (this.currentTrack) await this.setMapView(this.currentTrack);
    else { if (this.archivedTrack) await this.setMapView(this.archivedTrack); }
  }

  // GO TO DATA ////////////////////////////
  async gotoData() {
    this.show('map', 'none');
    this.show('data', 'block');
    this.show('mapbutton', 'block');
    this.show('databutton', 'none');
    // update canvas
    setTimeout(async () => {
      if (this.currentTrack) this.currentUnit = await this.updateAllCanvas(this.currentCtx, this.currentTrack);
    },200)  
  }

  /////////////////////////////////////////////////////
  ///////////////////// BUILD GEOJSON /////////////////
  /////////////////////////////////////////////////////

  // 1. buildGeoJson()

  // BUILD GEOJSON ////////////////////////////////////
  async buildGeoJson(location: Location, oldAltitude: number) {
    // excessive uncertainty / no altitude measured
    if (location.accuracy > this.threshold) return false;
    if (location.altitude == null || location.altitude == undefined) return false;
    if (Math.abs(location.altitude - oldAltitude) > 50 && oldAltitude >= 0) return false;
    // m/s to km/h
    location.speed = location.speed * 3.6
    var oldAltitude = location.altitude
    // initial point
    if (!this.currentTrack) {
      await this.firstPoint(location);
      return false;
    }
    // check for the locations order...
    await this.fixWrongOrder(location);
    // add location
    await this.fillGeojson(location);
    console.log('geojson updated')
    // check whether on route...
    let num = this.currentTrack.features[0].geometry.coordinates.length;
    if ((num % 5 == 0) && (this.archivedTrack)) {
      await this.checkWhetherOnRoute();
      console.log('checked whether on route...', this.onRouteColor, 'color')
    }
    return true;
  }

  // FIRST POINT OF THE TRACK /////////////////////////////
  async firstPoint(location: Location) {
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
    this.currentTrack.features[0].geometry.properties.data.push({
      altitude: location.altitude,
      speed: location.speed,
      time: location.time,
      compSpeed: 0,
      distance: 0,
    })
    this.currentTrack.features[0].geometry.coordinates.push(
      [location.longitude, location.latitude]
    )
    await this.currentMarkers[0].setGeometry(new Point(
      this.currentTrack.features[0].geometry.coordinates[0]
    ));
    await this.currentMarkers[0].setStyle(this.drawCircle('green'))
    let num = this.currentTrack.features[0].geometry.coordinates.length;
    await this.currentMarkers[1].setGeometry(new Point(
      this.currentTrack.features[0].geometry.coordinates[num-1]
    ));
    await this.currentMarkers[1].setStyle(this.drawCircle('blue'));
    await this.currentMarkers[2].setStyle(undefined);
    try{await this.currentLayer.setVisible(true);} catch{}
  }

  async onRoute() {
    // no current or archived track
    if (!this.currentTrack) return 'black';
    if (!this.archivedTrack) return 'black';
    if (this.layerVisibility != 'archived') return 'black'
    const num: number = this.currentTrack.features[0].geometry.coordinates.length ?? 0;
    const num2: number = this.archivedTrack.features[0].geometry.coordinates.length ?? 0;
    if (num == 0) return 'black';
    if (num2 == 0) return 'black';
    // definitions
    const thres = 10;
    const skip = 5;
    const sq = Math.sqrt(this.threshDist);
    var reduction = Math.max(Math.round(num2 / 2000),1); // reduction of archived track's length
    // point to check
    const point = this.currentTrack.features[0].geometry.coordinates[num - 1];
    // is it out of the square? 
    if (point[0] < this.minX - sq) return 'red';
    if (point[0] > this.maxX + sq) return 'red';
    if (point[1] < this.minY - sq) return 'red';
    if (point[1] > this.maxY + sq) return 'red';
    // go ahead
    for (var i = this.lastN; i < num2; i+=reduction) {
      let point2 = this.archivedTrack.features[0].geometry.coordinates[i];
      let dist = (Math.abs(point[0]-point2[0]))**2 + (Math.abs(point[1]-point2[1]))**2;
      // match
      if (dist < this.threshDist) {
        this.lastN = i;
        return 'green'
      }
      // too far
      if (dist > thres * this.threshDist) {
        i += (skip-1) * reduction;
        continue;
      }
    }
    // go back 
    for (var i = this.lastN; i >= 0; i-=reduction) {
      let point2 = this.archivedTrack.features[0].geometry.coordinates[i];
      let dist = (Math.abs(point[0]-point2[0]))**2 + (Math.abs(point[1]-point2[1]))**2;
      // match
      if (dist < this.threshDist) {
        this.lastN = i;
        return 'green'; // it is orange, that is, inverse direction 
      }
      // too far
      if (dist > thres * this.threshDist) {
        i -= (skip-1) * reduction;
        continue;
      }
    } 
    // no match
    return 'red';
  }

  /////////////////////////////////////////////////////
  /////////////////////////////////////////////////////
  /////////////////////////////////////////////////////

  /////////////////////////////////////////////////////
  ///////////////////// TOOLS /////////////////////////
  /////////////////////////////////////////////////////

  // 1. show()
  // 2. check()
  // 3. setMapView()
  // 5. displayArchivedTrack()
  // 6. changeColor()
  // 7. retrieveTrack()

  // SHOW / HIDE ELEMENTS ///////////////////////////////// 
  async show(id: string, action: string) {
    var obj: HTMLElement | null = document.getElementById(id);
    if (!obj) return;
    obj.style.display = action
  }

  // CHECK IN STORAGE //////////////////////////
  async check(variable: any, key: string) {
    try {
      const result = await this.storage.get(key);
      if (result !== null && result !== undefined) {
        variable = result;
      } else { }
    } catch { }
    return variable
  }

  // SET MAP VIEW /////////////////////////////////////////
  async setMapView(track: any) {
    // Calculate bounding box
    let minLat = Number.POSITIVE_INFINITY;
    let maxLat = Number.NEGATIVE_INFINITY;
    let minLng = Number.POSITIVE_INFINITY;
    let maxLng = Number.NEGATIVE_INFINITY;
    track.features[0].geometry.coordinates.forEach((point: number[]) => {
      minLat = Math.min(minLat, point[1]);
      maxLat = Math.max(maxLat, point[1]);
      minLng = Math.min(minLng, point[0]);
      maxLng = Math.max(maxLng, point[0]);
    });
    // set a minimum area
    const minVal = 0.002;
    if ((maxLng - minLng < minVal) && (maxLng - minLng < minVal)) {
      minLng = 0.5*(minLng + maxLng - minVal);
      maxLng = minLng + minVal; 
      minLat = 0.5*(minLat + maxLat - minVal);
      maxLat = minLat + minVal;
    }
    // map extent
    var extent = [minLng, minLat, maxLng, maxLat];
    // map view
    setTimeout(() => {
      this.map.getView().fit(extent, {
        size: this.map.getSize(),
        padding: [50, 50, 50, 50],
        duration: 1000  // Optional: animation duration in milliseconds
      }, 100);
    })
  }
  
  // DISPLAY AN ARCHIVED TRACK /////////////////////////
  async displayArchivedTrack() {
    // no map
    if (!this.map) return;
    // no archived track
    if (!this.archivedTrack) return;
    // remove old stuff and create new layer and markers
    this.archivedFeature.setGeometry(new LineString(
      this.archivedTrack.features[0].geometry.coordinates
    ))
    this.archivedFeature.setStyle(this.drawPoint(this.archivedColor))
    const num = this.archivedTrack.features[0].geometry.coordinates.length;
    this.archivedMarkers[0].setGeometry(new Point(
      this.archivedTrack.features[0].geometry.coordinates[0]
    ));
    this.archivedMarkers[0].setStyle(this.drawCircle('green'))
    this.archivedMarkers[2].setGeometry(new Point(
      this.archivedTrack.features[0].geometry.coordinates[num - 1]
    ));
    this.archivedMarkers[2].setStyle(this.drawCircle('red'))
  }
  
  async changeColor() {
    this.archivedColor = await this.check(this.archivedColor, 'archivedColor')
    this.currentColor = await this.check(this.currentColor, 'currentColor')
    if (this.currentFeature) await this.currentFeature.setStyle(this.drawPoint(this.currentColor));
    if (this.archivedFeature) await this.archivedFeature.setStyle(this.drawPoint(this.archivedColor));
  }

  // RETRIEVE ARCHIVED TRACK //////////////////////////
  async retrieveTrack() {
    var track: Track | undefined;
    // get collection
    var collection: TrackDefinition[] = await this.storage.get('collection') ?? [];
    // compute number of checked tracks
    var numChecked = 0;
    for (var item of collection) {
      if (item.isChecked) numChecked = numChecked + 1;
      if (numChecked > 1) break;
    }
    // if more than one track is checked, uncheck all
    if (numChecked > 1) {
      for (var item of collection) { item.isChecked = false; }
      numChecked = 0;
    }
    // if no checked items
    if (numChecked == 0) return undefined;
    // find key
    var key: any;
    for (var item of collection) {
      if (item.isChecked) {
        key = item.date;
        break;
      }
    }
/*
    var collection: TrackDefinition[] = await this.storage.get('collection') ?? [];
    for (var item of collection) {
      item.isChecked = false;
    }
    await this.storage.set('collection', collection);      
*/      

    // retrieve track
    track = await this.storage.get(JSON.stringify(key));
    // compute extremes
    if (track) await this.computeExtremes(track)
    // return  
    return track;
  }
  
  /////////////////////////////////////////////////////
  /////////////////////////////////////////////////////
  /////////////////////////////////////////////////////

  /////////////////////////////////////////////////////
  ///////////////////// DISPLAY MAP ///////////////////
  /////////////////////////////////////////////////////

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
    // sources for current and archived tracks and multilines
    var csource = new VectorSource({ features: [this.currentFeature, ...this.currentMarkers] });
    var asource = new VectorSource({ features: [this.archivedFeature, ...this.archivedMarkers] });
    var msource = new VectorSource({ features: [this.multiFeature, this.multiMarker] });
    // layers for current and archived track and multiple tracks
    this.currentLayer = new VectorLayer({source: csource});
    this.archivedLayer = new VectorLayer({source: asource});
    this.multiLayer = new VectorLayer({source: msource});
  } 

  // CREATE MAP /////////////////////////////
  async createMap() {
    // current position
    var currentPosition = [1, 41.5];
    currentPosition = await this.getCurrentPosition();
    // create layers
    await this.createLayers();
    // Create the map layer
    var olLayer: any;
    olLayer = new TileLayer({ source: new OSM() })
    // Create the map view
    var view = new View({
      center: currentPosition,
      zoom: 8,
    });
    // Controls
    var controls = [ new Zoom(), new ScaleLine(), new Rotate()]
    // Create the map
    this.map = new Map({
      target: 'map',
      layers: [olLayer, this.currentLayer, this.archivedLayer, this.multiLayer],
      view: view,
      controls: controls
    });
    this.map.on('click', (event: {
      coordinate: any; pixel: any; 
    }) => {
      this.map.forEachFeatureAtPixel(event.pixel, async (feature: any, layer: any) => {
        if (feature === this.multiMarker) {
          const clickedCoordinate = await feature.getGeometry().getClosestPoint(event.coordinate);
          const multiPointCoordinates = await feature.getGeometry().getCoordinates();
          const index = await multiPointCoordinates.findIndex((coord: any[]) =>
            coord[0] === clickedCoordinate[0] && coord[1] === clickedCoordinate[1]
          );
          //var collection: TrackDefinition[] = await this.storage.get('collection') ?? [];
          var key = this.multiKey[index];
          this.archivedTrack = await this.storage.get(JSON.stringify(key));
          if (this.archivedTrack) {
            await this.computeExtremes(this.archivedTrack)
            try{await this.multiLayer.setVisible(false);} catch{}
            this.layerVisibility = 'archived'
            //await this.storage.set('layerVisibility', this.layerVisibility);
            await this.showCanvas('a','block')
            await this.showArchivedTrack()
            await this.setMapView(this.archivedTrack);
          }
        }  
      });        
    });
  }

  /////////////////////////////////////////////////////
  /////////////////////////////////////////////////////
  /////////////////////////////////////////////////////

  /////////////////////////////////////////////////////
  ///////////////////// CANVAS ////////////////////////
  /////////////////////////////////////////////////////

  // 1. createCanvas()
  // 2. updateAllCanvas()

  async createCanvas() {
    this.openCanvas = true;
    var currentCanvas: any;
    var archivedCanvas: any;
    // show canvas
    await this.showCanvas('c','block')
    await this.showCanvas('a','block')
    // loop on canvas types
    var size = Math.min(window.innerWidth, window.innerHeight)
    for (var i in this.properties) {
      // get canvas to plot current track and define their height and width
      currentCanvas = document.getElementById('currentCanvas' + i) as HTMLCanvasElement;
      currentCanvas.width = size;
      currentCanvas.height = size;
      // get canvas to plot archived track and define their height and width
      archivedCanvas = document.getElementById('archivedCanvas' + i) as HTMLCanvasElement;
      archivedCanvas.width = size;
      archivedCanvas.height = size;
      // define their contexts
      this.currentCtx[i] = await currentCanvas.getContext("2d");
      this.archivedCtx[i] = await archivedCanvas.getContext("2d");
    }
    // define canvasNum as height and width
    this.canvasNum = size;
    // hide canvas
    await this.showCanvas('c','none')
    await this.showCanvas('a','none')
    this.openCanvas = false;
  }
 
  async updateAllCanvas(context: any, track: any) {
    this.openCanvas = true;
    // hide canvas
    if (track == this.currentTrack) await this.showCanvas('c','none')
    else if (track == this.archivedTrack) await this.showCanvas('a','none')
    var tUnit: string = '';
    if (!context) {
      this.openCanvas = false;
      return tUnit
    }
    for (var i in this.properties) {
      if (this.properties[i] == 'altitude') await this.updateCanvas(context[i], track, this.properties[i], 'x');
      else tUnit = await this.updateCanvas(context[i], track, this.properties[i], 't');
    }
    this.openCanvas = false;
    return tUnit;
  }

  // UPDATE CANVAS ///////////////////////////////////
  async updateCanvas(ctx: CanvasRenderingContext2D | undefined, track: any, propertyName: keyof Data, xParam: string) {
    var tUnit: string = ''
    if (!ctx) return tUnit;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvasNum, this.canvasNum);
    if (!track) return tUnit;
    // show canvas
    if (track == this.currentTrack) this.showCanvas('c','block')
    else if (track == this.archivedTrack) this.showCanvas('a','block')
    const num = await track.features[0].geometry.properties.data.length ?? 0;
    // time units
    var xDiv: number = 1; 
    if (xParam == 'x') {
      var xTot = track.features[0].geometry.properties.data[num - 1].distance;
    } 
    else {
      xTot = await track.features[0].geometry.properties.data[num - 1].time - track.features[0].geometry.properties.data[0].time;
      if (xTot > 3600000) {
        tUnit = 'h';
        xDiv = 3600000
      }
      else if (xTot > 60000) {
        tUnit = 'min';
        xDiv = 60000;
      }
      else {
        tUnit = 's';
        xDiv = 1000;
      }
      xTot = xTot / xDiv;
    }
    // compute bounds
    const bounds: Bounds = await this.computeMinMaxProperty(track.features[0].geometry.properties.data, propertyName);
    if (bounds.max == bounds.min) {
      bounds.max = bounds.max + 2;
      bounds.min = bounds.min - 2;
    }
    // compute scales
    const a = (this.canvasNum - 2 * this.margin) / xTot;
    const d = (this.canvasNum - 2 * this.margin) / (bounds.min - bounds.max);
    const e = this.margin;
    const f = this.margin - bounds.max * d;
    // draw lines
    ctx.setTransform(a, 0, 0, d, e, f)
    ctx.beginPath();
    ctx.moveTo(0, bounds.min);
    for (var i in track.features[0].geometry.properties.data) {
      if (xParam == 'x') ctx.lineTo(track.features[0].geometry.properties.data[i].distance, track.features[0].geometry.properties.data[i][propertyName])
      else {
        var inter = await track.features[0].geometry.properties.data[i].time - track.features[0].geometry.properties.data[0].time;
        inter = inter / xDiv;
        ctx.lineTo(inter, track.features[0].geometry.properties.data[i][propertyName])
      }
    }
    ctx.lineTo(xTot, bounds.min);
    ctx.closePath();
    ctx.fillStyle = 'yellow';
    ctx.fill();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // grid
    await this.grid(ctx, 0, xTot, bounds.min, bounds.max, a, d, e, f)
    return tUnit;
  }
  
  // COMPUTEMINMAXPROPERTY
  async computeMinMaxProperty(data: Data[], propertyName: keyof Data) {
    var bounds: Bounds = {
      min: Number.POSITIVE_INFINITY,
      max: Number.NEGATIVE_INFINITY
    }
    for (const datum of data) {
      const value = datum[propertyName];
      if (value < bounds.min) bounds.min = value;
      if (value > bounds.max) bounds.max = value;
    }
    return bounds;
  }

  // GRID /////////////////////////////////////////////////////
  async grid(ctx: CanvasRenderingContext2D | undefined, xMin: number, xMax: number, yMin: number, yMax: number, a: number, d: number, e: number, f: number) {
    if (!ctx) return;
    ctx.font = "15px Arial"
    const gridx = this.gridValue(xMax - xMin);
    const gridy = this.gridValue(yMax - yMin);
    const fx = Math.ceil(xMin / gridx);
    const fy = Math.ceil(yMin / gridy);
    ctx.setLineDash([5, 15]);
    ctx.strokeStyle = 'black';
    ctx.fillStyle = 'black'
    // vertical lines
    for (var xi = fx * gridx; xi <= xMax; xi += gridx) {
      ctx.beginPath();
      ctx.moveTo(xi * a + e, yMin * d + f);
      ctx.lineTo(xi * a + e, yMax * d + f);
      ctx.stroke();
      ctx.fillText(xi.toLocaleString(), xi * a + e + 2, yMax * d + f + 2)
    }
    // horizontal lines
    for (var yi = fy * gridy; yi <= yMax; yi = yi + gridy) {
      ctx.beginPath();
      ctx.moveTo(xMin * a + e, yi * d + f);
      ctx.lineTo(xMax * a + e, yi * d + f);
      ctx.stroke();
      ctx.fillText(yi.toLocaleString(), xMin * a + e + 2, yi * d + f - 2)
    }
    ctx.setLineDash([]);
  }

  gridValue(dx: number) {
    const nx = Math.floor(Math.log10(dx));
    const x = dx / (10 ** nx);
    if (x < 2.5) return 0.5 * (10 ** nx);
    else if (x < 5) return 10 ** nx;
    else return 2 * (10 ** nx);
  }

  /////////////////////////////////////////////////////
  /////////////////////////////////////////////////////
  /////////////////////////////////////////////////////

  async playBeep(time: number, freq: number, volume: number) {
    if (!this.audioCtx) this.audioCtx = new (window.AudioContext || window.AudioContext)();  // Initialize once
    const oscillator = this.audioCtx.createOscillator();
    const gainNode = this.audioCtx.createGain();  // Create a gain node
    oscillator.type = 'sine'; // Other waveforms: 'square', 'sawtooth', 'triangle'
    oscillator.frequency.setValueAtTime(freq, this.audioCtx.currentTime);  // Set frequency
    gainNode.gain.setValueAtTime(volume, this.audioCtx.currentTime);       // Set initial volume
    oscillator.connect(gainNode);
    gainNode.connect(this.audioCtx.destination);
    oscillator.start();
    oscillator.stop(this.audioCtx.currentTime + time); 
    oscillator.onended = () => {
      oscillator.disconnect();
      gainNode.disconnect();
    };
  }

  async displayAllTracks() {
    var key: any;
    var track: any;
    var multiLine: any = [];
    this.multiPoint = [];
    this.multiKey = [];        
    // get collection
    var collection: TrackDefinition[] = await this.storage.get('collection') ?? [];
    // find key
    for (var item of collection) {
      key = item.date;
      track = await this.storage.get(JSON.stringify(key));
      if (!track) {
        await this.storage.remove(key);
        continue;
      }
      const coord: any = await track.features[0].geometry.coordinates
      multiLine.push(coord);
      this.multiPoint.push(coord[0]);
      this.multiKey.push(item.date);
    }
    this.multiFeature.setGeometry(new MultiLineString(multiLine));
    this.multiMarker.setGeometry(new MultiPoint(this.multiPoint));      
    this.multiFeature.setStyle(this.drawPoint('black'));
    this.multiMarker.setStyle(this.drawCircle('green'));
    this.multiLayer.setVisible(true);
  }

  async hideArchivedTrack() {
    try{await this.archivedLayer.setVisible(false);} catch{}
    await this.showCanvas('a','none')
  }

  async showArchivedTrack() {
    try{await this.archivedLayer.setVisible(true);} catch{}
    this.archivedUnit = await this.updateAllCanvas(this.archivedCtx, this.archivedTrack);
    await this.showCanvas('a','block')
    await this.displayArchivedTrack();
  }

  drawCircle(color: string) {
    var style: Style = new Style({
      image: new CircleStyle({
        radius: 10, fill: new Fill({ color: color })
      })
    });
    return style
  }

  drawPoint(color: string) {
    var style = new Style({ stroke: new Stroke({ color: color, width: 5 })})
    return style;
  } 

  async getCurrentPosition() {
    var currentPosition: any;
    try {
      const coordinates = await Geolocation.getCurrentPosition();
      currentPosition = [coordinates.coords.longitude, coordinates.coords.latitude]
    } 
    catch (error) { currentPosition = undefined }
    return currentPosition
  }

  async filterAltitude(final: number) {
    if (!this.currentTrack) return;
    // number of points
    const num = this.currentTrack.features[0].geometry.coordinates.length ?? 0;
    if ((final != num - 1) && (num <= this.lag)) return
    for (var i = this.altitudeFiltered + 1; i <=final; i++) {
      const start = Math.max(0, i - this.lag);
      const end = Math.min(i + this.lag, num - 1);
      // average altitude
      var sum: number = 0
      for (var j = start; j <= end; j++) sum += this.currentTrack.features[0].geometry.properties.data[j].altitude;
      this.currentTrack.features[0].geometry.properties.data[i].altitude = sum / (end - start + 1);
      // re-calculate elevation gains / losses
      var slope = await this.currentTrack.features[0].geometry.properties.data[i].altitude - this.currentTrack.features[0].geometry.properties.data[i - 1].altitude;
      if (slope > 0) this.currentTrack.features[0].properties.totalElevationGain += slope;
      else this.currentTrack.features[0].properties.totalElevationLoss -= slope;
      // assign current altitude
      this.currentTrack.features[0].properties.currentAltitude = await this.currentTrack.features[0].geometry.properties.data[i].altitude;
      this.altitudeFiltered = i;
    }
  }

  async averageSpeed() {
    if (!this.currentTrack) return;
    // number of points
    const num = this.currentTrack.features[0].geometry.coordinates.length ?? 0;
    // compute time at rest
    for (var i = this.averagedSpeed + 1; i <= num-1; i++) {
      if (this.currentTrack.features[0].geometry.properties.data[i].compSpeed < this.vMin) {
        this.stopped += (this.currentTrack.features[0].geometry.properties.data[i].time - this.currentTrack.features[0].geometry.properties.data[i - 1].time)/1000
      }
      this.averagedSpeed = i;  
    }  
    // compute average speed and average speed in motion
    var totalTime = this.currentTrack.features[0].geometry.properties.data[num - 1].time - this.currentTrack.features[0].geometry.properties.data[0].time
    totalTime = totalTime / 1000
    this.currentAverageSpeed = 3600 * this.currentTrack.features[0].geometry.properties.data[num - 1].distance / totalTime
    if (totalTime - this.stopped > 5) this.currentMotionSpeed = 3600 * this.currentTrack.features[0].geometry.properties.data[num - 1].distance / (totalTime - this.stopped)
    this.currentMotionTime = this.fs.formatMillisecondsToUTC(1000 * (totalTime - this.stopped));
  } 

  async computeDistances() {
    if (!this.currentTrack) return;
    let num = this.currentTrack.features[0].geometry.coordinates.length ?? 0;
    // compute distances
    for (var i = this.computedDistances + 1; i <= num-1; i++) {
      const lastPoint: number[] = this.currentTrack.features[0].geometry.coordinates[i - 1];
      const currentPoint: number[] = this.currentTrack.features[0].geometry.coordinates[i];
      var distance: number = await this.fs.computeDistance(lastPoint[0], lastPoint[1], currentPoint[0], currentPoint[1])
      this.currentTrack.features[0].geometry.properties.data[i].distance = this.currentTrack.features[0].geometry.properties.data[i - 1].distance + distance 
      this.computedDistances = i;  
    }  
  }

  async htmlValues() {
    if (!this.currentTrack) return;
    // number of points
    const num = this.currentTrack.features[0].geometry.coordinates.length ?? 0;
    // html values
    this.currentTrack.features[0].properties.totalDistance = this.currentTrack.features[0].geometry.properties.data[num - 1].distance;
    this.currentTrack.features[0].properties.totalTime = this.fs.formatMillisecondsToUTC(this.currentTrack.features[0].geometry.properties.data[num - 1].time - this.currentTrack.features[0].geometry.properties.data[0].time);
    this.currentTrack.features[0].properties.totalNumber = num;
    this.currentTrack.features[0].properties.currentSpeed = this.currentTrack.features[0].geometry.properties.data[num - 1].compSpeed;
  }

  async checkWhetherOnRoute() {
    //this.onRouteColor = 'black'
    if (!this.currentTrack) return;
    if (!this.archivedTrack) return;
    if (this.layerVisibility != 'archived') return;
    // check...    
    var previousColor = this.onRouteColor;
    this.onRouteColor = await this.onRoute() ?? 'black';
    console.log('check if beep', previousColor, this.onRouteColor)
    if (previousColor == 'green' && this.onRouteColor == 'red' ) {
      await this.playBeep(0.4, 800, 1);
      await this.playBeep(0.4, 800, 0.01);
      await this.playBeep(0.4, 800, 1);
    }
    else if (previousColor == 'red' && this.onRouteColor == 'green' ) await this.playBeep(0.4, 800, 1); 
    console.log('already checked if beep')
  }

  async fixWrongOrder(location:Location) {
    if (!this.currentTrack) return;
    let num = this.currentTrack.features[0].geometry.coordinates.length ?? 0;
    // check for the locations order...
    for (var i = num - 1; i > 0; i--) {
      // case tnew < tprevious, remove previous location
      const previous: number = this.currentTrack.features[0].geometry.properties.data[i].time;
      if (previous > location.time) { 
        this.currentTrack.features[0].geometry.coordinates.pop();
        this.currentTrack.features[0].geometry.properties.data.pop();
        this.altitudeFiltered = Math.max(0, this.altitudeFiltered - 1);
        this.speedFiltered = Math.max(0, this.altitudeFiltered - 1);
        this.averagedSpeed = Math.max(0, this.altitudeFiltered - 1);
        this.computedDistances = Math.max(0, this.altitudeFiltered - 1);
      }
      else break;
    }
  }

  async fillGeojson(location: Location) {
    if (!this.currentTrack) return;
    // let num = this.currentTrack.features[0].geometry.coordinates.length ?? 0;
    // compute properties...
    // const lastPoint: number[] = this.currentTrack.features[0].geometry.coordinates[num - 1];
    // var distance: number = await this.fs.computeDistance(lastPoint[0], lastPoint[1], location.longitude, location.latitude)
    // distance += this.currentTrack.features[0].geometry.properties.data[num - 1].distance;
    // add properties to geojson
    this.currentTrack.features[0].geometry.properties.data.push({
      altitude: location.altitude,
      speed: location.speed,
      time: location.time,
      compSpeed: location.speed,
      distance: 0,
    })
    // add coordinates
    this.currentTrack.features[0].geometry.coordinates.push([location.longitude, location.latitude]);
  }

  async showCanvas(track: string, visible: string) {
    await this.show(track+'c0',visible);
    await this.show(track+'c1',visible); 
  }

  async uncheckAll() {
    var collection: TrackDefinition[] = await this.storage.get('collection') ?? [];
    for (var item of collection) {
      item.isChecked = false;
    }
    await this.storage.set('collection', collection);      
  }

  ionViewWillLeave() {
    global.layerVisibility = this.layerVisibility
    if (this.archivedTrack) global.archivedPresent = true
    else global.archivedPresent = false
  }

}

