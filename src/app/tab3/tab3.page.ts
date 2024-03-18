import { Location, Block, Track, TrackDefinition } from '../../globald';
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
  totalNum = global.totalNum;
  collection: TrackDefinition[] = [];
  // local variables
  time: any = '00:00:00';
  ctxMap: CanvasRenderingContext2D | undefined;
  ctx: (CanvasRenderingContext2D | undefined)[] = [undefined, undefined, undefined]; 
  canvasNum: number = 400; // canvas size
  margin: number = 10;
  threshold: number = 20;
  lag = 12;
  output: any; 
  properties: (keyof Location)[] = ['altitude', 'speed'];
  gridsize: string = '-';

  constructor(
    private cd: ChangeDetectorRef,
    private decimalPipe: DecimalPipe,
    private datePipe: DatePipe,
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
    this.totalNum = this.track.locations.length;
    this.time = this.fs.formatMillisecondsToUTC(this.track.results.time);
    // create canvas
    await this.createAllCanvas();
    // update canvas
    await this.updateAllCanvas(true);
    // detect changes 
    this.cd.detectChanges();
  }


// 3.4. CREATE ALL CANVAS

async createAllCanvas() {
  var canvas = document.getElementById('canvasMap') as HTMLCanvasElement;
  this.ctxMap = await this.createCanvas(canvas)
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
    await this.updateMapCanvas(end);
    for (var i in this.properties) {
      if (this.properties[i] == 'altitude') await this.updateCanvas(this.ctx[i], this.properties[i], 'x');
      else await this.updateCanvas(this.ctx[i], this.properties[i], 't');
    }  
    this.cd.detectChanges();
  } 

  async updateMapCanvas(end: boolean) {
    // no track
    if (!this.track) return;
    // no map canvas
    if (!this.ctxMap) return;
    // fill in bluish
    this.ctxMap.setTransform(1, 0, 0, 1, 0, 0);
    this.ctxMap.fillRect(0, 0, this.canvasNum, this.canvasNum);
    // no points enough
    if (this.totalNum < 2) return;
    // scales
    var dx = this.track.results.xMax - this.track.results.xMin;
    var dy = this.track.results.yMax - this.track.results.yMin;
    // define parameters for transform
    var a: number;
    var d: number;
    var e: number;
    var f: number;
    // case dx > dy
     if (dx >= dy) {a = (this.canvasNum - 2 * this.margin) / dx; 
      d = -a;
      e = -this.track.results.xMin * a + this.margin;
      f = this.track.results.yMax * a + this.margin;
      f = f + a * (dx - dy) / 2;
    }
    // case dy > dx
    else {
      a = (this.canvasNum - 2 * this.margin) / dy;
      d = -a;
      e = -this.track.results.xMin * a + this.margin;
      f = this.track.results.yMax * a + this.margin;
      e = e + a * (dy - dx) / 2;  
    }
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
      this.ctxMap.fillStyle = 'rgb(0, 255, 255)';
    } 
  

  // 3.9. UPDATE CANVAS

  async updateCanvas (ctx: CanvasRenderingContext2D | undefined, propertyName: keyof Location, xParam: string) {
    if (!this.track) return;
    if (!ctx) return;
    if (xParam == 'x') var xTot = this.track.results.distance
    else xTot = this.track.results.time
    if (propertyName == 'simulated') return;
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
      ctx.moveTo(0, this.track.locations[block.min][propertyName]);
      for (var i = block.min + 1; i < block.max; i++) {
        if (xParam == 'x') ctx.lineTo(this.track.elements[i].distance, this.track.locations[i][propertyName])
        else ctx.lineTo(this.track.elements[i].time, this.track.locations[i][propertyName])
      }  
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.stroke();
      await this.grid(ctx, 0, xTot, bounds.min, bounds.max, a, d, e, f, xParam) 
    }
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

}
