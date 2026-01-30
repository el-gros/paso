import { CUSTOM_ELEMENTS_SCHEMA, ChangeDetectorRef, Component, OnDestroy, OnInit, Inject } from '@angular/core';
import { Subscription } from 'rxjs';
import { Track, PartialSpeed, Data, Waypoint } from '../../globald';
import { FunctionsService } from '../services/functions.service';
import { ReferenceService } from '../services/reference.service';
import { PresentService } from '../services/present.service';
import { AppStateService } from '../services/appState.service';
import { LocationManagerService } from '../services/location-manager.service';
import { register } from 'swiper/element/bundle';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import * as htmlToImage from 'html-to-image';
import { IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
register();

@Component({
  selector: 'app-canvas',
  templateUrl: './canvas.component.html',
  styleUrls: ['./canvas.component.scss'],
  standalone: true,
  imports: [
    IonicModule, CommonModule, FormsModule, TranslateModule
  ],
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class CanvasComponent implements OnInit {

  currentUnit: string = '' // time unit for canvas ('s' seconds, 'min' minutes, 'h' hours)
  currentCtx: [CanvasRenderingContext2D | undefined, CanvasRenderingContext2D | undefined] = [undefined, undefined];
  archivedUnit: string = '' // time unit for canvas ('s' seconds, 'min' minutes, 'h' hours)
  vMin: number = 1;
  partialSpeeds: PartialSpeed[] = [];
  subscription?: Subscription;
  private trackSub?: Subscription; 
  private fgSub?: Subscription;
  archivedCtx: [CanvasRenderingContext2D | undefined, CanvasRenderingContext2D | undefined] = [undefined, undefined];

  margin: number = 10;
  currentMotionTime: string = '00:00:00';
  private destroy$ = new Subject<void>();
  canvasSize: number = 400;

  constructor(
    public fs: FunctionsService,
    private translate: TranslateService,
    public reference: ReferenceService,
    public present: PresentService,
    private appState: AppStateService,
    public location: LocationManagerService,
  ) {

    }

  // 1. ngOnInit()
  // 2. ngOnDestroy()
  // 3. ionViewWillLeave() 
  // 4. ionViewWillEnter()
  // 5. runCanvasUpdates()
  // 6. averageSpeed()
  // 7. createCanvas()
  // 8. triggerExport()
  // 9. updateAllCanvas()


  // 1. ON INIT ///////////////////
  async ngOnInit() {
    // Create canvas
    await this.createCanvas();
  }

  // ON DESTROY /////////////////////
  ngOnDestroy() {
    // Cerramos el flujo definitivamente
    this.destroy$.next();
    this.destroy$.complete();
  }

  // 3. ION VIEW WILL LEAVE //////////////////
  ionViewWillLeave() {
    // Notificamos que abandonamos la vista para pausar suscripciones
    this.destroy$.next();
    console.log("Suscripciones pausadas al salir");
  }

  // 4. ION VIEW WILL ENTER //////////////////
  async ionViewWillEnter() {
    // 1. RE-INITIALIZE CANVASES
    // This ensures the element IDs are found and the context is stored in this.currentCtx
    await this.createCanvas();

    // 2. IMMEDIATE DATA RECOVERY
    // We don't wait for a GPS ping. If data exists, we draw it immediately.
    // We use a tiny delay (50ms) to ensure the DOM is stable before drawing.
    setTimeout(async () => {
      if (this.present.currentTrack) {
        await this.runCanvasUpdates();
      }

      // B. Update archived track (Slide 2) if it exists
      if (this.reference.archivedTrack) {
        this.archivedUnit = await this.updateAllCanvas(this.archivedCtx, this.reference.archivedTrack);
        this.partialSpeeds = await this.fs.computePartialSpeeds(this.reference.archivedTrack);
      }
    }, 50);

    // 3. REACTIVE SUBSCRIPTIONS
    // Use takeUntil(this.destroy$) to prevent memory leaks when leaving the page
    this.present.currentTrack$
      .pipe(takeUntil(this.destroy$)) 
      .subscribe(async track => {
        // Only draw if the app is in foreground and we have data
        if (!this.appState.isForeground$() || !track) return;
        await this.runCanvasUpdates();
      });

    this.appState.onEnterForeground()
      .pipe(takeUntil(this.destroy$))
      .subscribe(async () => {
        await this.runCanvasUpdates();
      });

    // 4. EXPORT LOGIC
    // If the user triggered an export from the previous page
    if (this.fs.buildTrackImage) {
      await new Promise(r => setTimeout(r, 500)); // Wait for render to settle

      const success = await this.triggerExport();
      this.fs.buildTrackImage = false;

      if (success) {
        this.fs.gotoPage('archive');
      } else {
        await this.fs.displayToast(this.translate.instant('MAP.TOIMAGE_FAILED'));
        this.fs.gotoPage('archive');
      }
    }
  }

  // 5. RUN CANVAS UPDATES //////////////////////////////////
  async runCanvasUpdates() {
    const track = this.present.currentTrack;
    if (!track || !this.currentCtx) return;
    this.currentUnit = await this.updateAllCanvas(this.currentCtx, track);
    this.partialSpeeds = await this.fs.computePartialSpeeds(track);
  }

  // 7. CREATE CANVASES //////////////////////////////////////////
  async createCanvas() {
    // Use a square size based on the viewport
    const size = Math.min(window.innerWidth, window.innerHeight);
    this.canvasSize = size; // Renamed for clarity

    // Use forEach to get the index as a number immediately
    this.fs.properties.forEach((_, i) => {
      this.initCanvas(`currCanvas${i}`, size, this.currentCtx, i);
      this.initCanvas(`archCanvas${i}`, size, this.archivedCtx, i);
    });
  }

  private initCanvas(
    elementId: string, 
    size: number, 
    ctxArray: (CanvasRenderingContext2D | undefined)[], // Changed from tuple to array
    index: number
  ) {
    const canvas = document.getElementById(elementId) as HTMLCanvasElement;
    
    if (!canvas) {
      console.error(`Canvas with ID ${elementId} not found.`);
      return;
    }

    canvas.width = size;
    canvas.height = size;
    
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctxArray[index] = ctx;
    }
  }

  // 8. UPDATE ALL CANVAS ////////////////////////////////
  async triggerExport(): Promise<boolean> {
    try {
      const exportArea = document.querySelector('#exportArea') as HTMLElement;
      if (!exportArea) {
        console.error('Export area not found');
        return false;
      }
      // ensure rendering is finished
      await new Promise(r => setTimeout(r, 100));
      const dataUrl = await htmlToImage.toPng(exportArea, {
        backgroundColor: '#ffffff',
        style: {
          width: `${exportArea.scrollWidth}px`,
          height: `${exportArea.scrollHeight}px`,
        }
      });
      const filename = 'data.png'; // avoid overwrite issues
      await Filesystem.writeFile({
        path: filename,
        data: dataUrl.split(',')[1],
        directory: Directory.ExternalCache,
      });
      await new Promise(r => setTimeout(r, 200));  // small delay
      console.log(`Export saved as ${filename}`);
      return true;
    } catch (err) {
      console.error('Failed to export area:', err);
      return false;
    }
  }

  // 9. UPDATE ALL CANVAS //////////////////////////////////////////
  async updateAllCanvas(context: Record<string, any>, track: Track | undefined): Promise<string> {
    // Validate context
    if (!context) {
      return '';
    }
    // Open canvas
    try {
      // Hide canvas for the current or archived track
      if (track === this.present.currentTrack || track === this.reference.archivedTrack) {
        const type = track === this.present.currentTrack ? 'c' : 'a';
      }
      // Update canvas
      let lastUnit = '';
      for (const [index, property] of Object.entries(this.fs.properties)) {
        const mode = property === 'compAltitude' ? 'x' : 't';
        lastUnit = await this.updateCanvas(context[index], track, property, mode);
      }
      return lastUnit;
    } finally {
      // Close canvas
    }
  }

  async updateCanvas(
    ctx: CanvasRenderingContext2D | undefined,
    track: Track | undefined,
    propertyName: keyof Data,
    xParam: string,
  ): Promise<string> {
    let tUnit = '';
    if (!ctx) return tUnit;

    // 1. Reset and Clear
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvasSize, this.canvasSize);

    if (!track || !track.features[0].geometry.properties.data.length) return tUnit;
    
    const data = track.features[0].geometry.properties.data;
    const num = data.length;

    // 2. Calculation of X units
    let xDiv = 1;
    let xTot: number;
    if (xParam === 'x') {
      xTot = data[num - 1].distance;
    } else {
      const timeDiff = data[num - 1].time - data[0].time;
      if (timeDiff > 3600000) { tUnit = 'h'; xDiv = 3600000; }
      else if (timeDiff > 60000) { tUnit = 'min'; xDiv = 60000; }
      else { tUnit = 's'; xDiv = 1000; }
      xTot = timeDiff / xDiv;
    }
    if (xTot <= 0) xTot = 0.0001; 

    // 3. Calculation of Y limits
    const bounds = await this.fs.computeMinMaxProperty(data, propertyName);
    if (bounds.max === bounds.min) {
      bounds.max += 2; 
      bounds.min -= 2;
    }

    // 4. Mathematical Transformation
    const availSize = this.canvasSize - 2 * this.margin;
    const scaleX = availSize / xTot;
    const scaleY = availSize / (bounds.min - bounds.max);
    const offsetX = this.margin;
    const offsetY = this.margin - bounds.max * scaleY;

    const startTime = data[0].time;

    // 🔹 TARGET SPECIFIC PLOTS
    const isSpeedPlot = propertyName === 'compSpeed' || propertyName === 'speed';

    if (isSpeedPlot) {
      // --- MODE: 4px LINE (Speed) ---
      ctx.setTransform(scaleX, 0, 0, scaleY, offsetX, offsetY);
      ctx.beginPath();
      
      const firstX = xParam === 'x' ? data[0].distance : 0;
      ctx.moveTo(firstX, data[0][propertyName] as number);

      for (let i = 1; i < num; i++) {
        const p = data[i];
        const x = xParam === 'x' ? p.distance : (p.time - startTime) / xDiv;
        const y = p[propertyName] as number;
        ctx.lineTo(x, y);
      }

      // Reset transform to identity so the 4px stroke is uniform
      ctx.setTransform(1, 0, 0, 1, 0, 0); 
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#ffff00'; // Pure Yellow
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();

    } else {
      // --- MODE: YELLOW FILL (Altitude) ---
      ctx.setTransform(scaleX, 0, 0, scaleY, offsetX, offsetY);
      ctx.beginPath();
      ctx.moveTo(0, bounds.min); 

      for (let i = 0; i < num; i++) {
        const p = data[i];
        const x = xParam === 'x' ? p.distance : (p.time - startTime) / xDiv;
        const y = p[propertyName] as number;
        ctx.lineTo(x, y);
      }

      ctx.lineTo(xTot, bounds.min); 
      ctx.closePath();
      ctx.fillStyle = 'rgba(255, 255, 0, 0.6)';
      ctx.fill();
    }

    // 6. Draw Grid (Labels and Dashed Lines)
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    await this.grid(ctx, 0, xTot, bounds.min, bounds.max, scaleX, scaleY, offsetX, offsetY);

    return tUnit;
  }

  async grid(
    ctx: CanvasRenderingContext2D | undefined,
    xMin: number,
    xMax: number,
    yMin: number,
    yMax: number,
    a: number,  // scaleX
    d: number,  // scaleY
    e: number,  // offsetX
    f: number   // offsetY
  ) {
    if (!ctx) return;
    // Save state first thing
    ctx.save();
    // Set up styles
    ctx.font = '13px Arial';
    ctx.strokeStyle = '#555';       // softer than black, more readable
    ctx.fillStyle = '#333';
    ctx.lineWidth = 0.5;
    ctx.setLineDash([4, 8]);        // shorter dash for finer grid
    // Compute grid intervals
    const gridx = this.gridValue(xMax - xMin);
    const gridy = this.gridValue(yMax - yMin);
    const fx = Math.ceil(xMin / gridx);
    const fy = Math.ceil(yMin / gridy);
    // Vertical grid lines
    for (let xi = fx * gridx; xi <= xMax; xi += gridx) {
      const px = xi * a + e;
      ctx.beginPath();
      ctx.moveTo(px, yMin * d + f);
      ctx.lineTo(px, yMax * d + f);
      ctx.stroke();
      // Draw X label
      ctx.fillText(
        xi.toLocaleString(undefined, { maximumFractionDigits: 2 }),
        px + 2,
        yMax * d + f + 15
      );
    }
    // Horizontal grid lines
    for (let yi = fy * gridy; yi <= yMax; yi += gridy) {
      const py = yi * d + f;
      ctx.beginPath();
      ctx.moveTo(xMin * a + e, py);
      ctx.lineTo(xMax * a + e, py);
      ctx.stroke();
      // Draw Y label
      ctx.fillText(
        yi.toLocaleString(undefined, { maximumFractionDigits: 2 }),
        xMin * a + e + 2,
        py - 5
      );
    }
    // Restore canvas state and clear dashes
    ctx.restore();
    ctx.setLineDash([]);
  }

  gridValue(dx: number) {
    const nx = Math.floor(Math.log10(dx));
    const x = dx / (10 ** nx);
    if (x < 2.5) return 0.5 * (10 ** nx);
    else if (x < 5) return 10 ** nx;
    else return 2 * (10 ** nx);
  }

  formatMsec(value: number | undefined): string {
    if (!value) return '00:00:00';

    const totalSeconds = Math.floor(value / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

}
