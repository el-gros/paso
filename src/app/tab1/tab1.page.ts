     // 1. IMPORTS
 
import { Location, Bounds, Track, Corr, TrackDefinition, Data } from '../../globald';
import { FunctionsService } from '../functions.service';
import { Component, ChangeDetectorRef, ViewChild, ElementRef } from '@angular/core';
import { IonicModule, AlertController } from '@ionic/angular';
import { ExploreContainerComponent } from '../explore-container/explore-container.component';
import { global } from '../../environments/environment';
import { CommonModule, DecimalPipe, DatePipe } from '@angular/common';
import {registerPlugin} from "@capacitor/core";
const BackgroundGeolocation: any = registerPlugin("BackgroundGeolocation");
import { Storage } from '@ionic/storage-angular';
import tt from '@tomtom-international/web-sdk-maps';
import { FormsModule } from '@angular/forms';
import $ from "jquery";
import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { register } from 'swiper/element/bundle';
register();

// 2. @COMPONENT

@Component({
  selector: 'app-tab1',
  templateUrl: 'tab1.page.html',
  styleUrls: ['tab1.page.scss'],
  standalone: true,
  imports: [IonicModule, ExploreContainerComponent, CommonModule, FormsModule],
  providers: [DecimalPipe, DatePipe],
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
})

// 3. EXPORT PAGE 

export class Tab1Page   {

  // 3.1. VARIABLES  
  
  // global variables
  track: Track = global.track;
  tracking = global.tracking;
  watcherId = global.watcherId;
  corr: Corr[] = global.corr;

  // local variables
  vMax: number = 400; 
  ctx: CanvasRenderingContext2D[] = [];
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
  collection: TrackDefinition[] = [];
  map: any;
  initialMarker: any | undefined = undefined;
  finalMarker: any | undefined = undefined;
  currentMarker: any | undefined = undefined;
  lag: number = 8;
  filtered: number = -1;
  mapStyle: string = 'basic'; 
  display: string = 'map'; 

  // 3.2. CONSTRUCTOR  

  constructor(
    private cd: ChangeDetectorRef,
    public fs: FunctionsService,
    private alertController: AlertController,
    private storage: Storage,
  ) { }

  async ngOnInit() {
    // create storage 
    await this.storage.create();
    // create canvas
    await this.createCanvas();
    // plot map
    var bounds = [
      [30, -2], // Southwest corner of the bounding box
      [42, 3]  // Northeast corner of the bounding box
    ];
    this.map = tt.map({
      key: "YHmhpHkBbjy4n85FVVEMHBh0bpDjyLPp", //TomTom, not Google Maps
      container: "map",
      center: [2, 41.5],
      zoom: 6,
    });
    // add controls 
    this.map.on('load',() =>{
      this.map.resize();
      this.map.addControl(new tt.NavigationControl()); 
      this.map.addControl(new tt.FullscreenControl());  
      this.map.addControl(new tt.ScaleControl());
      this.map.addControl(new tt.GeolocateControl({
        positionOptions: {
          enableHighAccuracy: true,
        },
        trackUserLocation: true,
        showUserLocation: false,
      }));  
    });
    $('#card').hide();
    $('#plots').hide();
    $('#map').show();
    $('#radioMap').show();
  }  

 // 3.4. CREATE ALL CANVAS

  async createCanvas() {
    var canvas: any
    for (var i in this.properties) {
      canvas = document.getElementById('ncanvas' + i) as HTMLCanvasElement;
      this.ctx[i] = await canvas.getContext("2d");
      this.ctx[i].fillStyle = '#ffffdd' 
      this.ctx[i].fillRect(0, 0, this.canvasNum , this.canvasNum);
    }
  }  

  // 3.6. UPDATE ALL CANVAS

  async updateAllCanvas() {
    for (var i in this.properties) {
      if (this.properties[i] == 'altitude') await this.updateCanvas(this.ctx[i], this.properties[i], 'x');
      else await this.updateCanvas(this.ctx[i], this.properties[i], 't');
    }  
    this.cd.detectChanges();
  } 

  async updateCanvas (ctx: CanvasRenderingContext2D, propertyName: keyof Data, xParam: string) {
    var num = this.track.data.length;
    if (!ctx) return;
    if (propertyName == 'simulated') return;
    if (xParam == 'x') var xTot = this.track.data[num - 1].distance
    else xTot = this.track.data[num - 1].accTime
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillRect(0, 0, this.canvasNum, this.canvasNum);
    // compute bounds
    const bounds: Bounds = await this.fs.computeMinMaxProperty(this.track.data, propertyName);
    if (bounds.max == bounds.min) {
      bounds.max = bounds.max + 2;
      bounds.min = bounds.min - 2;
    }
    // compute scales
    const a = (this.canvasNum - 2 * this.margin) / xTot;
    const d = (this.canvasNum - 2 * this.margin) / (bounds.min - bounds.max);
    const e = this.margin;
    const f = this.margin - bounds.max * d;
    // define lines
    ctx.strokeStyle = 'black';
    ctx.setTransform(a, 0, 0, d, e, f)
    ctx.beginPath();
    ctx.moveTo(this.track.data[0].accTime, this.track.data[0][propertyName]);
    for (var i in this.track.data) {
      if (xParam == 'x') ctx.lineTo(this.track.data[i].distance, this.track.data[i][propertyName])
      else ctx.lineTo(this.track.data[i].accTime, this.track.data[i][propertyName])
    }       
    // stroke
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.stroke();
    // grid
    await this.grid(ctx, 0, xTot, bounds.min, bounds.max, a, d, e, f, xParam) 
  }

  // 3.11 START TRACKING
  
  async startTracking() {
    var element: HTMLElement | null = document.getElementById('map');
    if (element) console.log('c',element.style.height)
    else console.log('noelement')
    console.log('m', this.map.height)
    // new track: initialize all variables and plots
    this.initialize();
    await this.createCanvas();
    // remove markers and track layers if exist
    if (this.initialMarker) this.initialMarker.remove();
    if (this.finalMarker) this.finalMarker.remove();
    if (this.currentMarker) this.currentMarker.remove();        
    await this.removeCustomLayers();
    // start tracking
    this.tracking = true;
    await this.trackPosition();
  }

  // 3.12. INITIALIZE VARIABLES FOR A NEW TRACK

  initialize() {
    // in case of a new track, initialize variables
    this.track.data = []; 
    this.track.map = [];
    this.corr = [];
    this.watcherId = 0;
    this.htmlVariables();
  } 

  // 3.13. TRACK POSITION

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
        await this.updateAllCanvas();
        this.cd.detectChanges();
      }
    }).then((value: any) => this.watcherId = value);
  } 

  // 3.14. PROCESS LOCATION

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
    if (num > this.lag) await this.filter(num - this.lag -1);
    this.filtered = num - this.lag -1;
    // filter speed
    this.filterSpeed()
    // current values
    this.htmlVariables();
  }

  // 3.15. PROCESS LOCATION. FIRST POINT

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

  // 3.17. PROCESS LOCATION. REMOVE READING SUPOSEDLY WRONG

  async removePrevious() {
  // we suppose the previous location is in the same subtrail
    this.track.data.pop();
    this.track.map.pop();
    //this.corr.pop();
    this.htmlVariables();
  }

  // 3.20. STOP TRACKING

  async stopTracking() {
    // red marker
    const num: number = this.track.data.length
    if (num > 1) this.finalMarker = new tt.Marker({color: '#ff0000', width: '25px', height: '25px'}).
      setLngLat([this.track.map[num - 1][0], this.track.map[num - 1][1]]).addTo(this.map);
    // remove watcher
    try {await BackgroundGeolocation.removeWatcher({ id: this.watcherId }); }
    catch {}
    // control variables
    this.tracking = false;
    this.watcherId = 0;
    // filter remaining values
    for (var i = this.filtered + 1; i < num; i++) {
      await this.filter(i)
    };
    // update map and canvas
    await this.setMapView();
    await this.updateAllCanvas();
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
}

async grid(ctx: CanvasRenderingContext2D | undefined , xMin: number, xMax: number, yMin: number, yMax: number, a: number, d: number, e: number, f: number, xParam: string) {
  if (!ctx) return;
  ctx.font = "15px Arial"
  const gridx = this.fs.gridValue(xMax - xMin);
  const gridy = this.fs.gridValue(yMax - yMin);
  const fx = Math.ceil(xMin / gridx);
  const fy = Math.ceil(yMin / gridy);
  ctx.setLineDash([5, 15]);
  ctx.strokeStyle = 'green';
  ctx.fillStyle = 'green'  
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
  ctx.strokeStyle = 'black';
  ctx.fillStyle = '#ffffdd'; 
  ctx.setLineDash([]);
}




async trackOnMap() {
  const l = this.track.map.length
  // no map
  if (!this.map) return;
  // no points enough
  if (l < 2) return;
  // compute layer number
  var layer = 124 + Math.floor((l - 1) / 50)
  // update layer
  const layerString = layer.toString() 
  await this.removeLayer(layerString)
  await this.addLayer(layerString)
  if (this.currentMarker) this.currentMarker.remove();        
  this.currentMarker = new tt.Marker({color:'#0000ff', width: '25px', height: '25px'}).
    setLngLat([this.track.map[l - 1][0], this.track.map[l - 1][1]]).addTo(this.map);
}


async addLayer(id: string) {
  var num = this.track.data.length;
  var color: string;
  if (this.mapStyle == 'basic') color = '#00aa00'
  else color = '#ff0000'
  // build slice
  var idNum: number = +id - 124;
  var start = Math.max(0, idNum * 50 - 1);
  const slice = this.track.map.slice(start, num)
  // add layer
  await this.map.addLayer({
    'id': 'elGros' + id,
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
  // initial marker and map center
  if (num == 2) {
    this.initialMarker = new tt.Marker({color:'#00aa00', width: '25px', height: '25px'}).
      setLngLat([this.track.map[0][0], this.track.map[0][1]]).addTo(this.map);
    await this.setMapView();
  }
  // map center and zoom
  if (num === 10 || num === 50 || num % 100 === 0) await this.setMapView()
}

async addFullLayer() {
  var color: string;
  if (this.mapStyle == 'basic') color = '#00aa00'
  else color = '#ff0000'
  // add layer
  await this.map.addLayer({
    'id': 'elGros122',
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
              'coordinates': this.track.map
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



  async removeLayer(id: string) {
    id = 'elGros' + id
    var layers = this.map.getStyle().layers;
    for (var layer of layers) {
      if (layer.id === id) {
        await this.map.removeLayer(id)
        await this.map.removeSource(id)
        return
      }
    } 
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


  htmlVariables() {
    const num: number = this.track.data.length;
    var k: number = Math.max(num - this.lag - 1, 0);
    if (num > 0) {
      this.currentTime = this.fs.formatMillisecondsToUTC(this.track.data[num - 1].accTime);
      this.currentDistance = this.track.data[num - 1].distance;
      this.currentNumber = num;
      this.currentAltitude = this.track.data[num - 1].altitude;
      this.currentSpeed = this.track.data[num - 1].compSpeed;     
    }
    else {
      this.currentTime = "00:00:00";
      this.currentDistance = 0;
      this.currentElevationGain = 0;
      this.currentElevationLoss = 0;
      this.currentNumber = 0;
      this.currentAltitude = 0;
      this.currentSpeed = 0;
    }
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

  async setMapView() {
    // Calculate bounding box
    let minLat = Number.POSITIVE_INFINITY;
    let maxLat = Number.NEGATIVE_INFINITY;
    let minLng = Number.POSITIVE_INFINITY;
    let maxLng = Number.NEGATIVE_INFINITY;
    this.track.map.forEach(point => {
      minLat = Math.min(minLat, point[1]);
      maxLat = Math.max(maxLat, point[1]);
      minLng = Math.min(minLng, point[0]);
      maxLng = Math.max(maxLng, point[0]);
    });
    // map view
    await this.map.setCenter({lng: 0.5*(maxLng + minLng), lat: 0.5*(maxLat + minLat)});
    await this.map.fitBounds([[minLng, minLat], [maxLng, maxLat]], { padding: 50 });
  }

  async filterSpeed() {
    var num: number = this.track.data.length;
    var start: number = Math.max(num - this.lag - 1, 0);
    var distance: number = this.track.data[num-1].distance - this.track.data[start].distance;
    var time: number = this.track.data[num-1].time - this.track.data[start].time;
    this.track.data[num-1].compSpeed = 3600000 * distance / time;
  }

  async mapChange() {
    await this.removeCustomLayers();
    var style: any = {
      map: '2/basic_street-light',
      poi: '2/poi_light',
      trafficIncidents: '2/incidents_light',
      trafficFlow: '2/flow_relative-light',
    }
    var color = '#00aa00'
    if (this.mapStyle == 'satellite') {
      style.map = '2/basic_street-satellite'; 
      color = '#ff0000'
    }  
    await this.map.setStyle(style)
    await new Promise(f => setTimeout(f, 500));
    await this.addFullLayer()
  }

  async displayChange() {
    $('#card').hide();
    $('#plots').hide();
    $('#map').hide();    
    $('#radioMap').hide();    
    if (this.display == 'card') $('#card').show();
    else if (this.display == 'map') {
      $('#map').show(); 
      $('#radioMap').show(); 
    }        
    else if (this.display == 'plots') $('#plots').show();
  }


}


