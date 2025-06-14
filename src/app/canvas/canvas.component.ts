import { Subscription } from 'rxjs';
/**
 * CanvasComponent is responsible for displaying and managing interactive canvas charts
 * for both the current and archived tracks, including statistics such as distance,
 * elevation gain/loss, speed, and time. It initializes canvases, subscribes to track
 * and status updates, computes average and motion speeds, and renders graphical
 * representations of track data with dynamic scaling and grid overlays. The component
 * supports multilingual labels and adapts canvas size to the viewport.
 */

import { CUSTOM_ELEMENTS_SCHEMA, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { IonFab, IonContent, IonRow, IonFabButton, IonIcon } from "@ionic/angular/standalone";
import { global } from '../../environments/environment';
import { Location, Bounds, Track, TrackDefinition, Data, Waypoint } from '../../globald';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FunctionsService } from '../services/functions.service';
import { TrackService } from '../services/track.service';
import { register } from 'swiper/element/bundle';
register();

@Component({
  selector: 'app-canvas',
  templateUrl: './canvas.component.html',
  styleUrls: ['./canvas.component.scss'],
  standalone: true,
  imports: [CommonModule, IonFab, IonContent, IonRow, IonFabButton, IonIcon],
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class CanvasComponent implements OnInit, OnDestroy {

  currentTrack: Track | undefined = undefined;
  archivedTrack: Track | undefined = undefined;

  arcTitle = ['TRAJECTE DE REFERÈNCIA','TRAYECTO DE REFERENCIA','REFERENCE TRACK'];
  curTitle = ['TRAJECTE ACTUAL','TRAYECTO ACTUAL','CURRENT TRACK'];
  distance = ['Distància','Distancia','Distance'];
  eGain = ['Desnivell positiu','Desnivel positivo','Elevation gain'];
  eLoss = ['Desnivell negatiu','Desnivel negativo','Elevation loss'];
  time = ['Temps', 'Tiempo','Time'];
  motionTime = ['Temps en moviment','Tiempo en movimiento','In-motion time'];
  points = ['Punts gravats','Puntos grabados','Recorded points'];
  altitude = ['Altitud actual','Altitud actual','Current altitude'];
  speed = ['Velocitat actual','Velocidad actual','Current speed'];
  avgSpeed = ['Velocitat mitjana','Velocidad nedia','Average speed'];
  motionAvgSpeed = ['Vel. mitjana en moviment','Vel. nedia en movimiento.','In-motion average speed'];
  canvasAltitude = ['ALTITUD (m) vs DISTÀNCIA (km)','ALTITUD (m) vs DISTANCIA (km)','ALTITUDE (m) vs DISTANCE (km)'];
  canvasSpeed = ['VELOCITAT (km/h) vs TEMPS','VELOCIDAD (km/h) vs TIEMPO','SPEED (km/h) vs TIME'];

  status: 'black' | 'red' | 'green' = 'black';
  currentAverageSpeed: number | undefined = undefined;
  currentMotionSpeed: number | undefined = undefined;
  currentMotionTime: string = '00:00:00';
  currentUnit: string = '' // time unit for canvas ('s' seconds, 'min' minutes, 'h' hours)
  archivedUnit: string = '' // time unit for canvas ('s' seconds, 'min' minutes, 'h' hours)
  canvasNum: number = 400; // canvas size
  averagedSpeed: number = 0;
  stopped: number = 0;
  vMin: number = 1;

  currentCtx: [CanvasRenderingContext2D | undefined, CanvasRenderingContext2D | undefined] = [undefined, undefined];
  archivedCtx: [CanvasRenderingContext2D | undefined, CanvasRenderingContext2D | undefined] = [undefined, undefined];
  properties: (keyof Data)[] = ['altitude', 'compSpeed'];
  margin: number = 10;

  layerVisibility = global.layerVisibility;
  languageIndex = global.languageIndex;

  private subscriptions: Subscription = new Subscription();

  constructor(
    private router: Router,
    public fs: FunctionsService,
    public ts: TrackService
  ) { }

  async ngOnInit() {
    await this.createCanvas();
    this.subscriptions.add(
      this.ts.currentTrack$.subscribe(async current => {
        this.currentTrack = current;
        await this.averageSpeed();
        this.currentUnit = await this.updateAllCanvas(this.currentCtx, this.currentTrack);
      })
    );
    this.subscriptions.add(
      this.ts.archivedTrack$.subscribe(async archived => {
        this.archivedTrack = archived;
        this.archivedUnit = await this.updateAllCanvas(this.archivedCtx, this.archivedTrack);
      })
    );
    this.subscriptions.add(
      this.ts.status$.subscribe(async status => {
        this.status = status;
      })
    );
    if (this.archivedTrack) this.archivedUnit = await this.updateAllCanvas(this.archivedCtx, this.archivedTrack);
    console.log('I', this.currentTrack, this.archivedTrack, this.status, this.layerVisibility)
  }

  ngOnDestroy() {
    this.subscriptions.unsubscribe();
  }

  async ionViewWillEnter() {
    // Variables
    this.layerVisibility = global.layerVisibility;
    this.languageIndex = global.languageIndex;
    console.log('I', this.currentTrack, this.archivedTrack, this.status, this.layerVisibility)
  }

  // 34. COMPUTE AVERAGE SPEEDS AND TIMES
  async averageSpeed() {
    if (!this.currentTrack) return;
    // get data array
    const data = this.currentTrack.features[0].geometry.properties.data;
    const num = data.length ?? 0;
    if (num < 2) return;
    // Compute time at rest
    for (let i = this.averagedSpeed + 1; i < num; i++) {
      if (data[i].compSpeed < this.vMin) {
        // Add the time spent at rest
        this.stopped += (data[i].time - data[i - 1].time) / 1000; // Convert milliseconds to seconds
      }
      this.averagedSpeed = i;  // Track last processed index
    }
    // Compute total time
    let totalTime = data[num - 1].time - data[0].time;
    totalTime = totalTime / 1000; // Convert milliseconds to seconds
    // Calculate average speed (in km/h)
    this.currentAverageSpeed = (3600 * data[num - 1].distance) / totalTime;
    // If the total time minus stopped time is greater than 5 seconds, calculate motion speed
    if (totalTime - this.stopped > 5) {
      this.currentMotionSpeed = (3600 * data[num - 1].distance) / (totalTime - this.stopped);
    }
    // Format the motion time
    this.currentMotionTime = this.fs.formatMillisecondsToUTC(1000 * (totalTime - this.stopped));
  }

  // 25. CREATE CANVASES //////////////////////////////////////////
  async createCanvas() {
    const size = Math.min(window.innerWidth, window.innerHeight);
    for (const i in this.properties) {
      this.initCanvas(`currCanvas${i}`, size, this.currentCtx, i);
      this.initCanvas(`archCanvas${i}`, size, this.archivedCtx, i);
    }
    this.canvasNum = size;
  }

  private initCanvas(
    elementId: string,
    size: number,
    ctxArray: [CanvasRenderingContext2D | undefined, CanvasRenderingContext2D | undefined],
    index: string | number
  ) {
    const canvas = document.getElementById(elementId) as HTMLCanvasElement;
    if (canvas) {
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (ctx) ctxArray[Number(index)] = ctx;
    } else {
      console.error(`Canvas with ID ${elementId} not found.`);
    }
  }

  // 30. UPDATE CANVAS ///////////////////////////////////
  async updateCanvas(
    ctx: CanvasRenderingContext2D | undefined,
    track: Track | undefined,
    propertyName: keyof Data,
    xParam: string
  ) {
    let tUnit: string = ''
    if (!ctx) return tUnit;
    // Reset and clear the canvas
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvasNum, this.canvasNum);
    if (!track) return tUnit;
    // No need for empty checks; remove them for clarity
    // Define data array
    const data = track.features[0].geometry.properties.data;
    const num = data.length ?? 0;
    if (num === 0) return tUnit;
    // Determine time/distance scale and units
    let xDiv: number = 1;
    let xTot: number;
    if (xParam === 'x') {
      xTot = data[num - 1].distance;
    } else {
      xTot = data[num - 1].time - data[0].time;
      if (xTot > 3600000) {
        tUnit = 'h';
        xDiv = 3600000;
      } else if (xTot > 60000) {
        tUnit = 'min';
        xDiv = 60000;
      } else {
        tUnit = 's';
        xDiv = 1000;
      }
      xTot /= xDiv;
    }
    // Compute min and max bounds
    const bounds = await this.fs.computeMinMaxProperty(data, propertyName);
    if (bounds.max === bounds.min) {
      bounds.max += 2;
      bounds.min -= 2;
    }
    // Compute scaling factors for drawing
    const scaleX = (this.canvasNum - 2 * this.margin) / xTot;
    const scaleY = (this.canvasNum - 2 * this.margin) / (bounds.min - bounds.max);
    const offsetX = this.margin;
    const offsetY = this.margin - bounds.max * scaleY;
    // Draw the line graph
    ctx.setTransform(scaleX, 0, 0, scaleY, offsetX, offsetY);
    ctx.beginPath();
    ctx.moveTo(0, bounds.min);
    for (const point of data) {
      const xValue = xParam === 'x' ? point.distance : (point.time - data[0].time) / xDiv;
      const yValue = point[propertyName];
      ctx.lineTo(xValue, yValue);
    }
    // Close the path and fill with color
    ctx.lineTo(xTot, bounds.min);
    ctx.closePath();
    ctx.fillStyle = 'yellow';
    ctx.fill();
    // Reset transformation matrix
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // Draw grid
    await this.grid(ctx, 0, xTot, bounds.min, bounds.max, scaleX, scaleY, offsetX, offsetY);
    return tUnit;
  }

  // 26. GRID /////////////////////////////////////////////////////
  async grid(
    ctx: CanvasRenderingContext2D | undefined,
    xMin: number,
    xMax: number,
    yMin: number,
    yMax: number,
    a: number,
    d: number,
    e: number,
    f: number
  ) {
    // Return if there is no canvascontext
    if (!ctx) return;
    // Define fonts and styles
    ctx.font = "15px Arial"
    ctx.save();
    ctx.setLineDash([5, 15]);
    ctx.strokeStyle = 'black';
    ctx.fillStyle = 'black'
    // Define line spacing and position
    const gridx = this.gridValue(xMax - xMin);
    const gridy = this.gridValue(yMax - yMin);
    const fx = Math.ceil(xMin / gridx);
    const fy = Math.ceil(yMin / gridy);
    // Draw vertical lines
    for (var xi = fx * gridx; xi <= xMax; xi += gridx) {
      ctx.beginPath();
      ctx.moveTo(xi * a + e, yMin * d + f);
      ctx.lineTo(xi * a + e, yMax * d + f);
      ctx.stroke();
      ctx.fillText(xi.toLocaleString(), xi * a + e + 2, yMax * d + f + 15)
    }
    // Draw horizontal lines
    for (var yi = fy * gridy; yi <= yMax; yi += gridy) {
      ctx.beginPath();
      ctx.moveTo(xMin * a + e, yi * d + f);
      ctx.lineTo(xMax * a + e, yi * d + f);
      ctx.stroke();
      ctx.fillText(yi.toLocaleString(), xMin * a + e + 2, yi * d + f - 10)
    }
    // Restore context
    ctx.restore();
    ctx.setLineDash([]);
  }

  // 27. DETERMINATION OF GRID STEP //////////////////////
  gridValue(dx: number) {
    const nx = Math.floor(Math.log10(dx));
    const x = dx / (10 ** nx);
    if (x < 2.5) return 0.5 * (10 ** nx);
    else if (x < 5) return 10 ** nx;
    else return 2 * (10 ** nx);
  }

  // 21. UPDATE ALL CANVAS ////////////////////////////////
  async updateAllCanvas(context: Record<string, any>, track: Track | undefined): Promise<string> {
    // Validate context
    if (!context) {
      return '';
    }
    // Open canvas
    try {
      // Hide canvas for the current or archived track
      if (track === this.currentTrack || track === this.archivedTrack) {
        const type = track === this.currentTrack ? 'c' : 'a';
      }
      // Update canvas
      let lastUnit = '';
      for (const [index, property] of Object.entries(this.properties)) {
        const mode = property === 'altitude' ? 'x' : 't';
        lastUnit = await this.updateCanvas(context[index], track, property, mode);
      }
      return lastUnit;
    } finally {
      // Close canvas
    }
  }

}
