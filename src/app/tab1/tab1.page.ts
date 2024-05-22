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
  track: Track = {
    data: [], 
    map: [],
    name: '',
    place: '',
    date: new Date(),
    description: '', 
  };
  vMax: number = 400; 
  ctx: CanvasRenderingContext2D[] = [];
  oldCtx: CanvasRenderingContext2D[] = [];
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
  oldDistance: number = 0;
  oldElevationGain: number = 0;
  oldElevationLoss: number = 0;
  oldTime: any = '00:00:00';
  oldNumber: number = 0;
  collection: TrackDefinition[] = [];
  map: any;
  initialMarker: any | undefined = undefined;
  finalMarker: any | undefined = undefined;
  oldInitialMarker: any | undefined = undefined;
  oldFinalMarker: any | undefined = undefined;
  currentMarker: any | undefined = undefined;
  lag: number = 8;
  filtered: number = -1;
  style: any;
  loaded: boolean = false;

  provider: string = 'Tomtom' // Tomtom or Mapbox;
  mapStyle: string = 'basic';
  previousTrack: Track | null = null;
  oldTrack: Track | null = null;

  constructor(
    private cd: ChangeDetectorRef,
    public fs: FunctionsService,
    private alertController: AlertController,
    private router: Router,
    private storage: Storage,
  ) { }          

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
    await this.storage.set('archived', true); 
    // change map style
    await this.changeMapStyle();
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

  async ionViewDidEnter() {
    // change map provider
    await this.changeMapProvider();
    // change map style
    await this.changeMapStyle();
    // archived track
    var visible: boolean = await this.archivedVisibility();
    if (!visible) return;
    // retrieve track
    await this.retrieveTrack();
    // check if there is track or it did not change
    if (!this.oldTrack) return;
    if (this.previousTrack == this.oldTrack) return;
    // write variables
    await this.htmlVariables();
    // update canvas
    await this.updateAllCanvas(this.oldCtx, this.oldTrack);
    // display track on map
    await this.displayOldTrack();
    this.previousTrack = this.oldTrack; 
    // adapt view
    await this.setMapView(this.oldTrack);
  }

  async changeMapStyle() {
    var preStyle = this.mapStyle;
    try{this.mapStyle = await this.storage.get('style'); }
    catch {}
    if (this.mapStyle == preStyle) return;
    await this.removeCustomLayers();
    await this.removeLayer('123');
    this.style = await this.fs.selectStyle(this.provider, this.mapStyle)
    await this.map.setStyle(this.style)
    await new Promise(f => setTimeout(f, 500));
    // display old track on map
    await this.displayOldTrack();
    // display current track
    await this.addFullLayer();
  }

  async archivedVisibility() {
    try{var archived = await this.storage.get('archived'); }
    catch{}
    if (archived) return true
    else {
      if (this.oldInitialMarker) this.oldInitialMarker.remove();
      if (this.oldFinalMarker) this.oldFinalMarker.remove();    
      await this.removeLayer('123');
      return false;
    }
  }

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
      await this.displayOldTrack();
      // display current track
      await this.addFullLayer();
    })
  }

  async createCanvas() {
    var canvas: any
    var oldCanvas: any;
    for (var i in this.properties) {
      canvas = document.getElementById('canvas' + i) as HTMLCanvasElement;
      oldCanvas = document.getElementById('oldcanvas' + i) as HTMLCanvasElement;
      this.ctx[i] = await canvas.getContext("2d");
      this.oldCtx[i] = await oldCanvas.getContext("2d");
    }
    canvas.width = window.innerWidth;
    canvas.height = canvas.width;
    this.canvasNum = canvas.width;
  }

  async createTomtomMap() {
    this.map = tt.map({
      key: "YHmhpHkBbjy4n85FVVEMHBh0bpDjyLPp", //TomTom, not Google Maps
      container: 'map',
      center: [1, 41.5],
      zoom: 6,
      style: this.style
    });
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
      this.loaded = true  
    });
  }

  async createMapboxMap() {
    this.map = new mapboxgl.Map({
      container: 'map',
      accessToken: "pk.eyJ1IjoiZWxncm9zIiwiYSI6ImNsdnUzNzh6MzAwbjgyanBqOGN6b3dydmQifQ.blr7ueZqkjw9LbIT5lhKiw",
      style: this.style,
      center: [1, 41.5],
      zoom: 6,
      trackResize: true,
    });
    this.map.on('load',() =>{
      this.map.resize();
      this.map.addControl(new mapboxgl.NavigationControl());
      this.map.scrollZoom.disable();
      this.loaded = true;
    });      
  }

  show (id: string, action: string) {
    var obj: HTMLElement | null = document.getElementById(id);
    if (!obj) return;
    obj.style.display = action
  }

  async retrieveTrack() {
    // get collection
    this.collection = await this.storage.get('collection'); 
    if (!this.collection) this.collection = [];
    console.log(this.collection)
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
    this.oldTrack = await this.storage.get(JSON.stringify(key));
    // uncheck all
    for (var item of this.collection) {
      item.isChecked = false;
    }
    await this.storage.set('collection', this.collection); 
  }

  async displayOldTrack() {
    // no points enough
    if (!this.oldTrack) return;
    if (this.oldTrack.map.length < 2) return;
    // remove old stuff and create new layer 123
    if (this.oldInitialMarker) this.oldInitialMarker.remove();
    if (this.oldFinalMarker) this.oldFinalMarker.remove();    
    await this.removeLayer('123');
    await this.oldTrackLayer('123');
  }

  async removeLayer(id: string) {
    id = 'elGros' + id
    // remove layer and source
    if (this.map.getLayer(id)) {
      await this.map.removeLayer(id)
      await this.map.removeSource(id)
    }
  }

  async oldTrackLayer(id: string) {
    if (!this.oldTrack) return;
    // color
    var color: string = 'green';
    // add layer
    await this.addLayer('elGros' + id, this.oldTrack.map, color)
    // add markers
    var num: number = this.oldTrack.data.length;
    this.oldInitialMarker = new tt.Marker({color: '#00aa00', width: '25px', height: '25px'}).
      setLngLat([this.oldTrack.map[0][0], this.oldTrack.map[0][1]]).addTo(this.map);
    this.oldFinalMarker = new tt.Marker({color: '#ff0000', width: '25px', height: '25px'}).
      setLngLat([this.oldTrack.map[num - 1][0], this.oldTrack.map[num - 1][1]]).addTo(this.map);
  }

  async setMapView(track: Track) {
    // Calculate bounding box
    let minLat = Number.POSITIVE_INFINITY;
    let maxLat = Number.NEGATIVE_INFINITY;
    let minLng = Number.POSITIVE_INFINITY;
    let maxLng = Number.NEGATIVE_INFINITY;
    track.map.forEach(point => {
      minLat = Math.min(minLat, point[1]);
      maxLat = Math.max(maxLat, point[1]);
      minLng = Math.min(minLng, point[0]);
      maxLng = Math.max(maxLng, point[0]);
    });
    // map view
    await this.map.resize();
    await this.map.setCenter({lng: 0.5*(maxLng + minLng), lat: 0.5*(maxLat + minLat)});
    await this.map.fitBounds([[minLng, minLat], [maxLng, maxLat]], { padding: 50 });
  }

  async htmlVariables() {
    var num: number = this.track.data.length;
    if (num > 0) {
      this.currentTime = this.fs.formatMillisecondsToUTC(this.track.data[num - 1].accTime);
      this.currentDistance = this.track.data[num - 1].distance;
      this.currentElevationGain = this.track.data[num - 1].elevationGain;
      this.currentElevationLoss = this.track.data[num - 1].elevationLoss;
      this.currentNumber = num;
      this.currentAltitude = this.track.data[num - 1].altitude;
      this.currentSpeed = this.track.data[num - 1].speed;
    }
    if (this.oldTrack) {
      num = this.oldTrack.data.length;
      if (num > 0) {
        this.oldTime = this.fs.formatMillisecondsToUTC(this.oldTrack.data[num - 1].accTime);
        this.oldDistance = this.oldTrack.data[num - 1].distance;
        this.oldElevationGain = this.oldTrack.data[num - 1].elevationGain;
        this.oldElevationLoss = this.oldTrack.data[num - 1].elevationLoss;
        this.oldNumber = num;
      }
    } 
  }

  async updateAllCanvas(context: any, track: Track) {
    if (!track) return
    for (var i in this.properties) {
      if (this.properties[i] == 'altitude') await this.updateCanvas(context[i], track, this.properties[i], 'x');
      else await this.updateCanvas(context[i], track, this.properties[i], 't');
    }  
  } 

  async addLayer(id: string, slice: any, color: string) {
    await this.map.addLayer({
      'id': id,
      'type': 'line',
      'source': {
        'type': 'geojson',
        'data': {
          'type': 'FeatureCollection',
          'features': [
            {
              'type': 'Feature',
              'geometry': {
                'type': 'LineString',
                'properties': {},
                'coordinates': slice
              }
            }
          ]
        }
      },
      'layout': {
        'line-cap': 'round',
        'line-join': 'round'
      },
      'paint': {
        'line-color': color,
        'line-width': 4
      }
    }); 
  }

  async updateCanvas (ctx: CanvasRenderingContext2D | undefined, track: Track, propertyName: keyof Data, xParam: string) {
    if (!track) return;
    if (!ctx) return;
    var num = track.data.length;
    if (propertyName == 'simulated') return;
    if (xParam == 'x') var xTot = track.data[num - 1].distance
    else xTot = track.data[num - 1].accTime
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvasNum, this.canvasNum);
    // compute bounds
    const bounds: Bounds = await this.fs.computeMinMaxProperty(track.data, propertyName);
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
    for (var i in track.data) {
      if (xParam == 'x') ctx.lineTo(track.data[i].distance, track.data[i][propertyName])
      else ctx.lineTo(track.data[i].accTime, track.data[i][propertyName])
    }     
    ctx.lineTo(xTot,bounds.min);
    ctx.closePath();
    ctx.fillStyle = 'yellow';
    ctx.fill();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // grid
    await this.grid(ctx, 0, xTot, bounds.min, bounds.max, a, d, e, f, xParam) 
  }

  async startTracking() {
    // new track: initialize all variables and plots
    this.initialize();
    // remove markers and track layers if exist
    if (this.initialMarker) this.initialMarker.remove();
    if (this.finalMarker) this.finalMarker.remove();
    if (this.currentMarker) this.currentMarker.remove();        
    await this.removeCustomLayers();
    // display old track
    if (this.oldTrack) await this.displayOldTrack();
    // start tracking
    await this.trackPosition();
    this.show('start', 'none');
    this.show('stop', 'block');
    this.show('trash', 'none');
    this.show('save', 'none');
  }

  async grid(ctx: CanvasRenderingContext2D | undefined , xMin: number, xMax: number, yMin: number, yMax: number, a: number, d: number, e: number, f: number, xParam: string) {
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

  initialize() {
    // in case of a new track, initialize variables
    this.track = {
      data: [], 
      map: [],
      name: '',
      place: '',
      date: new Date(),
      description: '', 
    };
    this.watcherId = 0;
    this.currentAltitude = 0;
    this.currentSpeed = 0;
    this.currentDistance = 0;
    this.currentElevationGain = 0;
    this.currentElevationLoss = 0;
    this.currentTime = '00:00:00';
    this.currentNumber = 0;
  } 

  async removeCustomLayers() {
    var layers = this.map.getStyle().layers;
    for (var layer of layers) {
      if (layer.id.slice(0, 6) === 'elGros') {
        await this.map.removeLayer(layer.id)
        await this.map.removeSource(layer.id)
      }
    } 
  }

  async trackPosition() {
    BackgroundGeolocation.addWatcher({
      backgroundMessage: "Cancel to prevent battery drain.",
      backgroundTitle: "Tracking You.",
      requestPermissions: true,
      stale: false,
      distanceFilter: 5
    }, async (location: Location, error: Error) => {
      if (location) {
        await this.process(location);
        await this.trackOnMap();
        await this.updateAllCanvas(this.ctx, this.track);
        this.cd.detectChanges();
      }
    }).then((value: any) => this.watcherId = value);
  }

  async process(location: Location) {
    var num: number = this.track.data.length; 
    // m/s to km/h
    location.speed = location.speed * 3.6
    // excessive uncertainty / no altitude measured
    if (location.accuracy > this.threshold) return;
    if (location.altitude == null) return;
    // check for the locations order...
    for (var i = num - 1; i>=1; i--) {
      // case tnew < tprevious, remove previous location
      const previous: Data = this.track.data[num - 1];
      if (previous.time > location.time) { await this.removePrevious(); }
      else break;
    }
    num = this.track.data.length; 
    // if the new location is the first one in the trail 
    if (num == 0) {
      await this.firstLocation(location);
      return;
    }
    const lastPoint: number[] = this.track.map[num - 1];
    const lastData: Data = this.track.data[num - 1];
    var distance: number = await this.fs.computeDistance(lastPoint[0], lastPoint[1], location.longitude, location.latitude)
    var time: number = location.time - lastData.time;
    const compSpeed = 3600000 * distance / time;
    if (compSpeed > this.vMax) return;
    distance = lastData.distance + distance;
    time = lastData.accTime + time;
    // add location  
    this.track.data.push({
      accuracy: location.accuracy,
      altitude: location.altitude,
      altitudeAccuracy: location.altitudeAccuracy,
      bearing: location.bearing,
      simulated: location.simulated,
      speed: location.speed,
      time: location.time,
      compSpeed: compSpeed,
      distance: distance,
      elevationGain: lastData.elevationGain,
      elevationLoss: lastData.elevationLoss,
      accTime: time,
    })
    this.track.map.push([location.longitude, location.latitude]);
    // filter
    num = this.track.data.length; 
    if (num > this.lag) {
      await this.filter(num - this.lag -1);
      this.filtered = num - this.lag -1;
    }  
    // filter speed
    this.filterSpeed()
    // current values
    this.htmlVariables();
  }

  async trackOnMap() {
    const num = this.track.map.length
    // no map
    if (!this.map) return;
    // no points enough
    if (num < 2) return;
    // compute layer number
    var layer = 124 + Math.floor((num - 1) / 50)
    // update layer
    const layerString = layer.toString() 
    await this.removeLayer(layerString)
    await this.newLayer(layerString)
    if (this.currentMarker) this.currentMarker.remove();        
    this.currentMarker = new tt.Marker({color:'#0000ff', width: '25px', height: '25px'}).
      setLngLat([this.track.map[num - 1][0], this.track.map[num - 1][1]]).addTo(this.map);
  }

  async removePrevious() {
    // we suppose the previous location is in the same subtrail
    this.track.data.pop();
    this.track.map.pop();
    this.htmlVariables();
  }

  async firstLocation(location: Location) {
    this.track.data.push({
      accuracy: location.accuracy,
      altitude: location.altitude,
      altitudeAccuracy: location.altitudeAccuracy,
      bearing: location.bearing,
      simulated: location.simulated,
      speed: location.speed,
      time: location.time,
      compSpeed: 0,
      distance: 0,
      elevationGain: 0,
      elevationLoss: 0,
      accTime: 0,
    })
    this.track.map.push(
      [location.longitude, location.latitude]
    )
    this.htmlVariables();
  }

  async filter(i: number) {
    var num: number = this.track.data.length;
    const start = Math.max(0, i-this.lag);
    const end = Math.min(i+this.lag, num - 1);
    // average altitude
    var sum: number = 0
    for (var j= start; j<=end;j++) sum = sum + this.track.data[j].altitude;
    this.track.data[i].altitude = sum/(end - start +1);
    // re-calculate elevation gains / losses
    if (i==0) return;
    var slope = this.track.data[i].altitude - this.track.data[i-1].altitude;
    if (slope > 0) {
      this.track.data[i].elevationGain = this.currentElevationGain + slope; 
      this.currentElevationGain = this.track.data[i].elevationGain;
      this.track.data[i].elevationLoss = this.currentElevationLoss
    }
    else {
      this.track.data[i].elevationGain = this.currentElevationGain; 
      this.track.data[i].elevationLoss = this.currentElevationLoss - slope
      this.currentElevationLoss = this.track.data[i].elevationLoss;
    }
  } 

  async filterSpeed() {
    var num: number = this.track.data.length;
    var start: number = Math.max(num - this.lag - 1, 0);
    var distance: number = this.track.data[num-1].distance - this.track.data[start].distance;
    var time: number = this.track.data[num-1].time - this.track.data[start].time;
    this.track.data[num-1].compSpeed = 3600000 * distance / time;
  }

  async newLayer(id: string) {
    //color
    var color: string = 'orange';
    // id
    var idNum: number = +id - 124;
    //slice
    var start = Math.max(0, idNum * 50 - 1);
    var num = this.track.data.length;
    const slice = this.track.map.slice(start, num)
    // add layer
    await this.addLayer('elGros' + id, slice, color)
    // initial marker and map center
    if (num == 2) {
      this.initialMarker = new tt.Marker({color:'#00aa00', width: '25px', height: '25px'}).
        setLngLat([this.track.map[0][0], this.track.map[0][1]]).addTo(this.map);
      await this.setMapView(this.track);
    }
    // map center and zoom
    if (num === 10 || num === 50 || num % 100 === 0) await this.setMapView(this.track)
  }

  async stopTracking() {
    this.show('start', 'none');
    this.show('stop', 'none');
    this.show('save', 'block');
    this.show('trash', 'block');
    // red marker
    const num: number = this.track.data.length
    if (num > 1) this.finalMarker = new tt.Marker({color: '#ff0000', width: '25px', height: '25px'}).
      setLngLat([this.track.map[num - 1][0], this.track.map[num - 1][1]]).addTo(this.map);
    // remove watcher
    try {await BackgroundGeolocation.removeWatcher({ id: this.watcherId }); }
    catch {}
    this.watcherId = 0;
    // filter remaining values
    for (var i = this.filtered + 1; i < num; i++) {
      await this.filter(i)
    };
    // update map and canvas
    await this.setMapView(this.track);
    await this.updateAllCanvas(this.ctx, this.track);
  }

  async removeTrack() {
    this.show('start', 'block');
    this.show('stop', 'none');
    this.show('save', 'none');
    this.show('trash', 'none');
    // new track: initialize all variables and plots
    this.initialize();
    // remove markers and track layers if exist
    if (this.initialMarker) this.initialMarker.remove();
    if (this.finalMarker) this.finalMarker.remove();
    if (this.currentMarker) this.currentMarker.remove();        
    await this.removeCustomLayers();
  }

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

  async saveFile(name: string, place: string, description: string) {
    // retrieve tracks definition
    this.collection = await this.storage.get('collection'); 
    if (!this.collection) this.collection = [];
    // build new track definition
    this.track.name = name;
    this.track.place = place;
    this.track.description = description;
    this.track.date = new Date();
    await this.storage.set(JSON.stringify(this.track.date), this.track);
    const trackDef = {name: this.track.name, date: this.track.date, place: this.track.place, description: this.track.description, isChecked: false};
    // add new track definition and save collection
    this.collection.push(trackDef);
    await this.storage.set('collection', this.collection)
    this.show('start', 'block');
    this.show('stop', 'none');
    this.show('save', 'none');
    this.show('trash', 'block');
  }

  async addFullLayer() {
    // define color
    var color: string = 'orange';
    // add layer
    await this.addLayer('elGros122', this.track.map, color)
  }

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

  /////////////////////////////////////////////////

/*





  
  async mapChangeCurrent() {
    var previous: any = this.style
    this.style = await this.fs.selectStyle(this.provider, this.mapStyle);
    if (previous == this.style) return;
    await this.removeCustomLayers();
    await this.map.setStyle(this.style)
    await new Promise(f => setTimeout(f, 500));
    await this.addFullLayer()
  }

  async displayChangeCurrent(option: string) {
    this.display = option
    this.show('onMap','none');
    this.show('satellite','none');
    this.show('data', 'none');
    this.show('map', 'none');
    if (this.display == 'map') {
      this.show('map', 'block');
      this.show('onMap', 'block');
      await this.mapChangeCurrent();
    }        
    else if (this.display == 'satellite') {
      this.show('map', 'block');
      this.show('satellite', 'block');
      await this.mapChangeCurrent();
    }
    else {
      this.show('data', 'block');
    }
  }
  //////////////////////////////////////////////  
  async selectTrack() {
    // create alert control
    const alert = await this.alertController.create({
      cssClass: 'alert greenAlert',
      // header and message
      header: 'Select a track',
      message: 'Kindly select the track to display',
      // buttons
      buttons: [{
        // proceed button
        text: 'OK',
        cssClass: 'alert-button',
        handler: () => { this.router.navigate(['./tabs/tab2']); }
      }]
    });
    alert.onDidDismiss().then((data) => { this.router.navigate(['./tabs/tab2']); });
    await alert.present();  
  }


  */

}


