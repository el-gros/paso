
// 1. IMPORTS
// 2. @COMPONENT
// 3. EXPORT PAGE 
  // 3.1. VARIABLES  
  // 3.2. CONSTRUCTOR  
  // 3.3. ionViewDidEnter() IONVIEWDIDENTER (3.4, 3.6)
  // 3.4. createAllCanvas() CREATE ALL CANVAS (3.5)
  // 3.5. createCanvas() CREATE CANVAS
  // 3.6. updateAllCanvas() UPDATE ALL CANVAS (3.7, 3.9)
  // 3.7. updateMapCanvas() UPDATE MAP CANVAS (3.8)
  // 3.8. circle() CIRCLE
  // 3.9. updateCanvas () UPDATE CANVAS (FS)
  // 3.11. startTracking() START TRACKING (3.5, 3.12, 3.13)
  // 3.12. initialize() INITIALIZE VARIABLES FOR A NEW TRACK
  // 3.13. trackPosition() TRACK POSITION (3.14 3.6)
  // 3.14. process() PROCESS LOCATION (3.15 3.16 3.17 3.18)
  // 3.15. firstLocation() PROCESS LOCATION. FIRST POINT
  // 3.16. firstInSubtrail() PROCESS LOCATION. CASE OF FIRST POINT IN A SUBTRACK (FS)
  // 3.17. removePrevious() PROCESS LOCATION. REMOVE READING SUPOSEDLY WRONG
  // 3.18. normalProcess() PROCESS LOCATION. NORMAL PROCESS (FS 3.19)
  // 3.19. smooth() SMOOTH ALTITUDE
  // 3.20. stopTracking() STOP TRACKING (3.21)
  // 3.21. processRemaining() PROCESS REMAINING ALTITUDES (FS 3.7 3.8 3.19)
  // 3.22. pauseTracking() PAUSE TRACKING (3.21)



// 1. IMPORTS
 
import { Location, Element, Result, Block, Point, Track, TrackDefinition } from '../../globald';
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
  track = global.track;
  stop = global.stop;
  tracking = global.tracking;
  watcherId = global.watcherId;
  num = global.num;
  totalNum = global.totalNum;

  // local variables
  vMax: number = 400; 
  time: any = '00:00:00';
  ctxMap: CanvasRenderingContext2D | undefined;
  ctx: (CanvasRenderingContext2D | undefined)[] = [undefined, undefined, undefined]; 
  canvasNum: number = 400; // canvas size
  margin: number = 10;
  threshold: number = 20;
  lag = 12;
  output: any; 
  output2: any; 
  properties: (keyof Location)[] = ['altitude', 'speed'];
  gridsize: string = '-';
  currentAltitude: number | undefined;
  currentSpeed: number | undefined;
  start: boolean = true;
  time0: Date = new Date(); 
  collection: TrackDefinition[] = [];
  map: any;

  // 3.2. CONSTRUCTOR  

  constructor(
    private cd: ChangeDetectorRef,
    private decimalPipe: DecimalPipe,
    private datePipe: DatePipe,
    public fs: FunctionsService,
    private alertController: AlertController,
    private storage: Storage
  ) { }

  // 3.3. IONVIEWDIDENTER
  
  async ionViewDidEnter() {
    // retrieve tracks definition
    this.collection = await this.storage.get('collection'); 
    if (!this.collection) this.collection = [];
    // uncheck all items
    for (var item of this.collection) item.isChecked = false;
    await this.storage.set('collection', this.collection);
    // create canvas
    await this.createAllCanvas();
    // update canvas
    await this.updateAllCanvas(false);
    await this.trackOnMap(false);
    // detect changes 
    this.cd.detectChanges();
  }

  // 3.4. CREATE ALL CANVAS

  async createAllCanvas() {
    var canvas = document.getElementById('ncanvasMap') as HTMLCanvasElement;
    this.ctxMap = await this.createCanvas(canvas)
    for (var i in this.properties) {
      canvas = document.getElementById('ncanvas' + i) as HTMLCanvasElement;
      this.ctx[i] = await this.createCanvas(canvas)
    }
  }  

  // 3.5. CREATE CANVAS

  async createCanvas(canvas: any) {
    var ctx = await canvas.getContext("2d");
    ctx.fillStyle = "yellow";
    ctx.fillRect(0, 0, this.canvasNum , this.canvasNum);
    return ctx;
  } 

  // 3.6. UPDATE ALL CANVAS

  async updateAllCanvas(end: boolean) {
    await this.updateMapCanvas(end);
    for (var i in this.properties) {
      if (this.properties[i] == 'altitude') await this.updateCanvas(this.ctx[i], this.properties[i], 'x');
      else await this.updateCanvas(this.ctx[i], this.properties[i], 't');
    }  
    this.cd.detectChanges();
  } 

  // 3.7. UPDATE MAP CANVAS
  
  async updateMapCanvas(end: boolean) {
    // no map canvas
    if (!this.ctxMap) return;
    // fill in yellow
    this.ctxMap.setTransform(1, 0, 0, 1, 0, 0);
    this.ctxMap.fillRect(0, 0, this.canvasNum, this.canvasNum);
    // no points enough
    if (this.totalNum < 2) return;
    // scales
    var dx = this.track.results.xMax - this.track.results.xMin;
    var dy = this.track.results.yMax - this.track.results.yMin;
    // define parameters for transform
    var a: number = (this.canvasNum - 2 * this.margin) / Math.max(dx, dy); 
    var d = -a;
    var e = -this.track.results.xMin * a + this.margin;
    var f = this.track.results.yMax * a + this.margin;
    f = f + a * Math.abs(dx - dy) / 2;
    // green circle
    await this.circle(0, 0, a, d, e, f, 'green');
    // draw lines
    for (var block of this.track.blocks) {
      this.ctxMap.setTransform(a, 0, 0, d, e, f);
      this.ctxMap.beginPath();
      this.ctxMap.moveTo(this.track.elements[block.min].x, this.track.elements[block.min].y);
      for (var i = block.min + 1; i < block.max; i++) {
        this.ctxMap.lineTo(this.track.elements[i].x, this.track.elements[i].y)
      } 
      this.ctxMap.setTransform(1, 0, 0, 1, 0, 0);
      this.ctxMap.strokeStyle = 'black';
      this.ctxMap.stroke();
    }
    await this.gridMap(this.track.results.xMin, this.track.results.xMax, this.track.results.yMin, this.track.results.yMax, a, d, e, f) 
    if (end) await this.circle(this.track.results.x, this.track.results.y, a, d, e, f, 'red');
  }

  // 3.8. CIRCLE

  async circle(x1: number, y1: number, a: number, d: number, e: number, f: number, color: string) {
    if (!this.ctxMap) return;
    this.ctxMap.beginPath();
    this.ctxMap.arc(x1*a+e, y1*d+f, 10, 0, 2 * Math.PI); 
    this.ctxMap.fillStyle = color;
    this.ctxMap.fill(); 
    this.ctxMap.strokeStyle = color;
    this.ctxMap.stroke();
    this.ctxMap.fillStyle = 'yellow';
  } 

  // 3.9. UPDATE CANVAS

  async updateCanvas (ctx: CanvasRenderingContext2D | undefined, propertyName: keyof Location, xParam: string) {
    if (!ctx) return;
    if (propertyName == 'simulated') return;
    if (xParam == 'x') var xTot = this.track.results.distance
    else xTot = this.track.results.time
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillRect(0, 0, this.canvasNum, this.canvasNum);
    // compute bounds
    const bounds: Block = await this.fs.computeMinMaxProperty(this.track.locations, propertyName);
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
    ctx.strokeStyle = 'black';
    for (var block of this.track.blocks) {
      ctx.setTransform(a, 0, 0, d, e, f)
      ctx.beginPath();
      ctx.moveTo(this.track.elements[block.min].time, this.track.locations[block.min][propertyName]);
      for (var i = block.min + 1; i < block.max; i++) {
        if (xParam == 'x') ctx.lineTo(this.track.elements[i].distance, this.track.locations[i][propertyName])
        else ctx.lineTo(this.track.elements[i].time, this.track.locations[i][propertyName])
      }       
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.stroke();
      await this.grid(ctx, 0, xTot, bounds.min, bounds.max, a, d, e, f, xParam) 
    }
  }

  // 3.11 START TRACKING
  
  async startTracking() {
    // set initial time
    this.time0 = new Date();
    if (this.stop) {
      // case of a new track: initialize all variables and plots
      this.initialize();
      await this.createAllCanvas();
    }
    // always:
    this.num = 0;
    this.stop = false;
    this.tracking = true;
    // start tracking
    await this.trackPosition();
  }

  // 3.12. INITIALIZE VARIABLES FOR A NEW TRACK

  initialize() {
    // in case of a new track, initialize variables
    this.track.locations = []; 
    this.track.elements = [];
    this.track.results = {
      distance: 0,
      elevationGain: 0,
      elevationLoss: 0,
      time: 0,
      x: 0,
      y: 0,
      xMin: 0,
      xMax: 0,
      yMin: 0,
      yMax: 0,
    };
    this.track.blocks = []; 
    this.totalNum = 0;  
    this.stop = true;
    this.watcherId = 0;
    this.time = '00:00:00';
  } 

  // 3.13. TRACK POSITION

  async trackPosition() {
    this.start = false;
    BackgroundGeolocation.addWatcher({
      backgroundMessage: "Cancel to prevent battery drain.",
      backgroundTitle: "Tracking You.",
      requestPermissions: true,
      stale: false,
      distanceFilter: 5
    }, async (location: Location, error: Error) => {
      if (location) {
        await this.process(location);
        await this.trackOnMap(false)
        await this.updateAllCanvas(false);
        this.cd.detectChanges();
      }
      if (error) {this.output = 'error'}
    }).then((value: any) => this.watcherId = value);
  } 

  // 3.14. PROCESS LOCATION

  async process(location: Location) {
    // m/s to km/h
    location.speed = location.speed * 3.6
    // excessive uncertainty / no altitude measured
    if (location.accuracy > this.threshold) return;
    if (location.altitude == null) return;
    // current values
    this.currentAltitude = location.altitude;
    this.currentSpeed = location.speed;
    // normal case
    await this.normalProcess(location)
  }

  // 3.15. PROCESS LOCATION. FIRST POINT

  async firstLocation(location: Location) {
    location.instantSpeed = 0;
    this.track.locations.push(location);
    this.totalNum = 1;
    this.num = 1;
    this.track.blocks.push({min: 0, max: 1});
    this.track.elements.push({
      distance: 0,
      elevationGain: 0,
      elevationLoss: 0,
      time: 0,
      x: 0,
      y: 0,
    })
  }

  // 3.16. PROCESS LOCATION. CASE OF FIRST POINT IN A SUBTRACK
  
  async firstInSubtrail(location: Location) {
    location.instantSpeed = 0;
    this.track.locations.push(location);
    this.totalNum = this.track.locations.length;
    this.num = 1;
    this.track.blocks.push({min: this.totalNum - 1, max: this.totalNum})
    var distances: Point = await this.fs.computeDistances(this.track.locations[0].latitude, this.track.locations[0].longitude, location.latitude, location.longitude)
    this.track.results.x = distances.x;
    this.track.results.y = distances.y;
    this.track.results.xMin = Math.min(this.track.results.xMin, distances.x);
    this.track.results.xMax = Math.max(this.track.results.xMax, distances.x);
    this.track.results.yMin = Math.min(this.track.results.yMin, distances.y);
    this.track.results.yMax = Math.max(this.track.results.yMax, distances.y);
    this.track.elements.push({
      distance: this.track.results.distance,
      elevationGain: this.track.results.elevationGain,
      elevationLoss: this.track.results.elevationLoss,
      time: this.track.results.time,
      x: this.track.results.x,
      y: this.track.results.y,
    })
  }

  // 3.17. PROCESS LOCATION. REMOVE READING SUPOSEDLY WRONG

  async removePrevious() {
  // we suppose the previous location is in the same subtrail
    this.track.locations.pop();
    this.track.elements.pop();
    const lastEl: Element = this.track.elements[this.track.elements.length - 1]
    this.track.results.distance = lastEl.distance;
    this.track.results.elevationGain = lastEl.elevationGain;
    this.track.results.elevationLoss = lastEl.elevationLoss;
    this.track.results.time = lastEl.time;
    this.time = this.fs.formatMillisecondsToUTC(this.track.results.time);
    this.track.results.x = lastEl.x;
    this.track.results.y = lastEl.y;
    this.num = this.num -1;
    this.totalNum = this.totalNum -1;
    this.track.blocks[this.track.blocks.length - 1].max = this.totalNum;
  }

  // 3.18. PROCESS LOCATION. NORMAL PROCESS
  
  async normalProcess(location: Location) {
    var iord = this.num
    // if the new location is not the first one in the subtrail 
    // check for the locations order...
    for (var i = iord; i>=1; i--) {
      // case tnew < tprevious, remove previous location
      const previous: Location = this.track.locations[this.track.locations.length - 1];
      if (previous.time > location.time) { await this.removePrevious(); }
      else break;
    }
    // if the new location is the first one in the subtrail 
    if (this.num == 0) {
      // this location is the first one of the trail
      if (this.totalNum == 0) { await this.firstLocation(location); }
      // this location is the first one of the subtrail
      else { await this.firstInSubtrail(location); }
      return;
    }
    const last: Location = this.track.locations[this.track.locations.length - 1];
    const distances: Point = await this.fs.computeDistances(last.latitude, last.longitude, location.latitude, location.longitude)
    const d = Math.sqrt(distances.x * distances.x + distances.y * distances.y) 
    location.instantSpeed = 3600000 * d / (location.time - last.time);
    if (location.instantSpeed > this.vMax) return;
    this.track.results.x = this.track.results.x + distances.x;
    this.track.results.y = this.track.results.y + distances.y;
    this.track.results.xMax = Math.max(this.track.results.xMax, this.track.results.x);
    this.track.results.xMin = Math.min(this.track.results.xMin, this.track.results.x);
    this.track.results.yMax = Math.max(this.track.results.yMax, this.track.results.y);
    this.track.results.yMin = Math.min(this.track.results.yMin, this.track.results.y);
    this.track.results.distance = this.track.results.distance + d
    this.track.results.time = this.track.results.time + location.time - last.time; 
    if (this.num == 1) this.track.locations[this.track.locations.length - 1].instantSpeed = location.instantSpeed;
    this.time = this.fs.formatMillisecondsToUTC(this.track.results.time);
    this.track.locations.push(location);
    this.totalNum = this.track.locations.length;
    this.num = this.num + 1;
    this.track.blocks[this.track.blocks.length - 1].max = this.totalNum;
    const iCor = this.totalNum - this.lag - 1;
    if (this.num > this.lag) await this.smooth(iCor)
    if (this.num > this.lag + 1) {
      var slopes = await this.fs.computeSlopes(this.track.locations[iCor - 1].altitude, this.track.locations[iCor].altitude);
      this.track.results.elevationGain = this.track.results.elevationGain + slopes.gain; 
      this.track.results.elevationLoss = this.track.results.elevationLoss + slopes.loss; 
    }
    this.track.elements.push({
      distance: this.track.results.distance,
      elevationGain: this.track.results.elevationGain,
      elevationLoss: this.track.results.elevationLoss,
      time: this.track.results.time,
      x: this.track.results.x,
      y: this.track.results.y,
    })
  }

  // 3.19. SMOOTH ALTITUDE

  async smooth(i: number) {
    // portion of track used in the smoothing process
    var start = Math.max(i-this.lag, this.track.blocks[this.track.blocks.length - 1].min);
    var end = Math.min(i + this.lag, this.totalNum - 1)
    if (start == end) return;
    const portion: Location[] = this.track.locations.slice(start, end + 1);
    // compute minimum value of altitude accuracy 
    const minValue: number = portion.reduce((min, obj) => {
      return obj.altitudeAccuracy < min ? obj.altitudeAccuracy : min;
    }, portion[0].altitudeAccuracy); 
    // keep only those elements with altitude accuracy over a threshold
    var precisePortion = portion.filter((element) => element.altitudeAccuracy < 2 * minValue);
    // average those values
    const sum: number = precisePortion.reduce((acc, curr) => acc + curr.altitude, 0);
    // replace altitude with the above-computed average
    this.track.locations[i].altitude = sum / precisePortion.length; 
  }

  // 3.20. STOP TRACKING

  async stopTracking() {
    // remove watcher
    try {await BackgroundGeolocation.removeWatcher({ id: this.watcherId }); }
    catch {}
    // control variables
    this.stop = true;
    this.tracking = false;
    this.watcherId = 0;
    // process altitude of latest locations
    await this.processRemaining()
  }

  // 3.21. PROCESS REMAINING ALTITUDES

  async processRemaining() {
    // smooth altitude of the latest locations
    for (var i = this.totalNum - this.lag; i < this.totalNum; i++) {
      if (i >= this.track.blocks[this.track.blocks.length - 1].min) await this.smooth(i);
      if (i > this.track.blocks[this.track.blocks.length - 1].min) {
        var slopes = await this.fs.computeSlopes(this.track.locations[i - 1].altitude, this.track.locations[i].altitude);
        this.track.results.elevationGain = this.track.results.elevationGain + slopes.gain; 
        this.track.results.elevationLoss = this.track.results.elevationLoss + slopes.loss; 
        this.track.elements[this.totalNum - 1].elevationGain = this.track.results.elevationGain;
        this.track.elements[this.totalNum - 1].elevationLoss = this.track.results.elevationLoss;
      }
    } 
    // update canvas    
    await this.updateAllCanvas(true);
    this.trackOnMap(true);
  }

  // 3.22. PAUSE TRACKING

  async pauseTracking() {
    this.tracking = false;
    await BackgroundGeolocation.removeWatcher({ id: this.watcherId });
    this.watcherId = 0;
    // process altitude of latest locations
    await this.processRemaining();
  }


  async setTrackDetails() {
    var trackName: string = '';
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
  this.track.name = name;
  this.track.place = place;
  this.track.description = description;
  this.track.date = new Date();
  this.start = true;
  await this.storage.set(JSON.stringify(this.track.date), this.track);
  const trackDef = {name: this.track.name, date: this.track.date, place: this.track.place, description: this.track.description, isChecked: false};
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

async gridMap(xMin: number, xMax: number, yMin: number, yMax: number, a: number, d: number, e: number, f: number) {
  if (!this.ctxMap) return;
  const dx = xMax - xMin;
  const dy = yMax - yMin;
  const dxy = Math.max(dx, dy); 
  const grid = this.fs.gridValue(dxy);
  if (dx >= dy) {
    yMin = yMin - (dx-dy)/2;
    yMax = yMax + (dx-dy)/2;
  }
  else {
    xMin = xMin - (dy-dx)/2;
    xMax = xMax + (dy-dx)/2;
  }
  const fx = Math.ceil(xMin / grid);
  const fy = Math.ceil(yMin / grid);
  this.ctxMap.setLineDash([5, 15]);
  this.ctxMap.strokeStyle = 'green';  
  this.gridsize = grid.toLocaleString();
  for (var xi = fx * grid; xi <= xMax; xi = xi + grid) {
    this.ctxMap.beginPath();
    this.ctxMap.moveTo(xi*a+e, yMin*d+f);
    this.ctxMap.lineTo(xi*a+e, yMax*d+f);
    this.ctxMap.stroke();
  }
  for (var yi = fy * grid; yi <= yMax; yi = yi + grid) {
    this.ctxMap.beginPath();
    this.ctxMap.moveTo(xMin*a+e, yi*d+f);
    this.ctxMap.lineTo(xMax*a+e, yi*d+f);
    this.ctxMap.stroke();
  }
  this.ctxMap.strokeStyle = 'black';
  this.ctxMap.setLineDash([]);
}

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
}  

async plotLocationOnMap(location: Location) {
//  let marker = new tt.Marker().setLngLat([location.longitude, location.latitude]).addTo(this.map);
  this.map.setCenter({ lng: location.longitude, lat: location.latitude });
  this.map.setZoom(15);
}

async trackOnMap(end: boolean) {
  // no map
  if (!this.map) return;
  // no points enough
  if (this.totalNum < 2) return;
  // update layer 123
  var id: string = '123'
  await this.removeLayer(id)
  await this.addLayer(id)
}


async addLayer(id: string) {
  // Create coordinates list
  var coordinates: number[][]
  coordinates = await this.coordinatesSet();
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
              'coordinates': coordinates
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
      'line-color': '#ff0000',
      'line-width': 4
    }

  }); 
}


  async removeLayer(id: string) {
    var layers = this.map.getStyle().layers;
    for (var layer of layers) {
      if (layer.id === id) {
        await this.map.removeLayer('123')
        await this.map.removeSource('123')
        return
      }
    } 
  }  

  async coordinatesSet() {
    var coordinates: number[][] = []
    for (var p of this.track.locations ) {
      await coordinates.push([p.longitude, p.latitude])
    }  
    return coordinates;
  } 

}
