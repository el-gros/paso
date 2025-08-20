/**
 * CanvasComponent is responsible for displaying and managing interactive canvas charts
 * for both the current and archived tracks, including statistics such as distance,
 * elevation gain/loss, speed, and time. It initializes canvases, subscribes to track
 * and status updates, computes average and motion speeds, and renders graphical
 * representations of track data with dynamic scaling and grid overlays. The component
 * supports multilingual labels and adapts canvas size to the viewport.
 */

import { CUSTOM_ELEMENTS_SCHEMA, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
import { global } from '../../environments/environment';
import { Track, TrackDefinition, Data, Waypoint } from '../../globald';
import { IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FunctionsService } from '../services/functions.service';
import { TrackService } from '../services/track.service';
import { register } from 'swiper/element/bundle';
import { LanguageService } from '../services/language.service';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import html2canvas from 'html2canvas';
import { Directory, Filesystem } from '@capacitor/filesystem';
register();

@Component({
  selector: 'app-canvas',
  templateUrl: './canvas.component.html',
  styleUrls: ['./canvas.component.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, TranslateModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class CanvasComponent implements OnInit, OnDestroy {

  currentTrack: Track | undefined = undefined;
  archivedTrack: Track | undefined = undefined;

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

  private subscriptions: Subscription = new Subscription();

  constructor(
    public fs: FunctionsService,
    public ts: TrackService,
    private languageService: LanguageService,
    private translate: TranslateService
  ) { }

  // 1. ngOnInit()
  // 2. ngOnDestroy()
  // 3. ionViewWillEnter()
  // 4. averageSpeed()
  // 5. createCanvas()
  // 6. updateCanvas()
  // 7. grid()
  // 8. gridValue()
  // 9. updateAllCanvas()


  // 1. ON INIT ///////////////////
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

  // 2. ON DESTROY ///////////////////
  ngOnDestroy() {
    this.subscriptions.unsubscribe();
  }

  // 3. ION VIEW WILL ENTER //////////////////
  async ionViewWillEnter() {
    // Variables
    this.layerVisibility = global.layerVisibility;
    console.log('I', this.currentTrack, this.archivedTrack, this.status, this.layerVisibility)
    // If we are in exportation process...
    if (global.buildTrackImage) await this.triggerExport();
  }

  // 4. COMPUTE AVERAGE SPEEDS AND TIMES
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

  // 5. CREATE CANVASES //////////////////////////////////////////
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

  // 6. UPDATE CANVAS ///////////////////////////////////
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

  // 7. GRID /////////////////////////////////////////////////////
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

  // 8. DETERMINATION OF GRID STEP //////////////////////
  gridValue(dx: number) {
    const nx = Math.floor(Math.log10(dx));
    const x = dx / (10 ** nx);
    if (x < 2.5) return 0.5 * (10 ** nx);
    else if (x < 5) return 10 ** nx;
    else return 2 * (10 ** nx);
  }

  // 9. UPDATE ALL CANVAS ////////////////////////////////
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

  async triggerExport(): Promise<void> {
    // Find the second slide
    const slide2 = document.querySelector('swiper-slide:nth-of-type(2)') as HTMLElement;
    if (!slide2) {
      console.error('Slide 2 not found');
      return undefined;
    }
    // Render slide2 to canvas
    const canvas = await html2canvas(slide2);
    // Convert to base64 (strip prefix)
    const dataUrl = canvas.toDataURL('image/png');
    const base64Data = dataUrl.split(',')[1];
    try {
      // Save directly as file (e.g. data.png)
      const fileResult = await Filesystem.writeFile({
        path: 'data.png',
        data: base64Data,
        directory: Directory.Cache,
      });
      console.log('Slide 2 saved at:', fileResult.uri);
      // Navigate to archive page
      this.fs.gotoPage('archive');
      return; // so you can use it later (Share, email…)
    } catch (err) {
      console.error('Failed to save slide 2 image:', err);
      return;
    }
  }

}
