import { Component, ElementRef, Input, OnChanges, ViewChild, AfterViewInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { Track, Data } from '../globald'; 
import { GeoMathService } from './services/geo-math.service';

@Component({
  selector: 'app-track-chart',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  template: `
    <div class="canvas-container" #container>
      <h1 class="title">
        {{ title | translate }} 
        <span *ngIf="unit">({{ unit }})</span>
      </h1>
      
      <div class="canvas-wrapper">
        <canvas #chartCanvas></canvas>
        <div *ngIf="noData" class="no-data-overlay">
          {{ 'CANVAS.NO_TIME_DATA' | translate }}
        </div>
      </div>
    </div>
  `,
  styles: [`
    /* --- CSS ESPECÍFICO DEL GRÁFICO (Movido desde canvas.component.scss) --- */
    .canvas-container {
      background: transparent;
      margin-bottom: 30px;
      padding: 0; 
      width: 100%;
    }
    .title {
      font-size: 0.85rem;
      font-weight: 700;
      color: #666;
      margin: 0 0 12px 20px; 
      text-transform: uppercase;
      letter-spacing: 1px;
      border-left: 3px solid var(--ion-color-primary);
      padding-left: 10px;
    }
    .canvas-wrapper {
      width: 100%;
      display: flex;
      justify-content: center;
      background: #ffffff;
      padding: 0;
      box-sizing: border-box; 
      position: relative;
    }
    canvas {
      width: 100% !important; 
      height: auto !important;
      aspect-ratio: 1 / 1; 
      display: block;
    }
    .no-data-overlay {
      position: absolute;
      top: 0; left: 0; right: 0; bottom: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(255, 255, 255, 0.9);
      color: #888;
      font-weight: 500;
      font-size: 14px;
      z-index: 10;
    }
  `]
})
export class TrackChartComponent implements OnChanges, AfterViewInit, OnDestroy {
  @Input() track!: Track | null | undefined;
  @Input() property!: keyof Data; // 'compAltitude' o 'compSpeed'
  @Input() title!: string;
  @Input() mode: 'x' | 't' = 'x'; // 'x' para distancia, 't' para tiempo
  @Input() markerPosition?: number | null;
  @Input() updateTrigger: number = 0;
  
  @ViewChild('chartCanvas') canvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('container') containerRef!: ElementRef<HTMLDivElement>;

  unit: string = '';
  noData: boolean = false;
  private resizeObserver!: ResizeObserver;
  margin: number = 25;

  constructor(
    private geoMath: GeoMathService
  ) {}

  ngAfterViewInit() {
    this.resizeObserver = new ResizeObserver(() => this.draw());
    this.resizeObserver.observe(this.containerRef.nativeElement);
  }

  ngOnChanges() {
    this.draw();
  }

  ngOnDestroy() {
    if (this.resizeObserver) this.resizeObserver.disconnect();
  }

  // --- MATEMÁTICAS PURAS Y DIBUJO ---
  private async draw() {
    if (!this.track || !this.canvasRef || !this.containerRef) return;

    const data = this.track.features?.[0]?.geometry?.properties?.data;
    if (!data || data.length === 0) return;

    const hasTime = data[0]?.time > 0 || data[1]?.time > 0;
    
    // Si piden velocidad (por tiempo) pero no hay tiempo, abortamos
    if (this.mode === 't' && !hasTime) {
      this.noData = true;
      return;
    }
    this.noData = false;

    // Asegurar que las distancias estén calculadas si usamos el eje X
    if (this.mode === 'x') {
      this.ensureDistancesCalculated(this.track, data);
    }

    const canvas = this.canvasRef.nativeElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const wrapper = this.containerRef.nativeElement.querySelector('.canvas-wrapper') as HTMLElement;
    const size = wrapper.clientWidth;
    const dpr = window.devicePixelRatio || 1;

    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, size * dpr, size * dpr);
    ctx.scale(dpr, dpr);

    const num = data.length;
    let xDiv = 1;
    let xTot: number;

    if (this.mode === 'x') {
      xTot = data[num - 1].distance;
    } else {
      const timeDiff = data[num - 1].time - data[0].time;
      if (timeDiff > 3600000) { this.unit = 'h'; xDiv = 3600000; }
      else if (timeDiff > 60000) { this.unit = 'min'; xDiv = 60000; }
      else { this.unit = 's'; xDiv = 1000; }
      xTot = timeDiff / xDiv;
    }

    if (xTot <= 0.0001) xTot = 0.0001;

    const bounds = await this.geoMath.computeMinMaxProperty(data, this.property);
    if (bounds.max === bounds.min) { bounds.max += 2; bounds.min -= 2; }

    const availSize = size - 2 * this.margin;
    const scaleX = availSize / xTot;
    
    const paddingY = (bounds.max - bounds.min) * 0.05; 
    const scaleY = availSize / ((bounds.min - paddingY) - (bounds.max + paddingY)); 
    const offsetX = this.margin;
    const offsetY = this.margin - (bounds.max + paddingY) * scaleY; 
    
    const startTime = data[0].time;
    const isSpeedPlot = this.property === 'compSpeed' || this.property === 'speed';
    const mainColor = isSpeedPlot ? '0, 191, 255' : '255, 215, 0';

    ctx.beginPath();
    const startYPixel = bounds.min * scaleY + offsetY;
    ctx.moveTo(offsetX, startYPixel);

    for (let i = 0; i < num; i++) {
      const p = data[i];
      const valX = this.mode === 'x' ? p.distance : (p.time - startTime) / xDiv;
      const px = (isNaN(valX) ? 0 : valX) * scaleX + offsetX;
      const py = (p[this.property] as number) * scaleY + offsetY;
      ctx.lineTo(px, py);
    }

    const endXPixel = xTot * scaleX + offsetX;
    ctx.lineTo(endXPixel, startYPixel);
    ctx.closePath();

    const fillGradient = ctx.createLinearGradient(0, this.margin, 0, startYPixel);
    fillGradient.addColorStop(0, `rgba(${mainColor}, 0.6)`);
    fillGradient.addColorStop(0.5, `rgba(${mainColor}, 0.2)`);
    fillGradient.addColorStop(1, `rgba(${mainColor}, 0.01)`);
    ctx.fillStyle = fillGradient;
    ctx.fill();

    ctx.beginPath();
    const firstValX = this.mode === 'x' ? data[0].distance : 0;
    ctx.moveTo(firstValX * scaleX + offsetX, (data[0][this.property] as number) * scaleY + offsetY);

    for (let i = 1; i < num; i++) {
      const p = data[i];
      const valX = this.mode === 'x' ? p.distance : (p.time - startTime) / xDiv;
      const px = (isNaN(valX) ? 0 : valX) * scaleX + offsetX;
      const py = (p[this.property] as number) * scaleY + offsetY;
      ctx.lineTo(px, py);
    }

    ctx.lineWidth = 2; 
    ctx.strokeStyle = `rgba(${mainColor}, 1)`;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();

    await this.grid(ctx, 0, xTot, bounds.min, bounds.max, scaleX, scaleY, offsetX, offsetY);
    
    // 2. DIBUJAR LA LÍNEA AZUL
    if (this.mode === 'x' && this.markerPosition != null) {
      const markerX = this.markerPosition * scaleX + offsetX;
      const topY = bounds.max * scaleY + offsetY; // Parte superior del gráfico
      const bottomY = bounds.min * scaleY + offsetY; // Parte inferior del gráfico

      // Asegurarnos de que el marcador está dentro de los límites del track
      if (markerX >= offsetX && markerX <= xTot * scaleX + offsetX) {
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(markerX, topY);
        ctx.lineTo(markerX, bottomY);
        
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#3880ff'; // Color azul (primary de Ionic)
        
        // Opcional: Hacer la línea discontinua
        // ctx.setLineDash([4, 4]); 
        
        ctx.stroke();

        // Opcional: Un pequeño círculo en la base de la línea
        ctx.beginPath();
        ctx.arc(markerX, bottomY, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#3880ff';
        ctx.fill();
        
        ctx.restore();
      }
    }
  }

  private ensureDistancesCalculated(track: Track, data: Data[]) {
    const num = data.length;
    if (num > 1 && data[num - 1].distance === 0) {
        const coords = track.features[0].geometry.coordinates as number[][];
        if (!coords || coords.length !== num) return; 
        let totalDist = 0;
        data[0].distance = 0; 
        for (let k = 1; k < num; k++) {
            const d = this.geoMath.quickDistance(coords[k-1][0], coords[k-1][1], coords[k][0], coords[k][1]);
            totalDist += d;
            data[k].distance = totalDist;
        }
    }
  }

  private async grid(ctx: CanvasRenderingContext2D, xMin: number, xMax: number, yMin: number, yMax: number, a: number, d: number, e: number, f: number) {
    ctx.save();
    ctx.font = '500 11px Inter, system-ui, sans-serif'; 
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.08)'; 
    ctx.fillStyle = '#888'; 
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 4]); 
    
    const targetDivisionsX = 5; 
    const targetDivisionsY = 4;
    const gridx = this.calculateStep(xMax - xMin, targetDivisionsX);
    const gridy = this.calculateStep(yMax - yMin, targetDivisionsY);

    ctx.textAlign = 'center'; 
    ctx.textBaseline = 'top'; 
    for (let xi = Math.ceil(xMin / gridx) * gridx; xi <= xMax; xi += gridx) {
      const px = xi * a + e;
      ctx.beginPath();
      ctx.moveTo(px, yMin * d + f);
      ctx.lineTo(px, yMax * d + f);
      ctx.stroke();
      const label = Number.isInteger(xi) ? xi.toString() : xi.toFixed(1);
      ctx.fillText(label, px, (yMax * d + f) + 6); 
    }

    ctx.textAlign = 'left'; 
    ctx.textBaseline = 'bottom'; 
    for (let yi = Math.ceil(yMin / gridy) * gridy; yi <= yMax; yi += gridy) {
      const py = yi * d + f;
      ctx.beginPath();
      ctx.moveTo(xMin * a + e, py);
      ctx.lineTo(xMax * a + e, py);
      ctx.stroke();
      const label = Number.isInteger(yi) ? yi.toString() : yi.toFixed(1);
      ctx.fillText(label, (xMin * a + e) + 4, py - 4); 
    }
    ctx.restore();
  }

  private calculateStep(range: number, targetTicks: number): number {
    const rawStep = range / targetTicks;
    const mag = Math.floor(Math.log10(rawStep));
    const magPow = Math.pow(10, mag);
    const msd = rawStep / magPow;
    let step;
    if (msd > 5.0) step = 10 * magPow;
    else if (msd > 2.0) step = 5 * magPow;
    else if (msd > 1.0) step = 2 * magPow;
    else step = magPow;
    return step;
  }
}