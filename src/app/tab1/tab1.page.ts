     // 1. IMPORTS
 
import { Location, Bounds, Track, TrackDefinition, Data } from '../../globald';
import { FunctionsService } from '../functions.service';
import { Component, ChangeDetectorRef } from '@angular/core';
import { IonicModule, AlertController } from '@ionic/angular';
import { ExploreContainerComponent } from '../explore-container/explore-container.component';
import { global } from '../../environments/environment';
import { CommonModule, DecimalPipe, DatePipe } from '@angular/common';
import {registerPlugin} from "@capacitor/core";
const BackgroundGeolocation: any = registerPlugin("BackgroundGeolocation");
import { Storage } from '@ionic/storage-angular';
import tt from '@tomtom-international/web-sdk-maps';

// 2. @COMPONENT

@Component({
  selector: 'app-tab1',
  templateUrl: 'tab1.page.html',
  styleUrls: ['tab1.page.scss'],
  standalone: true,
  imports: [IonicModule, ExploreContainerComponent, CommonModule],
  providers: [DecimalPipe, DatePipe]
})

// 3. EXPORT PAGE 

export class Tab1Page   {
  
  // 3.1. VARIABLES  
  
  // global variables
  track: Track = global.track;
  tracking = global.tracking;
  watcherId = global.watcherId;

  // local variables
  vMax: number = 400; 
  ctx: CanvasRenderingContext2D[] = [];
  canvasNum: number = 400; // canvas size
  margin: number = 10;
  threshold: number = 20;
  properties: (keyof Data)[] = ['altitude', 'speed'];
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
  lag = 8;
  filtering: boolean = false;

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
    // plot map
    this.map = tt.map({
      key: "YHmhpHkBbjy4n85FVVEMHBh0bpDjyLPp", //TomTom, not Google Maps
      container: "map",
      center: [2, 41.5],
      zoom: 5,
    });
    this.map.addControl(new tt.NavigationControl()); 
    this.map.addControl(new tt.FullscreenControl());  
   }  


  // 3.3. IONVIEWDIDENTER
  
  async ionViewDidEnter() {
    // create canvas
    await this.createCanvas();
    // update canvas
    //await this.updateAllCanvas();
    // display track on map
    //await this.trackOnMap();
    // detect changes 
    this.cd.detectChanges();
  }

  // 3.4. CREATE ALL CANVAS

  async createCanvas() {
    var canvas: any
    for (var i in this.properties) {
      canvas = document.getElementById('ncanvas' + i) as HTMLCanvasElement;
      this.ctx[i] = await canvas.getContext("2d");
      this.ctx[i].fillStyle = 'yellow' 
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
    // new track: initialize all variables and plots
    this.initialize();
    await this.createCanvas();
    // start tracking
    this.tracking = true;
    await this.trackPosition();
    // remove track layers if exist
    if (this.initialMarker) this.initialMarker.remove();
    if (this.finalMarker) this.finalMarker.remove();
    if (this.currentMarker) this.currentMarker.remove();        
    for (var i = 124; i < 999; i++) this.removeLayer(i.toString());
  }

  // 3.12. INITIALIZE VARIABLES FOR A NEW TRACK

  initialize() {
    // in case of a new track, initialize variables
    this.track.data = []; 
    this.track.map = [];
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
        await this.trackOnMap()
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
    var slope = location.altitude - lastData.altitude;
    if (slope > 0) {
      var elevationGain = lastData.elevationGain + slope; 
      var elevationLoss = lastData.elevationLoss;   
    }
    else {
      var elevationLoss = lastData.elevationLoss - slope; 
      var elevationGain = lastData.elevationGain; 
    }
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
      elevationGain: elevationGain,
      elevationLoss: elevationLoss,
      accTime: time,
    })
    this.track.map.push(
      [location.longitude, location.latitude]
    )
    if (this.filtering && num > this.lag) await this.filter(num - this.lag -1)
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
    if (!this.filtering) return;
    for (var i = Math.max(num - this.lag, 0); i <= num - 1; i++) await this.filter(i);
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
  ctx.fillStyle = 'yellow'; 
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
  try {await this.removeLayer(layerString)}
  catch {}
  await this.addLayer(layerString)
  if (this.currentMarker) this.currentMarker.remove();        
  this.currentMarker = new tt.Marker({color:'#0000ff', width: '25px', height: '25px'}).
    setLngLat([this.track.map[l - 1][0], this.track.map[l - 1][1]]).addTo(this.map);
}


async addLayer(id: string) {
  var num = this.track.data.length;
  // build slice
  var idNum: number = +id - 124;
  var start = Math.max(0, idNum * 50 - 1);
  const slice = this.track.map.slice(start, num)
  // add layer
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
      'line-color': '#00aa00',
      'line-width': 4
    }
  }); 
  if (num == 2) this.initialMarker = new tt.Marker({color:'#00aa00', width: '25px', height: '25px'}).
    setLngLat([this.track.map[0][0], this.track.map[0][1]]).addTo(this.map);
  if (num % 50 === 0) {
    const p: number[] = this.track.map[num -1];
    this.map.setCenter({ lng: p[0], lat: p[1]});
  }
}


  async removeLayer(id: string) {
    var layers = this.map.getStyle().layers;
    for (var layer of layers) {
      if (layer.id === id) {
        await this.map.removeLayer(id)
        await this.map.removeSource(id)
        return
      }
    } 
  }  

  htmlVariables() {
    const num: number = this.track.data.length;
    if (num > 0) {
      this.currentTime = this.fs.formatMillisecondsToUTC(this.track.data[num - 1].accTime);
      this.currentDistance = this.track.data[num - 1].distance;
      this.currentElevationGain = this.track.data[num - 1].elevationGain;
      this.currentElevationLoss = this.track.data[num - 1].elevationLoss;
      this.currentNumber = num;
      this.currentAltitude = this.track.data[num - 1].altitude;
      this.currentSpeed = this.track.data[num - 1].speed;     
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
    if (num == 1) return;
    const start = Math.max(0, i-5);
    const end = Math.min(i+5, num - 1);
    var sum: number = 0
    for (var j= start; j<=end;j++) sum = sum + this.track.data[j].altitude;
    this.track.data[j].altitude = sum/(end - start +1);  
    var slope = this.track.data[j].altitude - this.track.data[j-1].altitude;
    if (slope > 0) {
      this.track.data[j].elevationGain = this.track.data[j-1].elevationGain + slope; 
      this.track.data[j].elevationLoss = this.track.data[j-1].elevationLoss
    }
    else {
      this.track.data[j].elevationGain = this.track.data[j-1].elevationGain; 
      this.track.data[j].elevationLoss = this.track.data[j-1].elevationLoss - slope
    }
    for (var k=j+1; k<num; k++) {
      this.track.data[k].elevationGain = this.track.data[k-1].elevationGain; 
      this.track.data[k].elevationLoss = this.track.data[k-1].elevationLoss;
    }

  } 

}
