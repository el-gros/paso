     // 1. IMPORTS
 
import { Location, Bounds, Track, TrackDefinition, Data } from '../../globald';
import { FunctionsService } from '../functions.service';
import { Component, ChangeDetectorRef} from '@angular/core';
import { IonicModule, AlertController } from '@ionic/angular';
import { ExploreContainerComponent } from '../explore-container/explore-container.component';
import { global } from '../../environments/environment';
import { CommonModule, DecimalPipe, DatePipe } from '@angular/common';
import { Router } from '@angular/router';
import {registerPlugin} from "@capacitor/core";
const BackgroundGeolocation: any = registerPlugin("BackgroundGeolocation");
import { Storage } from '@ionic/storage-angular';
import tt from '@tomtom-international/web-sdk-maps';
import { FormsModule } from '@angular/forms';
import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { register } from 'swiper/element/bundle';
register();
import mapboxgl from 'mapbox-gl';

@Component({
  selector: 'app-tab1',
  templateUrl: 'tab1.page.html',
  styleUrls: ['tab1.page.scss'],
  standalone: true,
  imports: [IonicModule, ExploreContainerComponent, CommonModule, FormsModule],
  providers: [DecimalPipe, DatePipe],
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
})

export class Tab1Page   {

  watcherId: any = 0;
  currentTrack: any = null;
  archivedTrack: any = null;
  vMax: number = 400; 
  ctx: CanvasRenderingContext2D[] = [];
  archivedCtx: CanvasRenderingContext2D[] = [];
  canvasNum: number = 400; // canvas size
  margin: number = 10;
  threshold: number = 20;
  properties: (keyof Data)[] = ['altitude', 'compSpeed'];
  gridsize: string = '-';
  currentAltitude: number = 0;
  currentSpeed: number = 0;
  currentDistance: number = 0;
  currentElevationGain: number = 0;
  currentElevationLoss: number = 0;
  currentTime: any = '00:00:00';
  currentNumber: number = 0;
  archivedDistance: number = 0;
  archivedElevationGain: number = 0;
  archivedElevationLoss: number = 0;
  archivedTime: any = '00:00:00';
  oldNumber: number = 0;
  collection: TrackDefinition[] = [];
  map: any;
  currentInitialMarker: any | undefined = undefined;
  currentFinalMarker: any | undefined = undefined;
  archivedInitialMarker: any | undefined = undefined;
  archivedFinalMarker: any | undefined = undefined;
  currentMarker: any | undefined = undefined;
  lag: number = global.lag; // 8
  distanceFilter: number = .05; // 5
  filtered: number = -1; 
  style: any;

  provider: string = 'Tomtom' // Tomtom or Mapbox;
  mapStyle: string = 'basic';
  previousTrack: any = null;
  currentColor: string = 'orange';
  archivedColor: string = 'green';
  intervalId: any;

  constructor(
    private cd: ChangeDetectorRef,
    public fs: FunctionsService,
    private alertController: AlertController,
    private router: Router,
    private storage: Storage,
  ) { }          

  // ON INIT ////////////////////////////////
  async ngOnInit() {
    // create storage 
    await this.storage.create();
    // map provider
    try{this.provider = await this.storage.get('provider'); }
    catch {}
    // map style
    try{this.mapStyle = await this.storage.get('style'); }
    catch{}
    // archived track
    await this.storage.set('archived', 'visible'); 
    // create canvas
    await this.createCanvas();
    // plot map
    this.style = await this.fs.selectStyle(this.provider, this.mapStyle)
    if (this.provider == 'Tomtom') await this.createTomtomMap();
    else await this.createMapboxMap();
    // elements shown
    this.show('map', 'block');
    this.show('data', 'none');
    this.show('start', 'block');
    this.show('stop', 'none');
    this.show('save', 'none');
    this.show('trash', 'none');
    this.show('mapbutton', 'none');
    this.show('databutton', 'block');
  }  

  // CREATE ALL CANVAS ////////////////////////
  async createCanvas() {
    var canvas: any
    var archivedCanvas: any;
    for (var i in this.properties) {
      canvas = document.getElementById('canvas' + i) as HTMLCanvasElement;
      archivedCanvas = document.getElementById('oldcanvas' + i) as HTMLCanvasElement;
      this.ctx[i] = await canvas.getContext("2d");
      this.archivedCtx[i] = await archivedCanvas.getContext("2d");
    }
    canvas.width = window.innerWidth;
    canvas.height = canvas.width;
    this.canvasNum = canvas.width;
  }

  // CREATE TOMTOM MAP //////////////////////////////
  async createTomtomMap() {
    // create Tomtom map
    this.map = tt.map({
      key: "YHmhpHkBbjy4n85FVVEMHBh0bpDjyLPp", //TomTom
      container: 'map',
      center: [1, 41.5],
      zoom: 6,
      style: this.style
    });
    // once loaded, resize and add controls
    this.map.on('load',() =>{
      this.map.resize();
      this.map.addControl(new tt.NavigationControl()); 
      this.map.addControl(new tt.ScaleControl());
      this.map.addControl(new tt.GeolocateControl({
        positionOptions: {
          enableHighAccuracy: true,
        },
        trackUserLocation: true,		
      }));
    });
  }

  // CREATE MAPBOX MAP //////////////////////////////
  async createMapboxMap() {
    // create Mapbox map
    this.map = new mapboxgl.Map({
      container: 'map',
      accessToken: "pk.eyJ1IjoiZWxncm9zIiwiYSI6ImNsdnUzNzh6MzAwbjgyanBqOGN6b3dydmQifQ.blr7ueZqkjw9LbIT5lhKiw",
      style: this.style,
      center: [1, 41.5],
      zoom: 6,
      trackResize: true,
    });
    // once loaded, resize and add controls
    this.map.on('load',() =>{
      this.map.resize();
      this.map.addControl(new mapboxgl.NavigationControl());
      this.map.scrollZoom.disable();
    });      
  }

  // SHOW / HIDE ELEMENTS ///////////////////////////////// 
  show (id: string, action: string) {
    var obj: HTMLElement | null = document.getElementById(id);
    if (!obj) return;
    obj.style.display = action
  }

  ///////////////////////////////////////////////////////////////
  ///////////////////////////////////////////////////////////////

  // ION VIEW DID ENTER
  async ionViewDidEnter() {
    // change map provider
    await this.changeMapProvider();
    // change map style and tracks color
    await this.changeStyleColor();
    // archived track
    var visible: boolean = await this.archivedVisibility();
    if (!visible) return;
    // check if an archived track has to be displayed
    // retrieve track
    await this.retrieveTrack();
    // check if there is track or it did not change
    if (!this.archivedTrack) return;
    if (this.previousTrack == this.archivedTrack) return;
    // write variables
    await this.archivedHtml();
    // update canvas
    try {await this.updateAllCanvas(this.archivedCtx, this.archivedTrack); }
    catch {}
    // display track on map
    await this.displayArchivedTrack();
    this.previousTrack = this.archivedTrack; 
    // adapt view
    await this.setMapView(this.archivedTrack);
  }

  // CHANGE MAP PROVIDER //////////////////////////////
  async changeMapProvider() {
    var preProvider = this.provider;
    try{this.provider = await this.storage.get('provider'); }
    catch {}
    if (preProvider == this.provider) return;
    this.map.remove();
    // plot map
    this.style = await this.fs.selectStyle(this.provider, this.mapStyle)
    if (this.provider == 'Tomtom') await this.createTomtomMap();
    else await this.createMapboxMap();
    this.map.on('load', async () => {
      // display old track on map
      await this.displayArchivedTrack();
      // display current track
      await this.displayCurrentTrack(); 
    })
  }

  // CHANGE MAP STYLE AND TRACK COLOR //////////////////
  async changeStyleColor() {
    var preArchived = this.archivedColor;
    try{this.archivedColor = await this.storage.get('archivedColor'); }
    catch {}
    var preCurrent = this.currentColor;
    try{this.currentColor = await this.storage.get('currentColor'); }
    catch {}
    var preStyle = this.mapStyle;
    try{this.mapStyle = await this.storage.get('style'); }
    catch {}
    if (this.archivedColor == preArchived && this.currentColor == preCurrent && this.mapStyle == preStyle) return;
    await this.removeLayer('122');
    await this.removeLayer('123');
    this.style = await this.fs.selectStyle(this.provider, this.mapStyle)
    await this.map.setStyle(this.style)
    await new Promise(f => setTimeout(f, 500));
    // display old track on map
    await this.displayArchivedTrack();
    // display current track
    await this.displayCurrentTrack(); 
  }

  // ADD LAYER ///////////////////////////////
  async addLayer(which: string) {
    var id: string;
    var color: string;
    var track: any;
    if (which == 'Current') {
      id = '122';
      color = this.currentColor;
      track = this.currentTrack;
    }
    else {
      id = '123';
      color = this.archivedColor;
      track = this.archivedTrack;
    }
    this.map.addSource(id, { type: 'geojson', data: track });
    this.map.addLayer({
        'id': id,
        'type': 'line',
        'source': id,
        'paint': {
            'line-color': color,
            'line-width': 5
        }
    });
  }

  // CHECK VISIBILITY OF ARCHIVED TRACK ////////////////////
  async archivedVisibility() {
    try{var archived = await this.storage.get('archived'); }
    catch{}
    if (archived == 'visible') return true
    else {
      await this.removeLayer('123');
      return false;
    }
  }

  // RETRIEVE ARCHIVED TRACK //////////////////////////
  async retrieveTrack() {
    // get collection
    this.collection = await this.storage.get('collection'); 
    if (!this.collection) this.collection = [];
    // compute number of checked tracks
    var numChecked = 0;
    for (var item of this.collection) {
      if (item.isChecked) numChecked = numChecked + 1;
      if (numChecked > 1) break;
    }
    // if more than one track is checked, uncheck all
    if (numChecked > 1)  {
      for (var item of this.collection) { item.isChecked = false; }      
      numChecked = 0; 
    } 
    // if no checked items
    if (numChecked == 0) return;
    // find key
    var key: any;
    for (var i in this.collection) {  
      if (this.collection[i].isChecked) {
        key = this.collection[i].date;
        break;
      }
    }    
    // retrieve track
    this.archivedTrack = await this.storage.get(JSON.stringify(key));
    // uncheck all
    for (var item of this.collection) {
      item.isChecked = false;
    }
    await this.storage.set('collection', this.collection); 
  }

  // DISPLAY VALUES OF ARCHIVED TRACK ////////////////////////
  async archivedHtml() {
    var num: number = this.archivedTrack.features[0].geometry.coordinates.length;
    var abb: any = this.archivedTrack.features[0].geometry.properties.data; 
    if (num > 0) {
      this.archivedTime = this.fs.formatMillisecondsToUTC(abb[num-1].time - abb[0].time);
      this.archivedDistance = abb[num-1].distance;
      this.archivedElevationGain = abb[num-1].elevationGain;
      this.archivedElevationLoss = abb[num-1].elevationLoss;
      this.oldNumber = num;
    }
  }

  // UPDATE ALL CANVAS ///////////////////////////////////
  async updateAllCanvas(context: any, track: any) {
    if (!track) return
    for (var i in this.properties) {
      if (this.properties[i] == 'altitude') await this.updateCanvas(context[i], track, this.properties[i], 'x');
      else await this.updateCanvas(context[i], track, this.properties[i], 't');
    }  
  } 

  // DISPLAY AN ARCHIVED TRACK /////////////////////////
  async displayArchivedTrack() {
    // no map
    if (!this.map) return;
    // no archived track
    if (!this.archivedTrack) return;
    // remove old stuff and create new layer 123 and markers
    await this.removeLayer('123');
    this.addLayer('Archived')
    this.archivedInitialMarker = await this.createMarker('Archived', 'Initial');
    this.archivedFinalMarker = await this.createMarker('Archived', 'Final');
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
    // map view
    await this.map.resize();
    console.log('1', minLng)
    await this.map.setCenter({lng: 0.5*(maxLng + minLng), lat: 0.5*(maxLat + minLat)});
    console.log('2', minLng)
    await this.map.fitBounds([[minLng, minLat], [maxLng, maxLat]], { padding: 50 });
  }

  // DISPLAY CURRENT TRACK
  async displayCurrentTrack() {
    var num: number = 0;
    try{ num = this.currentTrack.features[0]?.geometry.coordinates.length;}
    catch {}
    // no map
    if (!this.map) return;
    // no points enough
    if (num < 2) return;
    // just in case layer 122 didn't exist...
    try {await this.addLayer('Current')}
    catch {}
    // update
    await this.map.getSource('122').setData(this.currentTrack); 
    if (this.currentMarker) this.currentMarker.remove();        
    this.currentMarker = await this.createMarker('Current', 'Current')
    if (!this.currentInitialMarker) await this.createMarker('Current', 'Initial')
  }

  // REMOVE LAYER AND MARKERS
  async removeLayer(id: string) {
    // remove layer and source
    if (this.map.getLayer(id)) {
      await this.map.removeLayer(id)
      await this.map.removeSource(id)
    }
    // remove markers
    if (id == '122') {
      if (this.currentInitialMarker) await this.currentInitialMarker.remove();
      if (this.currentFinalMarker) await this.currentFinalMarker.remove();
      if (this.currentMarker) await this.currentMarker.remove();        
    }
    else if (id == '123') {
      if (this.archivedInitialMarker) await this.archivedInitialMarker.remove();
      if (this.archivedFinalMarker) await this.archivedFinalMarker.remove();
    }
  }

  // UPDATE CANVAS ///////////////////////////////////
  async updateCanvas (ctx: CanvasRenderingContext2D | undefined, track: any, propertyName: keyof Data, xParam: string) {
    if (!track) return;
    if (!ctx) return;
    var abb = track.features[0].geometry.properties.data;
    var num = abb.length;
    if (propertyName == 'simulated') return;
    if (xParam == 'x') var xTot = abb[num - 1].distance;
    else xTot = abb[num - 1].time - abb[0].time;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvasNum, this.canvasNum);
    // compute bounds
    const bounds: Bounds = await this.fs.computeMinMaxProperty(abb, propertyName);
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
    for (var i in abb) {
      if (xParam == 'x') ctx.lineTo(abb[i].distance, abb[i][propertyName])
      else {
        var inter = abb[i].time - abb[0].time;
        ctx.lineTo(inter, abb[i][propertyName])
      }
    }     
    ctx.lineTo(xTot,bounds.min);
    ctx.closePath();
    ctx.fillStyle = 'yellow';
    ctx.fill();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // grid
    await this.grid(ctx, 0, xTot, bounds.min, bounds.max, a, d, e, f) 
  }

  // GRID /////////////////////////////////////////////////////
  async grid(ctx: CanvasRenderingContext2D | undefined , xMin: number, xMax: number, yMin: number, yMax: number, a: number, d: number, e: number, f: number) {
    if (!ctx) return;
    ctx.font = "15px Arial"
    const gridx = this.fs.gridValue(xMax - xMin);
    const gridy = this.fs.gridValue(yMax - yMin);
    const fx = Math.ceil(xMin / gridx);
    const fy = Math.ceil(yMin / gridy);
    ctx.setLineDash([5, 15]);
    ctx.strokeStyle = 'black';
    ctx.fillStyle = 'black'  
    // vertical lines
    for (var xi = fx * gridx; xi <= xMax; xi = xi + gridx) {
      ctx.beginPath();
      ctx.moveTo(xi*a+e, yMin*d+f);
      ctx.lineTo(xi*a+e, yMax*d+f);
      ctx.stroke();
      ctx.fillText(xi.toLocaleString(),xi*a+e + 2,yMax*d+f + 2)
    }
    // horizontal lines
    for (var yi = fy * gridy; yi <= yMax; yi = yi + gridy) {
      ctx.beginPath();
      ctx.moveTo(xMin*a+e, yi*d+f);
      ctx.lineTo(xMax*a+e, yi*d+f);
      ctx.stroke();
      ctx.fillText(yi.toLocaleString(),xMin*a+e + 2, yi*d+f - 2)
    }
    ctx.setLineDash([]);
  }

  ///////////////////////////////////////////////////////////////
  ///////////////////////////////////////////////////////////////

  // START TRACKING /////////////////////////////////
  async startTracking() {
    console.log(this.watcherId)
    // initialize
    this.initialize();
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
        await this.currentHtml();
        await this.displayCurrentTrack();
        //await this.updateAllCanvas(this.ctx, this.currentTrack);
        this.cd.detectChanges();
      }
    }).then((value: any) => this.watcherId = value);
    // show / hide elements
    this.show('start', 'none');
    this.show('stop', 'block');
    this.show('trash', 'none');
    this.show('save', 'none');
  }

  // INITIALIZE /////////////////////////////////
  async initialize() {
    // in case of a new track, initialize variables
    this.currentTrack = {
      type: 'FeatureCollection',
      features: [{
        type: 'feature',
        properties: {
          name: '',
          place: '',
          date: null,
          description: '',
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
    await this.removeLayer('122')  
    this.currentAltitude = 0;
    this.currentSpeed = 0;
    this.currentDistance = 0;
    this.currentElevationGain = 0;
    this.currentElevationLoss = 0;
    this.currentTime = '00:00:00';
    this.currentNumber = 0;
  } 
  
  // BUILD GEOJSON ////////////////////////////////////
  async buildGeoJson(location: Location) {
    var num: number = 0; 
    try {num = this.currentTrack.features[0].geometry.coordinates.length; }
    catch {}
    // m/s to km/h
    location.speed = location.speed * 3.6
    // excessive uncertainty / no altitude measured
    if (location.accuracy > this.threshold) return;
    if (location.altitude == null) return;
    // initial point
    if (num == 0) {
      this.firstPoint(location); 
      return;
    }  
    // check for the locations order...
    for (var i = num - 1; i>=1; i--) {
      // case tnew < tprevious, remove previous location
      const previous: any = this.currentTrack.features[0].geometry.properties.data[i].time;
      if (previous > location.time) { await this.removePrevious(); }
      else break;
    }
    num = 0; 
    try {num = this.currentTrack.features[0].geometry.coordinates.length; }
    catch {}
    if (num == 0) {
      this.firstPoint(location); 
      return;
    }  
    // compute properties...
    var abb = this.currentTrack.features[0].geometry.properties.data;
    const lastPoint: number[] = this.currentTrack.features[0].geometry.coordinates[num - 1];
    var distance: number = await this.fs.computeDistance(lastPoint[0], lastPoint[1], location.longitude, location.latitude)
    var time: number = location.time;
    const compSpeed = 3600000 * distance / time;
    if (compSpeed > this.vMax) return;
    distance = abb[num-1].distance + distance;
    // add properties to geojson
    abb.push({
      accuracy: location.accuracy,
      altitude: location.altitude,
//      altitudeAccuracy: location.altitudeAccuracy,
//      bearing: location.bearing,
//      simulated: location.simulated,
      speed: location.speed,
      time: location.time,
      compSpeed: compSpeed,
      distance: distance,
      elevationGain: abb[num-1].elevationGain,
      elevationLoss: abb[num-1].elevationLoss,
//      accTime: time
    })
    // add coordinates
    this.currentTrack.features[0].geometry.coordinates.push([location.longitude, location.latitude]);
    // altitude filter
    num = this.currentTrack.features[0].geometry.coordinates.length;
    if (num > this.lag) {
      await this.altitudeFilter(num - this.lag -1);
      this.filtered = num - this.lag -1;
    }  
    // speed filter
    abb = await this.fs.speedFilter(abb, num, this.lag);
    this.currentTrack.features[0].geometry.properties.data = abb;
    // ippdate canvas
    if (num % 20 == 0) await this.updateAllCanvas(this.ctx, this.currentTrack);
  }

  // DISPLAY VALUES FROM THE CURRENT TRACK ///////////////////
  async currentHtml() {
    var num: number = this.currentTrack.features[0].geometry.coordinates.length;
    var abb: any = this.currentTrack.features[0].geometry.properties.data; 
    if (num > 0) {
      this.currentTime = this.fs.formatMillisecondsToUTC(abb[num-1].time - abb[0].time);
      this.currentDistance = abb[num-1].distance;
      this.currentNumber = num;
      this.currentAltitude = abb[num-1].altitude;
      this.currentSpeed = abb[num-1].speed;
    }
  }

  // FIRST POINT OF THE TRACK /////////////////////////////
  async firstPoint(location: Location) {
    this.currentTrack.features[0].geometry.properties.data.push({
      accuracy: location.accuracy,
      altitude: location.altitude,
  //    altitudeAccuracy: location.altitudeAccuracy,
  //    bearing: location.bearing,
  //    simulated: location.simulated,
      speed: location.speed,
      time: location.time,
      compSpeed: 0,
      distance: 0,
      elevationGain: 0,
      elevationLoss: 0,
  //    accTime: 0
    })
    this.currentTrack.features[0].geometry.coordinates.push(
      [location.longitude, location.latitude]
    )
    await this.addLayer('Current');
    this.currentInitialMarker = await this.createMarker('Current', 'Initial');
  }

  // REMOVE PREVIOUS POINT ///////////////////////
  async removePrevious() {
    // we suppose the previous location is in the same subtrail
    this.currentTrack.features[0].geometry.coordinates.pop();
    this.currentTrack.features[0].geometry.properties.data.pop();
  }

  // CREATE MARKER ///////////////////////////////////
  async createMarker(which: string, where: string) {
    var track: any
    var num: number = 0;
    var point: any;
    var marker: any; 
    var color: string;
    // track selection
    if (which == 'Archived') {
      track = this.archivedTrack.features[0].geometry.coordinates;
    }
    else {
      track = this.currentTrack.features[0].geometry.coordinates
    }
    try {num = track.length}
    catch {}
    if (num == 0) return;
    // point and color selection
    if (where == 'Initial') {
      point = [track[0][0], track[0][1]];
      color = 'green'
    }
    else if (where == 'Current') {
      point = [track[num - 1][0], track[num - 1][1]];
      color = 'blue';            
    }
    else {
      point = [track[num - 1][0], track[num - 1][1]];
      color = 'red';            
    }
    var char: any = {color: color, width: '25px', height: '25px'}
    // marker creation
    if (this.provider == 'Tomtom') marker = new tt.Marker(char).setLngLat(point).addTo(this.map);
    else marker = new mapboxgl.Marker(char).setLngLat(point).addTo(this.map);
    return marker;
  }

  // ALTITUDE FILTER /////////////////////////////////
  async altitudeFilter(i: number) {
    var abb: any = this.currentTrack.features[0].geometry.properties.data;
    var num = this.currentTrack.features[0].geometry.coordinates.length;
    const start = Math.max(0, i-this.lag);
    const end = Math.min(i+this.lag, num - 1);
    // average altitude
    var sum: number = 0
    for (var j= start; j<=end;j++) sum = sum + abb[j].altitude;
    abb[i].altitude = sum/(end - start +1);
    // re-calculate elevation gains / losses
    if (i==0) return;
    var slope = abb[i].altitude - abb[i-1].altitude;
    if (slope > 0) {
      abb[i].elevationGain = abb[i-1].elevationGain + slope; 
      abb[i].elevationLoss = abb[i-1].elevationLoss
    }
    else {
      abb[i].elevationGain = abb[i-1].elevationGain; 
      abb[i].elevationLoss = abb[i-1].elevationLoss - slope
    }
    this.currentElevationGain = abb[i].elevationGain;
    this.currentElevationLoss = abb[i].elevationLoss;
    this.currentTrack.features[0].geometry.properties.data = abb
  } 

  // TIMER FOR CANVAS UPDATING /////////////////////////////////
  async interval() {
    await this.updateAllCanvas(this.ctx, this.currentTrack)
  }  

  // REMOVE TRACK ///////////////////////////////////
  async removeTrack() {
    this.show('start', 'block');
    this.show('stop', 'none');
    this.show('save', 'none');
    this.show('trash', 'none');
    // new track: initialize all variables and plots
    this.initialize();
  }

  // STOP TRACKING //////////////////////////////////
  async stopTracking() {
    console.log(this.watcherId)
    this.show('start', 'none');
    this.show('stop', 'none');
    this.show('save', 'block');
    this.show('trash', 'block');
    // red marker
    var num: number = 0;
    try {num = this.currentTrack.features[0].geometry.coordinates.length; }
    catch {}
    if (num > 0) this.currentFinalMarker = await this.createMarker('Current', 'Final')
    // remove watcher
    await BackgroundGeolocation.removeWatcher({id: this.watcherId});
    // filter remaining values
    for (var i = this.filtered + 1; i < num; i++) {
      await this.altitudeFilter(i)
    };
    // update map
    await this.setMapView(this.currentTrack);
    // update canvas
    this.intervalId = setInterval(this.interval, 20000); 
    // stop interval
    clearInterval(this.intervalId);
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
    // retrieve tracks definition
    this.collection = await this.storage.get('collection'); 
    if (!this.collection) this.collection = [];
    // build new track definition
    var abb: any = this.currentTrack.features[0].properties
    abb.name = name;
    abb.place = place;
    abb.description = description;
    abb.date = new Date();
    this.currentTrack.features[0].properties = abb
    await this.storage.set(JSON.stringify(abb.date), this.currentTrack);
    const trackDef = {name: abb.name, date: abb.date, place: abb.place, description: abb.description, isChecked: false};
    // add new track definition and save collection
    this.collection.push(trackDef);
    await this.storage.set('collection', this.collection)
    this.show('start', 'block');
       this.show('stop', 'none');
    this.show('save', 'none');
    this.show('trash', 'block');
  }

  // ON BOTTON CLICK... //////////////////////////////
  async buttonClick(option: string) {
    if (option == 'play') await this.startTracking();
    else if (option == 'stop') await this.stopTracking();
    else if (option == 'save') await this.setTrackDetails();  
    else if (option == 'trash') await this.removeTrack();  
    else if (option == 'map') {
      this.show('map', 'block');
      this.show('data', 'none');
      this.show('mapbutton', 'none');
      this.show('databutton', 'block');
    }
    else if (option == 'data') {
      this.show('map', 'none');
      this.show('data', 'block');
      this.show('mapbutton', 'block');
      this.show('databutton', 'none');
    }
    else if (option == 'settings') this.router.navigate(['tab3']);
    else if (option == 'list') this.router.navigate(['tab2']);
  }

}
