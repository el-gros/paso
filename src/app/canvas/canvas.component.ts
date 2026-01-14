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
  trackSub: any;
  fgSub: any;
  archivedCtx: [CanvasRenderingContext2D | undefined, CanvasRenderingContext2D | undefined] = [undefined, undefined];
  canvasNum: number = 400;
  margin: number = 10;
  // Averages
  currentAverageSpeed: number | undefined = undefined;
  currentMotionSpeed: number | undefined = undefined;
  currentMotionTime: string = '00:00:00';

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

  // 4. ION VIEW WILL ENTER //////////////////
  async ionViewWillEnter() {
     // A. Comprobar si estamos en primer plano y actualizar datos básicos
    if (this.appState.isForeground()) {
      await this.runCanvasUpdates();
    }

    // B. Actualizar track archivado (Slide 2)
    if (this.reference.archivedTrack) {
      this.archivedUnit = await this.updateAllCanvas(this.archivedCtx, this.reference.archivedTrack);
      this.partialSpeeds = await this.fs.computePartialSpeeds(this.reference.archivedTrack);
    }

    // C. GESTIÓN DE SUBSCRIPCIONES (Limpiamos antes de crear para evitar duplicados)
    this.trackSub?.unsubscribe();
    this.trackSub = this.present.currentTrack$.subscribe(async track => {
      if (!this.appState.isForeground() || !track) return;
      await this.runCanvasUpdates();
    });

    this.fgSub?.unsubscribe();
    this.fgSub = this.appState.onEnterForeground().subscribe(async () => {
      await this.runCanvasUpdates();
    });

    // D. LÓGICA DE EXPORTACIÓN (Si venimos de Archive con la bandera activada)
    if (this.fs.buildTrackImage) {
      // Pequeño delay extra para que Swiper y los Canvas se estabilicen en el DOM
      await new Promise(r => setTimeout(r, 300));

      const success = await this.triggerExport();
      
      // Resetear siempre la bandera para no entrar en bucle
      this.fs.buildTrackImage = false;

      if (success) {
        console.log("Exportación exitosa, volviendo a Archive");
        this.fs.gotoPage('archive');
      } else {
        console.error("Fallo al generar imagen");
        await this.fs.displayToast(this.translate.instant('MAP.TOIMAGE_FAILED'));
        this.fs.gotoPage('archive');
      }
    }
  }

  // 3. ION VIEW WILL LEAVE //////////////////
  ionViewWillLeave() {
    // Cortamos las suscripciones inmediatamente al salir para ahorrar CPU y batería
    this.trackSub?.unsubscribe();
    this.fgSub?.unsubscribe();
    console.log("Suscripciones cerradas al salir de Canvas");
  }

  // 5. RUN CANVAS UPDATES //////////////////////////////////
  async runCanvasUpdates() {
    const track = this.present.currentTrack;
    if (!track || !this.currentCtx) return;
    this.currentUnit = await this.updateAllCanvas(this.currentCtx, track);
    this.partialSpeeds = await this.fs.computePartialSpeeds(track);
    await this.averageSpeed();
  }

  // 6. COMPUTE AVERAGE SPEEDS AND TIMES
  async averageSpeed() {
    if (!this.present.currentTrack) return;
    // get data array
    const data = this.present.currentTrack.features[0].geometry.properties.data;
    const num = data.length ?? 0;
    if (num < 2) return;
    // Compute time at rest
    for (let i = this.location.averagedSpeed + 1; i < num; i++) {
      if (data[i].compSpeed < this.vMin) {
        // Add the time spent at rest
        this.location.stopped += (data[i].time - data[i - 1].time) / 1000; // Convert milliseconds to seconds
      }
      this.location.averagedSpeed = i;  // Track last processed index
    }
    // Compute total time
    let totalTime = (data[num - 1].time - data[0].time)/1000;
    // Calculate average speed (in km/h)
    this.currentAverageSpeed = (3600 * data[num - 1].distance) / totalTime;
    // If the total time minus stopped time is greater than 5 seconds, calculate motion speed
    if (totalTime - this.location.stopped > 5) {
      this.currentMotionSpeed = (3600 * data[num - 1].distance) / (totalTime - this.location.stopped);
    }
    // Format the motion time
    this.currentMotionTime = this.fs.formatMillisecondsToUTC(1000 * (totalTime - this.location.stopped));
  }

  // 7. CREATE CANVASES //////////////////////////////////////////
  async createCanvas() {
    const size = Math.min(window.innerWidth, window.innerHeight);
    for (const i in this.fs.properties) {
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

    // 1. Reset y Limpieza
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvasNum, this.canvasNum);

    if (!track || !track.features[0].geometry.properties.data.length) return tUnit;
    
    const data = track.features[0].geometry.properties.data;
    const num = data.length;

    // 2. Cálculo de unidades de tiempo/distancia (X)
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

    // Evitar división por cero si el track acaba de empezar
    if (xTot <= 0) xTot = 0.0001; 

    // 3. Cálculo de límites (Y)
    const bounds = await this.fs.computeMinMaxProperty(data, propertyName);
    if (bounds.max === bounds.min) {
      bounds.max += 2; 
      bounds.min -= 2;
    }

    // 4. Transformación Matemática
    // El eje Y en HTML Canvas está invertido (0 arriba), por eso usamos (min - max)
    const availSize = this.canvasNum - 2 * this.margin;
    const scaleX = availSize / xTot;
    const scaleY = availSize / (bounds.min - bounds.max);
    const offsetX = this.margin;
    const offsetY = this.margin - bounds.max * scaleY;

    // 5. Dibujo de la Sombra/Área
    ctx.setTransform(scaleX, 0, 0, scaleY, offsetX, offsetY);
    ctx.beginPath();
    ctx.moveTo(0, bounds.min); // Empezar en el "suelo" de la gráfica

    const startTime = data[0].time;
    for (let i = 0; i < num; i++) {
      const p = data[i];
      const x = xParam === 'x' ? p.distance : (p.time - startTime) / xDiv;
      const y = p[propertyName] as number;
      ctx.lineTo(x, y);
    }

    ctx.lineTo(xTot, bounds.min); // Cerrar hacia el suelo al final
    ctx.closePath();
    
    // Estilo de la gráfica
    ctx.fillStyle = 'rgba(255, 255, 0, 0.6)'; // Amarillo con un poco de transparencia queda mejor
    ctx.fill();

    // 6. Reset para dibujar la rejilla (labels y líneas)
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

}
