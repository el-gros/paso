import { Location, Bounds, Track, TrackDefinition, Data } from '../../globald';
import { FunctionsService } from '../functions.service';
import { Component, ChangeDetectorRef } from '@angular/core';
import { IonicModule, AlertController } from '@ionic/angular';
import { ExploreContainerComponent } from '../explore-container/explore-container.component';
import { global } from '../../environments/environment';
import { CommonModule, DecimalPipe, DatePipe } from '@angular/common';
import {registerPlugin} from "@capacitor/core";
const BackgroundGeolocation: any = registerPlugin("BackgroundGeolocation");
import { Router } from '@angular/router';
import { Storage } from '@ionic/storage-angular';
import tt from '@tomtom-international/web-sdk-maps';

@Component({
  selector: 'app-tab3',
  templateUrl: 'tab3.page.html',
  styleUrls: ['tab3.page.scss'],
  standalone: true,
  imports: [IonicModule, ExploreContainerComponent, CommonModule],
  providers: [DecimalPipe, DatePipe]
})
export class Tab3Page {
  track = global.track;
  collection: TrackDefinition[] = [];
  // local variables
  ctxMap: CanvasRenderingContext2D | undefined;
  ctx: (CanvasRenderingContext2D | undefined)[] = [undefined, undefined, undefined]; 
  canvasNum: number = 400; // canvas size
  margin: number = 10;
  threshold: number = 20;
  lag = 12;
  output: any; 
  properties: (keyof Data)[] = ['altitude', 'speed'];
  gridsize: string = '-';
  currentAltitude: number | undefined;
  currentSpeed: number | undefined;
  currentDistance: number = 0;
  currentElevationGain: number = 0;
  currentElevationLoss: number = 0;
  currentTime: any = '00:00:00';
  currentNumber: number = 0;
  map: any;
  initialMarker: any = undefined;
  finalMarker: any = undefined;


  constructor(
    private cd: ChangeDetectorRef,
    public fs: FunctionsService,
    private alertController: AlertController,
    private router: Router,
    private storage: Storage
  ) {}


  async ionViewDidEnter() {
    // retrieve tracks definition
    this.collection = await this.storage.get('collection'); 
    if (!this.collection) this.collection = [];
    var numChecked = 0;
    for (var item of this.collection) {
      if (item.isChecked) numChecked = numChecked + 1;
      if (numChecked > 1) break;
    }
    if (numChecked > 1)  {
      for (var item of this.collection) { item.isChecked = false; }      
    } 
    var index: number = -1;
    for (var i = 0; i < this.collection.length; i++) {
      if (this.collection[i].isChecked) {index = i; break;}
    }    
    if (index == -1) await this.selectTrack();
    const key = this.collection[index].date;
    // retrieve track
    this.track = await this.storage.get(JSON.stringify(key));
    // global variables
    this.htmlVariables();
    // create canvas
    await this.createAllCanvas();
    try {
      this.removeLayer('123');
      if (this.initialMarker) this.initialMarker.remove();
      if (this.finalMarker) this.finalMarker.remove();    
    }
    catch {}
    // display track on map
    await this.displayTrackOnMap();
    // update canvas
    await this.updateAllCanvas(true);
    // detect changes 
    this.cd.detectChanges();
  }


// 3.4. CREATE ALL CANVAS

async createAllCanvas() {
  var canvas: any
  for (var i in this.properties) {
    canvas = document.getElementById('canvas' + i) as HTMLCanvasElement;
    this.ctx[i] = await this.createCanvas(canvas)
  }
}  

// 3.5. CREATE CANVAS

async createCanvas(canvas: any) {
  var ctx = await canvas.getContext("2d");
  ctx.fillStyle = "rgb(0, 255, 255)";
  ctx.fillRect(0, 0, this.canvasNum , this.canvasNum);
  return ctx;
} 

  // 3.6. UPDATE ALL CANVAS

  async updateAllCanvas(end: boolean) {
  //  await this.updateMapCanvas(end);
    for (var i in this.properties) {
      if (this.properties[i] == 'altitude') await this.updateCanvas(this.ctx[i], this.properties[i], 'x');
      else await this.updateCanvas(this.ctx[i], this.properties[i], 't');
    }  
    this.cd.detectChanges();
  } 

  // 3.9. UPDATE CANVAS

  async updateCanvas (ctx: CanvasRenderingContext2D | undefined, propertyName: keyof Data, xParam: string) {
    var num = this.track.data.length;
    if (!this.track) return;
    if (!ctx) return;
    if (xParam == 'x') var xTot = this.track.data[num - 1].distance
    else xTot = this.track.data[num - 1].accTime
    if (propertyName == 'simulated') return;
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
    // draw lines
    ctx.strokeStyle = 'black';
    ctx.setTransform(a, 0, 0, d, e, f)
    ctx.beginPath();
    ctx.moveTo(0, this.track.data[0][propertyName]);
    for (var i in this.track.data) {
      if (xParam == 'x') ctx.lineTo(this.track.data[i].distance, this.track.data[i][propertyName])
      else ctx.lineTo(this.track.data[i].accTime, this.track.data[i][propertyName])
    }  
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.stroke();
    await this.grid(ctx, 0, xTot, bounds.min, bounds.max, a, d, e, f, xParam) 
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
  
  
  async selectTrack() {
    // create alert control
    const alert = await this.alertController.create({
      cssClass: 'alert blueAlert',
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

  async ngOnInit() {
    // plot map
    this.map = tt.map({
      key: "YHmhpHkBbjy4n85FVVEMHBh0bpDjyLPp", //TomTom, not Google Maps
      container: "map2",
      center: [2, 41.5],
      zoom: 5,
    });
    this.map.addControl(new tt.NavigationControl({
      showZoom: true, // Show zoom buttons
      showCompass: true, // Hide compass
    }));
  }  

  async displayTrackOnMap() {
    // no map
    if (!this.map) return;
    // no points enough
    if (this.track.data.length < 2) return;
    // create layer 123
    await this.removeLayer('123')
    await this.addLayer('123')
    }

  async addLayer(id: string) {
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
        'line-color': '#00aa00',
        'line-width': 4
      }
    }); 
    var num: number = this.track.data.length;
    this.initialMarker = new tt.Marker({color: '#00aa00', width: '25px', height: '25px'}).
      setLngLat([this.track.map[0][0], this.track.map[0][1]]).addTo(this.map);
    this.finalMarker = new tt.Marker({color: '#ff0000', width: '25px', height: '25px'}).
      setLngLat([this.track.map[num - 1][0], this.track.map[num - 1][1]]).addTo(this.map);
    this.map.setCenter({ lng: this.track.map[num - 1][0], lat: this.track.map[num - 1][1] });
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


}
