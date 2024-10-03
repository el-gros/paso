// 1. IMPORTS

import { Location, Bounds, Track, TrackDefinition, Data } from '../../globald';
import { FunctionsService } from '../functions.service';
import { Component, Injectable, OnInit } from '@angular/core';
import { IonicModule, AlertController } from '@ionic/angular';
import { ExploreContainerComponent } from '../explore-container/explore-container.component';
import { global } from '../../environments/environment';
import { CommonModule, DecimalPipe, DatePipe } from '@angular/common';
import { Router } from '@angular/router';
import { registerPlugin } from "@capacitor/core";
const BackgroundGeolocation: any = registerPlugin("BackgroundGeolocation");
import { Storage } from '@ionic/storage-angular';
import { FormsModule } from '@angular/forms';
import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
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
import { Circle as CircleStyle, Fill, Stroke, Style } from 'ol/style';
import { fromLonLat } from 'ol/proj';
import { Coordinate } from 'ol/coordinate';
import { useGeographic } from 'ol/proj.js';
import Polyline from 'ol/format/Polyline.js';
import { Source } from 'ol/source';
import { Zoom, ScaleLine, Rotate } from 'ol/control'
//import { applyStyle, MapboxVectorLayer } from 'ol-mapbox-style';
import XYZ from 'ol/source/XYZ';
import VectorTileLayer from 'ol/layer/VectorTile';
import VectorTileSource from 'ol/source/VectorTile';
import { Capacitor } from '@capacitor/core';
import MVT from 'ol/format/MVT';
import { TileGrid, createXYZ } from 'ol/tilegrid';
import { App } from '@capacitor/app';
import { Platform } from '@ionic/angular';

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
  currentTrack: any;
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
  currentInitialMarker: any | undefined = undefined;
  currentFinalMarker: any | undefined = undefined;
  archivedInitialMarker: any | undefined = undefined;
  archivedFinalMarker: any | undefined = undefined;
  currentMarker: any | undefined = undefined;
  lag: number = 8; // 8
  distanceFilter: number = .05; // 5
  filtered: number = -1;
  currentColor: string = 'orange';
  archivedColor: string = 'green';
  stopped: any = 0;
  vMin: number = 1; 
  currentAverageSpeed: number | undefined = undefined;
  currentAverageCorrSpeed: number | undefined = undefined;
  timeCorr: any = undefined;
  currentUnit: string = '' // time unit for canvas ('s' seconds, 'min' minutes, 'h' hours)
  archivedUnit: string = '' // time unit for canvas ('s' seconds, 'min' minutes, 'h' hours)
  archivedFeature: any;
  currentFeature: any; 
  isTracking: boolean = false;
  archived: string = 'visible';
  threshDist: number = 0.00000016; // 0.0004 ** 2;
  lastN: number = 0;
  onRouteColor: string = 'black';
  archivedCanvasVisible: boolean = false;
  currentCanvasVisible: boolean = false;

  constructor(
    public fs: FunctionsService,
    private alertController: AlertController,
    private router: Router,
    public storage: Storage,
    private platform: Platform,
  ) { }

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
    // on init archived map is always visible
    await this.storage.set('archived', 'visible');
    // create canvas
    await this.createCanvas();
    // plot map
    await this.createFeatures();
    await this.createMap();
  }

  // ION VIEW DID ENTER
  async ionViewDidEnter() {
    // change color for current and archived tracks
    await this.changeColor();
    // center map and update canvas 
    if (this.currentTrack) {
      await this.setMapView(this.currentTrack);
      this.currentUnit = await this.updateAllCanvas(this.currentCtx, this.currentTrack);
    }
    // check whether or not archived track shall be visible
    this.archived = await this.check(this.archived, 'archived')
    // in case archived track shall be invisible
    if (this.archived == 'invisible') {
      await this.archivedFeature.setStyle(undefined);
      await this.archivedInitialMarker.setStyle(undefined);
      await this.archivedFinalMarker.setStyle(undefined);
      this.show('ac0','none');
      this.show('ac1','none');
      return;
    }  
    // retrieve archived track
    this.archivedTrack = await this.retrieveTrack() ?? this.archivedTrack;
    // if there is not archived track or it will be invisible.. return 
    if (!this.archivedTrack) return;
    // update canvas
    this.archivedUnit = await this.updateAllCanvas(this.archivedCtx, this.archivedTrack);
    // display track on map
    await this.displayArchivedTrack();
    // center map
    if (!(this.currentTrack) && (this.archivedTrack)) await this.setMapView(this.archivedTrack); 
  }

  // DISPLAY CURRENT TRACK
  async displayCurrentTrack() {
    // no map
    if (!this.map) return;
    // number of points
    let num = this.currentTrack?.features[0].geometry.coordinates.length ?? 0;
    // no points enough
    if (num < 2) return;
    // set line, marker and style
    this.currentFeature.setGeometry(new LineString(
      this.currentTrack.features[0].geometry.coordinates
    ))
    this.currentFeature.setStyle(new Style({ stroke: new Stroke({ color: this.currentColor, width: 5 }) }));
    this.currentMarker.setGeometry(new Point(
      this.currentTrack.features[0].geometry.coordinates[num - 1]
    ))
    // set map view
    if (num == 5 || num == 10 || num == 25 || num % 50 == 0) await this.setMapView(this.currentTrack);
  }

  // START TRACKING /////////////////////////////////
  async startTracking() {
    // if there was a track, remove it
    this.currentTrack = undefined;
    await this.currentFeature.setStyle(undefined);
    await this.currentInitialMarker.setStyle(undefined);
    await this.currentFinalMarker.setStyle(undefined);
    this.currentUnit = await this.updateAllCanvas(this.currentCtx, this.currentTrack);
    // initialize
    this.isTracking = true;
    this.stopped = 0;
    this.currentAverageSpeed = undefined;
    this.currentAverageCorrSpeed = undefined;
    this.timeCorr = undefined;
    // start tracking
    BackgroundGeolocation.addWatcher({
      backgroundMessage: "Cancel to prevent battery drain.",
      backgroundTitle: "Tracking You.",
      requestPermissions: true,
      stale: false,
      distanceFilter: this.distanceFilter
    }, async (location: Location, error: Error) => {
      if (location) {
        await this.buildGeoJson(location);
        await this.displayCurrentTrack();
        let num = await this.currentTrack.features[0].geometry.coordinates.length ?? 0;
        if (num % 20 == 0) this.currentUnit = await this.updateAllCanvas(this.currentCtx, this.currentTrack);
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
    await this.currentFeature.setStyle(undefined);
    await this.currentInitialMarker.setStyle(undefined);
    await this.currentFinalMarker.setStyle(undefined);
    this.currentUnit = await this.updateAllCanvas(this.currentCtx, this.currentTrack);
  }

  // STOP TRACKING //////////////////////////////////
  async stopTracking() {
    // elements visibility
    this.show('start', 'none');
    this.show('stop', 'none');
    this.show('save', 'block');
    this.show('trash', 'block');
    this.isTracking = false;
    // red marker
    let num = this.currentTrack.features[0].geometry.coordinates.length ?? 0;
    if (num > 0) {
      this.currentFinalMarker.setGeometry(new Point(
        this.currentTrack.features[0].geometry.coordinates[num - 1]
      ))
      this.currentFinalMarker.setStyle(new Style({
        image: new CircleStyle({
          radius: 10,
          fill: new Fill({ color: 'red' })
        })
      }))
      this.currentMarker.setStyle(undefined)
    }
    // remove watcher
    await BackgroundGeolocation.removeWatcher({ id: this.watcherId });
    // filter remaining values
    for (var i = this.filtered + 1; i < num; i++) {
      await this.altitudeFilter(i)
    };
    // set map view
    await this.setMapView(this.currentTrack);
    // update canvas
    this.currentUnit = await this.updateAllCanvas(this.currentCtx, this.currentTrack);
  }

  // SET TRACK NAME, TIME, DESCRIPTION, ... 
  async setTrackDetails() {
    console.log('set track details')
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
    console.log(option)
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
  async buildGeoJson(location: Location) {
    // excessive uncertainty / no altitude measured
    if (location.accuracy > this.threshold) return;
    if (location.altitude == null || location.altitude == undefined) return;
    // m/s to km/h
    location.speed = location.speed * 3.6
    // initial point
    if (!this.currentTrack) {
      await this.firstPoint(location);
      return;
    }
    let num = await this.currentTrack.features[0].geometry.coordinates.length ?? 0;
    // check for the locations order...
    for (var i = num - 1; i >= 2; i--) {
      // case tnew < tprevious, remove previous location
      const previous: any = await this.currentTrack.features[0].geometry.properties.data[i].time;
      if (previous > location.time) { 
        await this.currentTrack.features[0].geometry.coordinates.pop();
        await this.currentTrack.features[0].geometry.properties.data.pop();
      }
      else break;
    }
    // compute properties...
    const lastPoint: number[] = await this.currentTrack.features[0].geometry.coordinates[num - 1];
    var distance: number = await this.fs.computeDistance(lastPoint[0], lastPoint[1], location.longitude, location.latitude)
    distance += await this.currentTrack.features[0].geometry.properties.data[num - 1].distance;
    // add properties to geojson
    await this.currentTrack.features[0].geometry.properties.data.push({
      altitude: location.altitude,
      speed: location.speed,
      time: location.time,
      compSpeed: location.speed,
      distance: distance,
    })
    // add coordinates
    await this.currentTrack.features[0].geometry.coordinates.push([location.longitude, location.latitude]);
    num = await this.currentTrack.features[0].geometry.coordinates.length ?? 0;
    // html values
    this.currentTrack.features[0].properties.totalDistance = distance;
    this.currentTrack.features[0].properties.totalTime = this.fs.formatMillisecondsToUTC(location.time - this.currentTrack.features[0].geometry.properties.data[0].time);
    this.currentTrack.features[0].properties.totalNumber = num;
    this.currentTrack.features[0].properties.currentAltitude = location.altitude;
    this.currentTrack.features[0].properties.currentSpeed = location.speed;
    // altitude filter
    if (num > this.lag) {
      await this.altitudeFilter(num - this.lag - 1);
      this.filtered = num - this.lag - 1;
    }
    // speed filter      
    this.currentTrack.features[0].geometry.properties.data = await this.fs.speedFilter(this.currentTrack.features[0].geometry.properties.data, this.lag);
    // average speed
    if (this.currentTrack.features[0].geometry.properties.data[num - 1].compSpeed < this.vMin) {
      this.stopped += (this.currentTrack.features[0].geometry.properties.data[num - 1].time - this.currentTrack.features[0].geometry.properties.data[num - 2].time)/1000
    }
    var tim = await this.currentTrack.features[0].geometry.properties.data[num - 1].time - this.currentTrack.features[0].geometry.properties.data[0].time
    tim = tim / 1000
    this.currentAverageSpeed = 3600 * this.currentTrack.features[0].properties.totalDistance / tim
    if (tim - this.stopped > 5) this.currentAverageCorrSpeed = 3600 * this.currentTrack.features[0].properties.totalDistance / (tim - this.stopped)
    this.timeCorr = this.fs.formatMillisecondsToUTC(1000 * (tim - this.stopped));
    // update canvas and check route
    if (num % 20 == 0) {
      // check route
      if (this.archivedTrack) {
        this.onRouteColor = await this.onRoute() ?? 'black';
      }
      else this.onRouteColor = 'black'
    }
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
          date: '',
          description: '',
          totalDistance: 0,
          totalElevationGain: 0,
          totalElevationLoss: 0,
          totalTime: '',
          totalNumber: 0
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
    await this.currentTrack.features[0].geometry.properties.data.push({
      altitude: location.altitude,
      speed: location.speed,
      time: location.time,
      compSpeed: 0,
      distance: 0,
    })
    await this.currentTrack.features[0].geometry.coordinates.push(
      [location.longitude, location.latitude]
    )
    this.currentInitialMarker.setGeometry(new Point(
      this.currentTrack.features[0].geometry.coordinates[0]
    ));
    this.currentInitialMarker.setStyle(new Style({
      image: new CircleStyle({
        radius: 10,
        fill: new Fill({ color: 'green' })
      })
    }))
    let num = this.currentTrack.features[0].geometry.coordinates.length;
    this.currentMarker.setGeometry(new Point(
      this.currentTrack.features[0].geometry.coordinates[num-1]
    ));
    this.currentMarker.setStyle(new Style({
      image: new CircleStyle({
        radius: 10,
        fill: new Fill({ color: 'blue' })
      })
    }))
  }

  async onRoute() {
    if (!this.currentTrack) return 'black';
    if (!this.archivedTrack) return 'black';
    const num: number = this.currentTrack.features[0].geometry.coordinates.length ?? 0;
    const num2: number = this.archivedTrack.features[0].geometry.coordinates.length ?? 0;
    if (num == 0) return 'black';
    if (num2 == 0) return 'black';
    const point = this.currentTrack.features[0].geometry.coordinates[num - 1];
    for (var i = this.lastN; i < num2; i++) {
      let point2 = this.archivedTrack.features[0].geometry.coordinates[i];
      let dist = (Math.abs(point[0]-point2[0]))**2 + (Math.abs(point[1]-point2[1]))**2;
      if (dist < this.threshDist) {
        this.lastN = i;
        return 'green'
      }
    } 
    for (var i = this.lastN; i >= 0; i--) {
      let point2 = this.archivedTrack.features[0].geometry.coordinates[i];
      let dist = (Math.abs(point[0]-point2[0]))**2 + (Math.abs(point[1]-point2[1]))**2;
       if (dist < this.threshDist) {
        this.lastN = i;
        return 'orange';
      }
    } 
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
  // 4. altitudeFilter()
  // 5. displayArchivedTrack()
  // 6. changeColor()
  // 7. retrieveTrack()

  // SHOW / HIDE ELEMENTS ///////////////////////////////// 
  show(id: string, action: string) {
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
  
  // ALTITUDE FILTER /////////////////////////////////
  async altitudeFilter(i: number) {
    var num = await this.currentTrack.features[0].geometry.coordinates.length ?? 0;
    const start = Math.max(0, i - this.lag);
    const end = Math.min(i + this.lag, num - 1);
    // average altitude
    var sum: number = 0
    for (var j = start; j <= end; j++) sum += this.currentTrack.features[0].geometry.properties.data[j].altitude;
    this.currentTrack.features[0].geometry.properties.data[i].altitude = sum / (end - start + 1);
    // re-calculate elevation gains / losses
    if (i == 0) return;
    var slope = await this.currentTrack.features[0].geometry.properties.data[i].altitude - this.currentTrack.features[0].geometry.properties.data[i - 1].altitude;
    if (slope > 0) this.currentTrack.features[0].properties.totalElevationGain += slope;
    else this.currentTrack.features[0].properties.totalElevationLoss -= slope;
    this.currentTrack.features[0].properties.currentAltitude = await this.currentTrack.features[0].geometry.properties.data[i].altitude;
  }

  // DISPLAY AN ARCHIVED TRACK /////////////////////////
  async displayArchivedTrack() {
    // no map
    if (!this.map) return;
    // no archived track
    if (!this.archivedTrack) return;
    // remove old stuff and create new layer 123 and markers
    this.archivedFeature.setGeometry(new LineString(
      this.archivedTrack.features[0].geometry.coordinates
    ))
    this.archivedFeature.setStyle(new Style({ stroke: new Stroke({ color: this.archivedColor, width: 5 }) }))
    const num = this.archivedTrack.features[0].geometry.coordinates.length;
    this.archivedInitialMarker.setGeometry(new Point(
      this.archivedTrack.features[0].geometry.coordinates[0]
    ));
    this.archivedInitialMarker.setStyle(new Style({
      image: new CircleStyle({
        radius: 10,
        fill: new Fill({ color: 'green' })
      })
    }))
    this.archivedFinalMarker.setGeometry(new Point(
      this.archivedTrack.features[0].geometry.coordinates[num - 1]
    ));
    this.archivedFinalMarker.setStyle(new Style({
      image: new CircleStyle({
        radius: 10,
        fill: new Fill({ color: 'red' })
      })
    }))
  }
  
  async changeColor() {
    var preArchived = this.archivedColor;
    this.archivedColor = await this.check(this.archivedColor, 'archivedColor')
    var preCurrent = this.currentColor;
    this.currentColor = await this.check(this.currentColor, 'currentColor')
    if (this.archivedColor == preArchived && this.currentColor == preCurrent) return;
    // change of color for current feature
    if (this.currentFeature) await this.currentFeature.setStyle(new Style({ stroke: new Stroke({ color: this.currentColor, width: 5 })}));
    if (this.archivedFeature) await this.archivedFeature.setStyle(new Style({stroke: new Stroke({ color: this.archivedColor, width: 5 })}));
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
    // uncheck all
    for (var item of collection) {
      item.isChecked = false;
    }
    await this.storage.set('collection', collection);
    // retrieve track
    track = await this.storage.get(JSON.stringify(key));
    console.log(track)
    return track
  }
  
  /////////////////////////////////////////////////////
  /////////////////////////////////////////////////////
  /////////////////////////////////////////////////////

  /////////////////////////////////////////////////////
  ///////////////////// DISPLAY MAP ///////////////////
  /////////////////////////////////////////////////////

  // CREATE FEATURES /////////////////////////////
  async createFeatures() {
    // create features to hold current track and markers
    this.currentFinalMarker = new Feature({ geometry: new Point([0, 40]) });
    this.currentMarker = new Feature({ geometry: new Point([0, 40]) });
    this.currentFeature = new Feature({ geometry: new LineString([[0, 40], [0, 40]]) });
    this.currentInitialMarker = new Feature({ geometry: new Point([0, 40]) });
    // create features to hold archived track and markers
    this.archivedFeature = new Feature({ geometry: new LineString([[0, 40], [0, 40]]) });
    this.archivedInitialMarker = new Feature({ geometry: new Point([0, 40]) });
    this.archivedFinalMarker = new Feature({ geometry: new Point([0, 40]) });
  } 

  // CREATE MAP /////////////////////////////
  async createMap() {
    // sources for current and archived tracks
    var csource = new VectorSource({ features: [this.currentFeature, this.currentInitialMarker, this.currentMarker, this.currentFinalMarker] });
    var asource = new VectorSource({ features: [this.archivedFeature, this.archivedInitialMarker, this.archivedFinalMarker] });
    // layers for current and archived track
    var currentLayer = new VectorLayer({source: csource});
    var archivedLayer = new VectorLayer({source: asource});
    // Create the map layer
    var olLayer: any;
    olLayer = new TileLayer({ source: new OSM() })
    // Create the map view
    var view = new View({
      center: [1, 41.5],
      zoom: 6,
    });
    // Controls
    var controls = [ new Zoom(), new ScaleLine(), new Rotate() ]
    // Create the map
    this.map = new Map({
      target: 'map',
      layers: [olLayer, currentLayer, archivedLayer],
      view: view,
      controls: controls
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
    var currentCanvas: any;
    var archivedCanvas: any;
    // show canvas
    this.show('cc0','block');
    this.show('cc1','block');
    this.show('ac0','block');
    this.show('ac1','block');
    // loop on canvas types
    for (var i in this.properties) {
      // get canvas to plot current track and define their height and width
      currentCanvas = document.getElementById('currentCanvas' + i) as HTMLCanvasElement;
      currentCanvas.width = window.innerWidth;
      currentCanvas.height = window.innerWidth;
      // get canvas to plot archived track and define their height and width
      archivedCanvas = document.getElementById('archivedCanvas' + i) as HTMLCanvasElement;
      archivedCanvas.width = window.innerWidth;
      archivedCanvas.height = window.innerWidth;
      // define their contexts
      this.currentCtx[i] = await currentCanvas.getContext("2d");
      this.archivedCtx[i] = await archivedCanvas.getContext("2d");
    }
    // define canvasNum as height and width
    this.canvasNum = window.innerWidth;
    // hide canvas
    this.show('cc0','none');
    this.show('cc1','none');
    this.show('ac0','none');
    this.show('ac1','none');
  }
 
  async updateAllCanvas(context: any, track: any) {
    // hide canvas
    console.log('canvasupdate', track)
    if (track == this.currentTrack) {
      this.show('cc0','none');
      this.show('cc1','none'); }
    else if (track == this.archivedTrack) {
      this.show('ac0','none');
      this.show('ac1','none');
    }
    var tUnit: string = '';
    if (!context) return tUnit
    for (var i in this.properties) {
      if (this.properties[i] == 'altitude') await this.updateCanvas(context[i], track, this.properties[i], 'x');
      else tUnit = await this.updateCanvas(context[i], track, this.properties[i], 't');
    }
    return tUnit;
  }

  // UPDATE CANVAS ///////////////////////////////////
  async updateCanvas(ctx: CanvasRenderingContext2D | undefined, track: any, propertyName: keyof Data, xParam: string) {
    console.log('canvasupdate222', track)
    var tUnit: string = ''
    if (!ctx) return tUnit;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvasNum, this.canvasNum);
    if (!track) return tUnit;
    // show canvas
    console.log('canvasupdate333', track)
    if (track == this.currentTrack) {
      this.show('cc0','block');
      this.show('cc1','block'); }
    else if (track == this.archivedTrack) {
      this.show('ac0','block');
      this.show('ac1','block');
    }
    var num = await track.features[0].geometry.properties.data.length ?? 0;
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

}

