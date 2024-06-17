// 1. IMPORTS

import { Location, Bounds, Track, TrackDefinition, Data } from '../../globald';
import { FunctionsService } from '../functions.service';
import { Component, ChangeDetectorRef } from '@angular/core';
import { IonicModule, AlertController } from '@ionic/angular';
import { ExploreContainerComponent } from '../explore-container/explore-container.component';
import { global } from '../../environments/environment';
import { CommonModule, DecimalPipe, DatePipe } from '@angular/common';
import { Router } from '@angular/router';
import { registerPlugin } from "@capacitor/core";
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

export class Tab1Page {

  watcherId: any = 0;
  currentTrack: any;
  archivedTrack: Track | undefined;
  previousTrack: Track | undefined;
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
  lag: number = global.lag; // 8
  distanceFilter: number = .05; // 5
  filtered: number = -1;
  style: any;
  provider: string = 'Tomtom' // Tomtom or Mapbox;
  mapStyle: string = 'basic';
  currentColor: string = 'orange';
  archivedColor: string = 'green';
  stopped: any = 0;
  vMin: number = 1; 
  currentAverageSpeed: number | undefined = undefined;
  currentAverageCorrSpeed: number | undefined = undefined;
  switch: boolean = true;
  timeCorr: any;

  constructor(
    private cd: ChangeDetectorRef,
    public fs: FunctionsService,
    private alertController: AlertController,
    private router: Router,
    public storage: Storage,
  ) { }

  // ON INIT ////////////////////////////////
  async ngOnInit() {
    if (!this.switch) return;
    // create storage 
    await this.storage.create();
    // map provider
    this.provider = await this.check(this.provider, 'provider')
    // map style
    this.mapStyle = await this.check(this.mapStyle, 'style')
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
    var currentCanvas: any;
    var archivedCanvas: any;
    //    this.canvasNum = window.innerWidth;
    for (var i in this.properties) {
      currentCanvas = document.getElementById('currentCanvas' + i) as HTMLCanvasElement;
      currentCanvas.width = window.innerWidth;
      currentCanvas.height = window.innerWidth;
      archivedCanvas = document.getElementById('archivedCanvas' + i) as HTMLCanvasElement;
      archivedCanvas.width = window.innerWidth;
      archivedCanvas.height = window.innerWidth;
      this.currentCtx[i] = await currentCanvas.getContext("2d");
      this.archivedCtx[i] = await archivedCanvas.getContext("2d");
    }
    this.canvasNum = window.innerWidth;
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
    this.map.on('load', async () => {
      this.map.resize();
      this.map.addControl(new tt.NavigationControl());
      this.map.addControl(new tt.ScaleControl());
      this.map.addControl(new tt.GeolocateControl({
        positionOptions: {
          enableHighAccuracy: true,
        },
        trackUserLocation: true,
      }))
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
    this.map.on('load', async () => {
      this.map.resize();
      this.map.addControl(new mapboxgl.NavigationControl());
      this.map.scrollZoom.disable();
    });
  }

  /*
    async mapboxReady() {
      if (this.map.isStyleLoaded()) {
        this.map.resize();
        this.map.addControl(new mapboxgl.NavigationControl());
        this.map.scrollZoom.disable();
      }
      else {
        await new Promise(f => setTimeout(f, 200));
        await this.mapboxReady();
      }
    }
    */

  // SHOW / HIDE ELEMENTS ///////////////////////////////// 
  show(id: string, action: string) {
    var obj: HTMLElement | null = document.getElementById(id);
    if (!obj) return;
    obj.style.display = action
  }

  ///////////////////////////////////////////////////////////////
  ///////////////////////////////////////////////////////////////

  // ION VIEW DID ENTER
  async ionViewDidEnter() {
    if (!this.switch) return;
    // change map provider
    await this.changeMapProvider();
    // change map style and tracks color
    await this.changeStyleColor();
    // archived track
    var visible: boolean = await this.archivedVisibility();
    if (!visible) return;
    // retrieve track
    this.archivedTrack = await this.retrieveTrack() ?? this.archivedTrack;
    console.log(this.archivedTrack)
    // check if there is track or it did not change
    if (!this.archivedTrack) return;
    if (this.previousTrack == this.archivedTrack) return;
    // update canvas
    await this.updateAllCanvas(this.archivedCtx, this.archivedTrack);
    // display track on map
    await this.displayArchivedTrack();
    // adapt view
    await this.setMapView(this.archivedTrack);
  }

  // CHANGE MAP PROVIDER //////////////////////////////
  async changeMapProvider() {
    var preProvider = this.provider;
    this.provider = await this.check(this.provider, 'provider')
    if (preProvider == this.provider) return;
    this.map.remove();
    // plot map
    this.style = await this.fs.selectStyle(this.provider, this.mapStyle)
    if (this.provider == 'Tomtom') await this.createTomtomMap();
    else await this.createMapboxMap();
    // update custom layers
    this.map.on('load', async () => {
      // display old track on map
      if (this.archivedTrack) await this.displayArchivedTrack();
      // display current track
      if (this.currentTrack) {
        await this.addCurrentLayer()
        this.currentInitialMarker = await this.createMarker('Current', 'Initial');
      }
      // update canvas
      await this.updateAllCanvas(this.currentCtx, this.currentTrack);
      await this.updateAllCanvas(this.archivedCtx, this.archivedTrack);
    })
  }


  // CHANGE MAP STYLE AND TRACK COLOR //////////////////
  async changeStyleColor() {
    var preArchived = this.archivedColor;
    this.archivedColor = await this.check(this.archivedColor, 'archivedColor')
    var preCurrent = this.currentColor;
    this.currentColor = await this.check(this.archivedColor, 'currentColor')
    var preStyle = this.mapStyle;
    this.mapStyle = await this.check(this.mapStyle, 'style')
    if (this.archivedColor == preArchived && this.currentColor == preCurrent && this.mapStyle == preStyle) return;
    await this.removeLayer('122');
    await this.removeLayer('123');
    this.style = await this.fs.selectStyle(this.provider, this.mapStyle)
    await this.map.setStyle(this.style)
    await this.styleReady();
  }

  async styleReady() {
    if (this.map.isStyleLoaded()) {
      // display old track on map
      if (this.archivedTrack) await this.displayArchivedTrack();
      // display current track
      if (this.currentTrack) {
        await this.addCurrentLayer()
        this.currentInitialMarker = await this.createMarker('Current', 'Initial');
      }
      // update canvas
      await this.updateAllCanvas(this.currentCtx, this.currentTrack);
      await this.updateAllCanvas(this.archivedCtx, this.archivedTrack);
    }
    else {
      await new Promise(f => setTimeout(f, 200));
      await this.styleReady();
    }
  }

  // ADD CURRENT LAYER ///////////////////////////////
  async addCurrentLayer() {
    console.log('id ', '122')
    await this.map.addSource('122', { type: 'geojson', data: this.currentTrack });
    await this.map.addLayer({
      'id': '122',
      'type': 'line',
      'source': '122',
      'paint': {
        'line-color': this.currentColor,
        'line-width': 5
      }
    });
  }

  // ADD ARCHIVED LAYER
  async addArchivedLayer() {
    this.map.addSource('123', { type: 'geojson', data: this.archivedTrack });
    this.map.addLayer({
      'id': '123',
      'type': 'line',
      'source': '123',
      'paint': {
        'line-color': this.archivedColor,
        'line-width': 5
      }
    });
    this.previousTrack = this.archivedTrack;
  }

  // CHECK VISIBILITY OF ARCHIVED TRACK ////////////////////
  async archivedVisibility() {
    var archived: string = 'visible';
    archived = await this.check(archived, 'archived')
    if (archived == 'visible') return true
    else {
      await this.removeLayer('123');
      this.archivedTrack = undefined;
      await this.updateAllCanvas(this.archivedCtx, this.archivedTrack);
      return false;
    }
  }

  // UPDATE ALL CANVAS ///////////////////////////////////
  async updateAllCanvas(context: any, track: any) {
    if (!context) return
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
    this.addArchivedLayer();
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
    await this.map.fitBounds([[minLng, minLat], [maxLng, maxLat]], { padding: 80 });
  }

  // DISPLAY CURRENT TRACK
  async displayCurrentTrack() {
    let num = this.currentTrack?.features[0].geometry.coordinates.length ?? 0;
    // no map
    if (!this.map) return;
    // no points enough
    if (num < 2) return;
    // update
    await this.waitForSource()
  }

  async waitForSource() {
    let num = this.currentTrack?.features[0].geometry.coordinates.length ?? 0;
    return new Promise((resolve, reject) => {
      const interval = setInterval(async () => {
        if (this.map.getSource('122')) {
          clearInterval(interval);
          await this.map.getSource('122').setData(this.currentTrack);
          if (this.currentMarker) await this.currentMarker.remove();
          this.currentMarker = await this.createMarker('Current', 'Current');
          if (!this.currentInitialMarker) await this.createMarker('Current', 'Initial');
          // set map view
          if (num == 5 || num == 10 || num == 25 || num % 50 == 0) await this.setMapView(this.currentTrack);
        }
      }, 100); // Check every 100ms, adjust as needed
    });
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
      this.previousTrack = undefined;
    }
  }

  // UPDATE CANVAS ///////////////////////////////////
  async updateCanvas(ctx: CanvasRenderingContext2D | undefined, track: any, propertyName: keyof Data, xParam: string) {
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvasNum, this.canvasNum);
    if (!track) return;
    var num = await track.features[0].geometry.properties.data.length ?? 0;
    if (xParam == 'x') var xTot = track.features[0].geometry.properties.data[num - 1].distance;
    else xTot = await track.features[0].geometry.properties.data[num - 1].time - track.features[0].geometry.properties.data[0].time;
    // compute bounds
    const bounds: Bounds = await this.fs.computeMinMaxProperty(track.features[0].geometry.properties.data, propertyName);
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
  }

  // GRID /////////////////////////////////////////////////////
  async grid(ctx: CanvasRenderingContext2D | undefined, xMin: number, xMax: number, yMin: number, yMax: number, a: number, d: number, e: number, f: number) {
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

  ///////////////////////////////////////////////////////////////
  ///////////////////////////////////////////////////////////////

  // START TRACKING /////////////////////////////////
  async startTracking() {
    // initialize
    this.currentTrack = undefined;
    await this.removeLayer('122')
    this.stopped = 0;
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
        //await this.currentHtml();
        await this.displayCurrentTrack();
      }
    }).then((value: any) => this.watcherId = value);
    // show / hide elements
    this.show('start', 'none');
    this.show('stop', 'block');
    this.show('trash', 'none');
    this.show('save', 'none');
  }

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
      if (previous > location.time) { await this.removePrevious(); }
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
    console.log(this.stopped)
    var tim = await this.currentTrack.features[0].geometry.properties.data[num - 1].time - this.currentTrack.features[0].geometry.properties.data[0].time
    tim = tim / 1000
    console.log(tim)
    this.currentAverageSpeed = 3600 * this.currentTrack.features[0].properties.totalDistance / tim
    console.log(this.currentAverageSpeed)
    if (tim - this.stopped > 5) this.currentAverageCorrSpeed = 3600 * this.currentTrack.features[0].properties.totalDistance / (tim - this.stopped)
    this.timeCorr = this.fs.formatMillisecondsToUTC(1000 * (tim - this.stopped));
    // ippdate canvas
    if (num % 20 == 0) await this.updateAllCanvas(this.currentCtx, this.currentTrack);
  }

  // FIRST POINT OF THE TRACK /////////////////////////////
  async firstPoint(location: Location) {
    this.currentTrack = {
      type: 'FeatureCollection',
      features: [{
        type: 'feature',
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
    await this.addCurrentLayer()
    this.currentInitialMarker = await this.createMarker('Current', 'Initial');
  }

  // REMOVE PREVIOUS POINT ///////////////////////
  async removePrevious() {
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
      track = this.archivedTrack?.features[0].geometry.coordinates;
    }
    else {
      track = this.currentTrack.features[0].geometry.coordinates
    }
    num = track.length ?? 0
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
    var char: any = { color: color, width: '25px', height: '25px' }
    // marker creation
    if (this.provider == 'Tomtom') marker = new tt.Marker(char).setLngLat(point).addTo(this.map);
    else marker = new mapboxgl.Marker(char).setLngLat(point).addTo(this.map);
    return marker;
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

  // REMOVE TRACK ///////////////////////////////////
  async removeTrack() {
    this.show('start', 'block');
    this.show('stop', 'none');
    this.show('save', 'none');
    this.show('trash', 'none');
    // new track: initialize all variables and plots
    await this.removeLayer('122');
    this.currentTrack = undefined;
    await this.updateAllCanvas(this.currentCtx, this.currentTrack);
  }

  // STOP TRACKING //////////////////////////////////
  async stopTracking() {
    // elements visibility
    this.show('start', 'none');
    this.show('stop', 'none');
    this.show('save', 'block');
    this.show('trash', 'block');
    // red marker
    let num = this.currentTrack.features[0].geometry.coordinates.length ?? 0;
    if (num > 0) this.currentFinalMarker = await this.createMarker('Current', 'Final')
    // remove watcher
    await BackgroundGeolocation.removeWatcher({ id: this.watcherId });
    // filter remaining values
    for (var i = this.filtered + 1; i < num; i++) {
      await this.altitudeFilter(i)
    };
    // set map view
    await this.setMapView(this.currentTrack);
    // update canvas
    await this.updateAllCanvas(this.currentCtx, this.currentTrack);
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

}