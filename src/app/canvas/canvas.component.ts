import { CUSTOM_ELEMENTS_SCHEMA, ChangeDetectorRef, Component, ElementRef, HostListener, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { firstValueFrom, Subject } from 'rxjs';
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
import { SwiperOptions } from 'swiper/types';

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
  margin: number = 25;
  canvasSize: number = 400;
  currAvailable: boolean[] = [true, true];
  archAvailable: boolean[] = [true, true];
  canRenderSwiper: boolean = true;
  
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
  @ViewChild('swiperRef') swiperRef!: ElementRef;
  swiperParams: SwiperOptions = {
    pagination: false, // Lo desactivamos aquí en lugar de en el HTML
    initialSlide: 0,
    speed: 400,
    // Cualquier otra config que necesites
  };
  activeIndex = 0;

  onSegmentChange(ev: any) {
    this.activeIndex = parseInt(ev.detail.value);
    this.swiperRef.nativeElement.swiper.slideTo(this.activeIndex);
  }

  onResize() {
    this.updateCanvasSize();
    this.refreshAllVisuals(); // Redibujar al cambiar tamaño
  }

  private updateCanvasSize() {
    // Buscamos el contenedor para saber cuánto espacio REAL tenemos
    const wrapper = document.querySelector('.canvas-wrapper') as HTMLElement;
    
    if (wrapper) {
      // Usamos clientWidth para obtener el ancho interno exacto
      this.canvasSize = wrapper.clientWidth;
    } else {
      // Fallback: Ancho ventana - margenes laterales de la card (aprox 40-50px)
      this.canvasSize = Math.min(window.innerWidth, window.innerHeight) - 48; 
    }
  }

  ngOnDestroy() {
    this.canRenderSwiper = false;
    this.destroy$.next();
    this.destroy$.complete();
  }

  ionViewWillLeave() {
    this.canRenderSwiper = false;
    this.destroy$.next();
  }

  ionViewWillEnter() {
    this.canRenderSwiper = true;
  }

  async ionViewDidEnter() {
    this.currentCtx = [undefined, undefined];
    this.archivedCtx = [undefined, undefined];
    this.canRenderSwiper = true;
    this.cdr.detectChanges(); // Renderizamos el HTML del swiper
    
    // Inicializamos manualmente
    if (this.swiperRef && this.swiperRef.nativeElement) {
      Object.assign(this.swiperRef.nativeElement, this.swiperParams);
      this.swiperRef.nativeElement.initialize();
    }

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

    const dpr = window.devicePixelRatio || 1;
    
    // 1. Tamaño visual (CSS)
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;

    // 2. Tamaño del buffer (Resolución real)
    canvas.width = size * dpr;
    canvas.height = size * dpr;

    const ctx = canvas.getContext("2d");
    if (ctx) {
      // Resetear transformaciones previas es vital
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      // Escalar para que tus coordenadas (0..size) funcionen en el buffer (0..size*dpr)
      ctx.scale(dpr, dpr); 
      ctxArray[index] = ctx;
    }
  }

  async updateAllCanvas(ctxArray: any[], track: Track, availabilityArray: boolean[]): Promise<string> {
    let lastUnit = '';
    const data = track.features?.[0]?.geometry?.properties?.data;
    if (!data || data.length === 0) return '';

    const hasTime = data[0]?.time > 0 || data[1]?.time > 0;
    
    // USANDO LA ALTERNATIVA MODERNA: firstValueFrom
    const noTimeMsg = await firstValueFrom(this.translate.get('CANVAS.NO_TIME_DATA'));

    for (let i = 0; i < this.fs.properties.length; i++) {
      const property = this.fs.properties[i] as keyof Data;
      const mode = property === 'compAltitude' ? 'x' : 't';

      if (mode === 't' && !hasTime) {
        availabilityArray[i] = false;
        if (ctxArray[i]) {
          this.drawNoDataWarning(ctxArray[i], noTimeMsg);
        }
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

    const dpr = window.devicePixelRatio || 1;

    // 1. Limpieza total usando píxeles físicos
    ctx.setTransform(1, 0, 0, 1, 0, 0); // Reseteamos a identidad física
    ctx.clearRect(0, 0, this.canvasSize * dpr, this.canvasSize * dpr);

    if (!track || !track.features[0].geometry.properties.data.length) return tUnit;

    // 2. Configuramos el entorno "Lógico" (CSS Pixels) para todo el dibujo
    ctx.scale(dpr, dpr);

    const data = track.features[0].geometry.properties.data;
    const num = data.length;

    // Llamamos al método auxiliar de reparación si es eje X
    if (xParam === 'x') {
      this.ensureDistancesCalculated(track, data);
    }

    // --- CÁLCULOS DE ESCALA ---
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
    
    // ¡NUEVO! 3. Calculamos un padding vertical del 5% para que la gráfica no choque con el techo del canvas
    const paddingY = (bounds.max - bounds.min) * 0.05; 
    
    // ¡NUEVO! 4. Ajustamos la escala Y y el offset para incluir ese padding superior e inferior
    const scaleY = availSize / ((bounds.min - paddingY) - (bounds.max + paddingY)); 
    const offsetX = this.margin;
    const offsetY = this.margin - (bounds.max + paddingY) * scaleY; 
    
    const startTime = data[0].time;

    const isSpeedPlot = propertyName === 'compSpeed' || propertyName === 'speed';
    const mainColor = isSpeedPlot ? '0, 191, 255' : '255, 215, 0';

    // --- DIBUJO DEL RELLENO (FILL) ---
    ctx.beginPath();
    
    // Punto inicial (abajo a la izquierda visualmente, anclado a bounds.min sin el padding inferior para el fill)
    const startYPixel = bounds.min * scaleY + offsetY;
    ctx.moveTo(offsetX, startYPixel);

    for (let i = 0; i < num; i++) {
      const p = data[i];
      const valX = xParam === 'x' ? p.distance : (p.time - startTime) / xDiv;
      const rawX = isNaN(valX) ? 0 : valX;
      
      const px = rawX * scaleX + offsetX;
      const py = (p[propertyName] as number) * scaleY + offsetY;
      
      ctx.lineTo(px, py);
    }

    // Cerrar forma (abajo a la derecha)
    const endXPixel = xTot * scaleX + offsetX;
    ctx.lineTo(endXPixel, startYPixel);
    ctx.closePath();

    // ¡NUEVO! 5. Gradiente ajustado. Ahora termina exactamente en la línea base de los datos (startYPixel)
    const fillGradient = ctx.createLinearGradient(0, this.margin, 0, startYPixel);
    fillGradient.addColorStop(0, `rgba(${mainColor}, 0.6)`);
    fillGradient.addColorStop(0.5, `rgba(${mainColor}, 0.2)`);
    fillGradient.addColorStop(1, `rgba(${mainColor}, 0.01)`);
    
    ctx.fillStyle = fillGradient;
    ctx.fill();

    // --- DIBUJO DE LA LÍNEA (STROKE) ---
    ctx.beginPath();
    const firstValX = xParam === 'x' ? data[0].distance : 0;
    const firstPx = firstValX * scaleX + offsetX;
    const firstPy = (data[0][propertyName] as number) * scaleY + offsetY;
    
    ctx.moveTo(firstPx, firstPy);

    for (let i = 1; i < num; i++) {
      const p = data[i];
      const valX = xParam === 'x' ? p.distance : (p.time - startTime) / xDiv;
      const rawX = isNaN(valX) ? 0 : valX;

      const px = rawX * scaleX + offsetX;
      const py = (p[propertyName] as number) * scaleY + offsetY;
      
      ctx.lineTo(px, py);
    }

    ctx.lineWidth = 2; 
    ctx.strokeStyle = `rgba(${mainColor}, 1)`;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();

    // --- GRID ---
    // Pasamos los límites reales, el grid calculará sus posiciones automáticamente
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
    
    // 1. Apuntamos a un número FIJO de divisiones (ideal para pantallas móviles)
    const targetDivisionsX = 5; 
    const targetDivisionsY = 4;

    const gridx = this.calculateStep(xMax - xMin, targetDivisionsX);
    const gridy = this.calculateStep(yMax - yMin, targetDivisionsY);

    // --- LÍNEAS VERTICALES (Eje X: Distancia o Tiempo) ---
    ctx.textAlign = 'center'; // Clave: Centra el texto geométricamente en la X
    ctx.textBaseline = 'top'; // Clave: El punto de anclaje es la parte superior del texto
    
    for (let xi = Math.ceil(xMin / gridx) * gridx; xi <= xMax; xi += gridx) {
      const px = xi * a + e;
      ctx.beginPath();
      ctx.moveTo(px, yMin * d + f);
      ctx.lineTo(px, yMax * d + f);
      ctx.stroke();
      
      // Formateo inteligente: Solo mostramos '.0' si no es un número entero
      const label = Number.isInteger(xi) ? xi.toString() : xi.toFixed(1);
      
      // Al usar textAlign='center' y baseline='top', no necesitamos sumar X. Solo bajamos la Y.
      ctx.fillText(label, px, (yMax * d + f) + 6); 
    }

    // --- LÍNEAS HORIZONTALES (Eje Y: Altitud o Velocidad) ---
    ctx.textAlign = 'left'; 
    ctx.textBaseline = 'bottom'; // Clave: El texto se "apoya" sobre la línea
    
    for (let yi = Math.ceil(yMin / gridy) * gridy; yi <= yMax; yi += gridy) {
      const py = yi * d + f;
      ctx.beginPath();
      ctx.moveTo(xMin * a + e, py);
      ctx.lineTo(xMax * a + e, py);
      ctx.stroke();
      
      const label = Number.isInteger(yi) ? yi.toString() : yi.toFixed(1);
      
      // El texto se apoya justo encima de la línea punteada (py - 4)
      ctx.fillText(label, (xMin * a + e) + 4, py - 4); 
    }
    ctx.restore();
  }

  // 2. Nuevo Algoritmo "Nice Numbers" (Números Amigables)
  calculateStep(range: number, targetTicks: number): number {
    // Calculamos el tamaño de paso ideal crudo
    const rawStep = range / targetTicks;
    
    // Obtenemos la magnitud (ej. si rawStep es 14.5, la magnitud es 10)
    const mag = Math.floor(Math.log10(rawStep));
    const magPow = Math.pow(10, mag);
    
    // Normalizamos el valor entre 1 y 10
    const msd = rawStep / magPow;
    
    // Redondeamos al número "bonito" más cercano en escalas de gráficos
    let step;
    if (msd > 5.0) step = 10 * magPow;
    else if (msd > 2.0) step = 5 * magPow;
    else if (msd > 1.0) step = 2 * magPow;
    else step = magPow;

    return step;
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

  // Función para cuando pulsas un punto
  moveToSlide(index: number) {
    this.activeIndex = index; // Actualiza visualmente inmediato
    if (this.swiperRef && this.swiperRef.nativeElement && this.swiperRef.nativeElement.swiper) {
      this.swiperRef.nativeElement.swiper.slideTo(index);
    }
  }

  // Función que escucha al Swiper (cuando deslizas con el dedo)
  onSlideChange(ev: any) {
    const swiper = ev.detail[0];
    this.activeIndex = swiper.activeIndex;
    // Esto fuerza a Angular a repintar los puntos si el cambio viene de fuera
    this.cdr.detectChanges(); 
  }

}