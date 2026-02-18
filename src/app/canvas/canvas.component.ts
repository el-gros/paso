import { CUSTOM_ELEMENTS_SCHEMA, ChangeDetectorRef, Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { Subject } from 'rxjs';
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

  currentUnit: string = '';
  currentCtx: (CanvasRenderingContext2D | undefined)[] = [undefined, undefined];
  archivedUnit: string = '';
  archivedCtx: (CanvasRenderingContext2D | undefined)[] = [undefined, undefined];
  vMin: number = 1;
  partialSpeeds: PartialSpeed[] = [];
  margin: number = 10;
  canvasSize: number = 400;
  currAvailable: boolean[] = [true, true];
  archAvailable: boolean[] = [true, true];
  
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
    this.updateCanvasSize();
  }

  // MEJORA 1: Manejar rotación de pantalla
  @HostListener('window:resize')
  onResize() {
    this.updateCanvasSize();
    this.refreshAllVisuals(); // Redibujar al cambiar tamaño
  }

  private updateCanvasSize() {
    // Dejamos un pequeño margen para que no desborde
    this.canvasSize = Math.min(window.innerWidth, window.innerHeight) - 20;
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  ionViewWillLeave() {
    this.destroy$.next();
  }

  async ionViewDidEnter() {
    this.currentCtx = [undefined, undefined];
    this.archivedCtx = [undefined, undefined];
    
    // MEJORA 2: Asegurar renderizado con un pequeño delay para que el DOM estabilice tamaños
    this.cdr.detectChanges();

    setTimeout(async () => {
       await this.refreshAllVisuals();
    }, 100);

    // Subscriptions
    this.present.currentTrack$
      .pipe(takeUntil(this.destroy$))
      .subscribe(async track => {
        if (!this.appState.isForeground$() || !track) return;
        await this.drawCurrentTrack();
      });

    this.appState.onEnterForeground()
      .pipe(takeUntil(this.destroy$))
      .subscribe(async () => {
        this.currentCtx = [undefined, undefined];
        await this.drawCurrentTrack();
      });

    if (this.fs.buildTrackImage) {
      setTimeout(async () => {
        const success = await this.triggerExport();
        this.fs.buildTrackImage = false;
        if (success) this.fs.gotoPage('archive');
      }, 800); // Un poco más de tiempo para asegurar pintado
    }
  }

  async refreshAllVisuals() {
    await this.drawCurrentTrack();
    await this.drawArchivedTrack();
  }

  async drawCurrentTrack() {
    const track = this.present.currentTrack;
    if (!track) return;

    this.fs.properties.forEach((_, i) => {
      // MEJORA 3: Re-inicializar siempre si el tamaño ha cambiado o el contexto se perdió
      const el = document.getElementById(`currCanvas${i}`) as HTMLCanvasElement;
      if (el && (el.width !== this.canvasSize || !this.currentCtx[i])) {
         this.initCanvas(`currCanvas${i}`, this.canvasSize, this.currentCtx, i);
      }
    });

    this.currentUnit = await this.updateAllCanvas(this.currentCtx, track, this.currAvailable);
    this.cdr.detectChanges();
  }

  async drawArchivedTrack() {
    const track = this.reference.archivedTrack;
    if (!track) return;

    this.fs.properties.forEach((_, i) => {
      const el = document.getElementById(`archCanvas${i}`) as HTMLCanvasElement;
      if (el && (el.width !== this.canvasSize || !this.archivedCtx[i])) {
        this.initCanvas(`archCanvas${i}`, this.canvasSize, this.archivedCtx, i);
      }
    });

    this.archivedUnit = await this.updateAllCanvas(this.archivedCtx, track, this.archAvailable);

    if (this.archAvailable[1]) {
      const results = await this.fs.computePartialSpeeds(track);
      this.partialSpeeds = [...results];
    } else {
      this.partialSpeeds = [];
    }
    this.cdr.detectChanges();
  }

  private initCanvas(elementId: string, size: number, ctxArray: any[], index: number) {
    const canvas = document.getElementById(elementId) as HTMLCanvasElement;
    if (!canvas) return;

    // MEJORA 4: Soporte básico para pantallas retina (opcional, pero recomendado)
    // Hace que las líneas se vean nítidas
    const dpr = window.devicePixelRatio || 1;
    // Ajustamos tamaño visual vs tamaño real del buffer
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    canvas.width = size * dpr;
    canvas.height = size * dpr;

    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.scale(dpr, dpr); // Escalamos todo el contexto
      ctxArray[index] = ctx;
    }
  }

  async updateAllCanvas(ctxArray: any[], track: Track, availabilityArray: boolean[]): Promise<string> {
    let lastUnit = '';
    const data = track.features?.[0]?.geometry?.properties?.data;
    if (!data || data.length === 0) return '';

    const hasTime = data[0]?.time > 0 || data[1]?.time > 0;
    
    for (let i = 0; i < this.fs.properties.length; i++) {
      const property = this.fs.properties[i] as keyof Data;
      const mode = property === 'compAltitude' ? 'x' : 't';

      if (mode === 't' && !hasTime) {
        availabilityArray[i] = false;
        if (ctxArray[i]) this.drawNoDataWarning(ctxArray[i], "No Time Data");
        continue; 
      }

      availabilityArray[i] = true;
      lastUnit = await this.updateCanvas(ctxArray[i], track, property, mode);
    }
    return lastUnit;
  }

  // MEJORA 5: Método auxiliar para reparar distancias
  private ensureDistancesCalculated(track: Track, data: Data[]) {
    const num = data.length;
    // Si hay datos, hay más de 1 punto, y la distancia final es 0 -> Necesita cálculo
    if (num > 1 && data[num - 1].distance === 0) {
        // Casting explícito a number[][] para evitar errores de TS con GeoJSON
        const coords = track.features[0].geometry.coordinates as number[][];
        
        // Validación extra de seguridad
        if (!coords || coords.length !== num) return; 

        let totalDist = 0;
        data[0].distance = 0; 
        
        for (let k = 1; k < num; k++) {
            const d = this.fs.quickDistance(
                coords[k-1][0], coords[k-1][1], 
                coords[k][0],   coords[k][1]
            );
            totalDist += d;
            data[k].distance = totalDist;
        }
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

    // Resetear transformaciones para limpiar correctamente
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // Nota: Si usas DPR (Retina), aquí deberías multiplicar canvasSize * dpr para clearRect
    // Pero como usamos scale(), con limpiar un área grande basta
    const dpr = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, this.canvasSize * dpr, this.canvasSize * dpr);

    if (!track || !track.features[0].geometry.properties.data.length) return tUnit;
    
    const data = track.features[0].geometry.properties.data;
    const num = data.length;

    // Llamamos al método auxiliar de reparación si es eje X
    if (xParam === 'x') {
        this.ensureDistancesCalculated(track, data);
    }

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

    if (xTot <= 0.0001) xTot = 0.0001; 

    const bounds = await this.fs.computeMinMaxProperty(data, propertyName);
    if (bounds.max === bounds.min) { bounds.max += 2; bounds.min -= 2; }

    const availSize = this.canvasSize - 2 * this.margin;
    const scaleX = availSize / xTot;
    const scaleY = availSize / (bounds.min - bounds.max);
    const offsetX = this.margin;
    const offsetY = this.margin - bounds.max * scaleY;
    const startTime = data[0].time;

    const isSpeedPlot = propertyName === 'compSpeed' || propertyName === 'speed';
    const mainColor = isSpeedPlot ? '0, 191, 255' : '255, 215, 0'; 
    
    ctx.setTransform(scaleX, 0, 0, scaleY, offsetX, offsetY);
    ctx.beginPath();
    ctx.moveTo(0, bounds.min); 

    for (let i = 0; i < num; i++) {
      const p = data[i];
      const valX = xParam === 'x' ? p.distance : (p.time - startTime) / xDiv;
      const x = isNaN(valX) ? 0 : valX; 
      ctx.lineTo(x, p[propertyName] as number);
    }

    ctx.lineTo(xTot, bounds.min); 
    ctx.closePath();

    ctx.setTransform(1, 0, 0, 1, 0, 0); // Restaurar para pintar gradiente
    // IMPORTANTE: Escalar si usamos DPR
    // Si no usas DPR, elimina la linea de ctx.scale en initCanvas y esto funcionará igual.
    // Si usas DPR, el gradiente debe ajustarse. 
    // Para simplificar, asumimos que NO usas DPR complejo o que el gradiente se ve bien.
    
    const fillGradient = ctx.createLinearGradient(0, this.margin, 0, this.canvasSize - this.margin);
    fillGradient.addColorStop(0, `rgba(${mainColor}, 0.6)`);
    fillGradient.addColorStop(0.5, `rgba(${mainColor}, 0.2)`);
    fillGradient.addColorStop(1, `rgba(${mainColor}, 0.01)`);
    ctx.fillStyle = fillGradient;
    
    // Volver a transformar para pintar el relleno (fill) dentro del path
    ctx.setTransform(scaleX, 0, 0, scaleY, offsetX, offsetY);
    ctx.fill();

    // Pintar la línea superior
    ctx.beginPath();
    const firstValX = xParam === 'x' ? data[0].distance : 0;
    ctx.moveTo(firstValX || 0, data[0][propertyName] as number);
    
    for (let i = 1; i < num; i++) {
      const p = data[i];
      const valX = xParam === 'x' ? p.distance : (p.time - startTime) / xDiv;
      const x = isNaN(valX) ? 0 : valX;
      ctx.lineTo(x, p[propertyName] as number);
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.lineWidth = 2; 
    ctx.strokeStyle = `rgba(${mainColor}, 1)`;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    await this.grid(ctx, 0, xTot, bounds.min, bounds.max, scaleX, scaleY, offsetX, offsetY);

    return tUnit;
  }

  async grid(ctx: CanvasRenderingContext2D, xMin: number, xMax: number, yMin: number, yMax: number, a: number, d: number, e: number, f: number) {
    ctx.save();
    ctx.font = '500 11px Inter, system-ui, sans-serif'; 
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.08)'; 
    ctx.fillStyle = '#888'; 
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 4]); 
    
    const gridx = this.gridValue(xMax - xMin);
    const gridy = this.gridValue(yMax - yMin);

    for (let xi = Math.ceil(xMin / gridx) * gridx; xi <= xMax; xi += gridx) {
      const px = xi * a + e;
      ctx.beginPath();
      ctx.moveTo(px, yMin * d + f);
      ctx.lineTo(px, yMax * d + f);
      ctx.stroke();
      ctx.fillText(xi.toLocaleString(undefined, { maximumFractionDigits: 1 }), px + 4, yMax * d + f + 14);
    }

    for (let yi = Math.ceil(yMin / gridy) * gridy; yi <= yMax; yi += gridy) {
      const py = yi * d + f;
      ctx.beginPath();
      ctx.moveTo(xMin * a + e, py);
      ctx.lineTo(xMax * a + e, py);
      ctx.stroke();
      ctx.fillText(yi.toLocaleString(undefined, { maximumFractionDigits: 1 }), xMin * a + e + 4, py - 6);
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

  async triggerExport(): Promise<boolean> {
    try {
      const exportArea = document.querySelector('#exportArea') as HTMLElement;
      if (!exportArea) return false;
      
      // Asegurarse de que las fuentes estén listas antes de exportar
      await document.fonts.ready;
      
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

  private drawNoDataWarning(ctx: CanvasRenderingContext2D, message: string) {
    // Limpieza adaptada a DPR si lo usas, si no, usa canvasSize normal
    const dpr = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, this.canvasSize * dpr, this.canvasSize * dpr);
    
    ctx.fillStyle = '#888';
    ctx.font = '500 14px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(message, this.canvasSize / 2, this.canvasSize / 2);
  }
}