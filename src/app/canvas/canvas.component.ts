import { CUSTOM_ELEMENTS_SCHEMA, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { Subscription, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { Track, PartialSpeed, Data } from '../../globald';
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
  imports: [IonicModule, CommonModule, FormsModule, TranslateModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class CanvasComponent implements OnInit, OnDestroy {

  // --- Tus variables originales ---
  currentUnit: string = '';
  currentCtx: (CanvasRenderingContext2D | undefined)[] = [undefined, undefined];
  archivedUnit: string = '';
  archivedCtx: (CanvasRenderingContext2D | undefined)[] = [undefined, undefined];
  vMin: number = 1;
  partialSpeeds: PartialSpeed[] = [];
  margin: number = 10;
  currentMotionTime: string = '00:00:00';
  canvasSize: number = 400;
  
  private destroy$ = new Subject<void>();

  constructor(
    public fs: FunctionsService,
    private translate: TranslateService,
    public reference: ReferenceService,
    public present: PresentService,
    private appState: AppStateService,
    public location: LocationManagerService,
    private cdr: ChangeDetectorRef,
  ) {}

  async ngOnInit() {
    this.canvasSize = Math.min(window.innerWidth, window.innerHeight);
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  ionViewWillLeave() {
    this.destroy$.next();
  }

  async ionViewWillEnter() {
    // 1. Forzamos render para que el @if cree los canvas en el DOM
    this.cdr.detectChanges();

    // 2. Esperamos a que el DOM esté estable
    setTimeout(async () => {
      await this.refreshAllVisuals();
    }, 200);

    // 3. Suscripciones reactivas
    this.present.currentTrack$
      .pipe(takeUntil(this.destroy$))
      .subscribe(async track => {
        if (!this.appState.isForeground$() || !track) return;
        this.cdr.detectChanges(); // Por si el @if cambió
        await this.drawCurrentTrack();
      });

    this.appState.onEnterForeground()
      .pipe(takeUntil(this.destroy$))
      .subscribe(async () => {
        await this.drawCurrentTrack();
      });

    // 4. Lógica de exportación (se mantiene igual)
    if (this.fs.buildTrackImage) {
      await new Promise(r => setTimeout(r, 600));
      const success = await this.triggerExport();
      this.fs.buildTrackImage = false;
      if (success) this.fs.gotoPage('archive');
    }
  }

  async refreshAllVisuals() {
    await this.drawCurrentTrack();
    await this.drawArchivedTrack();
  }

  async drawCurrentTrack() {
    const track = this.present.currentTrack;
    if (!track) return;

    // Vincular contextos antes de dibujar (soluciona el "no se ven")
    this.fs.properties.forEach((_, i) => {
      this.initCanvas(`currCanvas${i}`, this.canvasSize, this.currentCtx, i);
    });

    this.currentUnit = await this.updateAllCanvas(this.currentCtx, track);
    this.cdr.detectChanges();
  }

  async drawArchivedTrack() {
    const track = this.reference.archivedTrack;
    if (!track) return;

    // Vincular contextos antes de dibujar (soluciona el "desaparecen")
    this.fs.properties.forEach((_, i) => {
      this.initCanvas(`archCanvas${i}`, this.canvasSize, this.archivedCtx, i);
    });

    this.archivedUnit = await this.updateAllCanvas(this.archivedCtx, track);
    this.partialSpeeds = await this.fs.computePartialSpeeds(track);
    this.cdr.detectChanges();
  }

  private initCanvas(elementId: string, size: number, ctxArray: any[], index: number) {
    const canvas = document.getElementById(elementId) as HTMLCanvasElement;
    if (!canvas) return;

    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (ctx) ctxArray[index] = ctx;
  }

  async updateAllCanvas(ctxArray: any[], track: Track): Promise<string> {
    let lastUnit = '';
    // Usamos el bucle for normal para asegurar orden
    for (let i = 0; i < this.fs.properties.length; i++) {
      const property = this.fs.properties[i] as keyof Data;
      const mode = property === 'compAltitude' ? 'x' : 't';
      lastUnit = await this.updateCanvas(ctxArray[i], track, property, mode);
    }
    return lastUnit;
  }

  // --- Lógica de dibujo (Tu lógica original optimizada) ---
  async updateCanvas(
    ctx: CanvasRenderingContext2D | undefined,
    track: Track | undefined,
    propertyName: keyof Data,
    xParam: string,
  ): Promise<string> {
    let tUnit = '';
    if (!ctx) return tUnit;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvasSize, this.canvasSize);

    if (!track || !track.features[0].geometry.properties.data.length) return tUnit;
    
    const data = track.features[0].geometry.properties.data;
    const num = data.length;

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

    const bounds = await this.fs.computeMinMaxProperty(data, propertyName);
    if (bounds.max === bounds.min) { bounds.max += 2; bounds.min -= 2; }

    const availSize = this.canvasSize - 2 * this.margin;
    const scaleX = availSize / xTot;
    const scaleY = availSize / (bounds.min - bounds.max);
    const offsetX = this.margin;
    const offsetY = this.margin - bounds.max * scaleY;
    const startTime = data[0].time;

    const isSpeedPlot = propertyName === 'compSpeed' || propertyName === 'speed';

    // --- CONFIGURACIÓN DE COLORES Y DEGRADADOS ---
    const mainColor = isSpeedPlot ? '0, 191, 255' : '255, 215, 0'; // Cian vs Oro
    
    // Dibujamos el área con degradado
    ctx.setTransform(scaleX, 0, 0, scaleY, offsetX, offsetY);
    ctx.beginPath();
    ctx.moveTo(0, bounds.min); 

    for (let i = 0; i < num; i++) {
      const p = data[i];
      const x = xParam === 'x' ? p.distance : (p.time - startTime) / xDiv;
      ctx.lineTo(x, p[propertyName] as number);
    }

    ctx.lineTo(xTot, bounds.min); 
    ctx.closePath();

    // Aplicar el degradado de fondo
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const fillGradient = ctx.createLinearGradient(0, this.margin, 0, this.canvasSize - this.margin);
    fillGradient.addColorStop(0, `rgba(${mainColor}, 0.6)`);
    fillGradient.addColorStop(0.5, `rgba(${mainColor}, 0.2)`);
    fillGradient.addColorStop(1, `rgba(${mainColor}, 0.01)`);
    ctx.fillStyle = fillGradient;
    ctx.fill();

    // Dibujar la línea superior (Grosor fino y uniforme)
    ctx.setTransform(scaleX, 0, 0, scaleY, offsetX, offsetY);
    ctx.beginPath();
    const firstX = xParam === 'x' ? data[0].distance : 0;
    ctx.moveTo(firstX, data[0][propertyName] as number);
    for (let i = 1; i < num; i++) {
      const p = data[i];
      const x = xParam === 'x' ? p.distance : (p.time - startTime) / xDiv;
      ctx.lineTo(x, p[propertyName] as number);
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.lineWidth = 2; // Línea fina como pediste
    ctx.strokeStyle = `rgba(${mainColor}, 1)`;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();

    // 4. Grid (Reset transform)
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    await this.grid(ctx, 0, xTot, bounds.min, bounds.max, scaleX, scaleY, offsetX, offsetY);

    return tUnit;
  }

  async grid(ctx: CanvasRenderingContext2D, xMin: number, xMax: number, yMin: number, yMax: number, a: number, d: number, e: number, f: number) {
    ctx.save();
    ctx.font = '13px Arial';
    ctx.strokeStyle = '#555';
    ctx.fillStyle = '#333';
    ctx.lineWidth = 0.5;
    ctx.setLineDash([4, 8]);
    const gridx = this.gridValue(xMax - xMin);
    const gridy = this.gridValue(yMax - yMin);
    for (let xi = Math.ceil(xMin / gridx) * gridx; xi <= xMax; xi += gridx) {
      const px = xi * a + e;
      ctx.beginPath(); ctx.moveTo(px, yMin * d + f); ctx.lineTo(px, yMax * d + f); ctx.stroke();
      ctx.fillText(xi.toLocaleString(undefined, { maximumFractionDigits: 1 }), px + 2, yMax * d + f + 15);
    }
    for (let yi = Math.ceil(yMin / gridy) * gridy; yi <= yMax; yi += gridy) {
      const py = yi * d + f;
      ctx.beginPath(); ctx.moveTo(xMin * a + e, py); ctx.lineTo(xMax * a + e, py); ctx.stroke();
      ctx.fillText(yi.toLocaleString(undefined, { maximumFractionDigits: 1 }), xMin * a + e + 2, py - 5);
    }
    ctx.restore();
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

  async triggerExport(): Promise<boolean> {
    try {
      const exportArea = document.querySelector('#exportArea') as HTMLElement;
      if (!exportArea) return false;
      const dataUrl = await htmlToImage.toPng(exportArea, { backgroundColor: '#ffffff' });
      await Filesystem.writeFile({
        path: 'data.png',
        data: dataUrl.split(',')[1],
        directory: Directory.ExternalCache,
      });
      return true;
    } catch (err) {
      return false;
    }
  }
}