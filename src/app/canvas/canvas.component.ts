import {AfterViewInit, ChangeDetectorRef, Component, ElementRef, OnDestroy, OnInit, ViewChild, NgZone, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ModalController } from '@ionic/angular/standalone';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { Subject } from 'rxjs';
import { takeUntil, filter, throttleTime, delay } from 'rxjs/operators';
import { Capacitor } from '@capacitor/core';
import { IONIC_COMPONENTS, ANGULAR_COMMON } from '../ionic-imports';

// --- CUSTOM IMPORTS ---
import { PartialSpeed } from '../../globald';
import { FunctionsService } from '../services/functions.service';
import { GeoMathService } from '../services/geo-math.service';
import { TrackAnalyticsService } from '../services/track-analytics.service';
import { ReferenceService } from '../services/reference.service';
import { PresentService } from '../services/present.service';
import { LocationManagerService } from '../services/location-manager.service';
import { AppStateService } from '../services/appState.service'; 
import { PhotoViewerComponent } from '../photo-viewer.component'; 
import { TrackChartComponent } from '../track-chart.component'; 

@Component({
  selector: 'app-canvas',
  templateUrl: './canvas.component.html',
  styleUrls: ['./canvas.component.scss'],
  standalone: true,
  imports: [
    FormsModule, 
    TranslateModule, 
    TrackChartComponent,
    ...IONIC_COMPONENTS,
    ...ANGULAR_COMMON
  ],
  // ❌ NADA DE CUSTOM_ELEMENTS_SCHEMA
  changeDetection: ChangeDetectionStrategy.OnPush // O Eager si lo prefieres
})
export class CanvasComponent implements OnInit, OnDestroy, AfterViewInit {

  // ====================================================================
  // 1. ESTADO Y VARIABLES
  // ====================================================================
  private destroy$ = new Subject<void>();
  
  public activeIndex = 0;
  public partialSpeeds: PartialSpeed[] = [];
  public canRenderSwiper: boolean = true;
  public chartUpdateTrigger: number = 0;

  // 👈 Referencia al contenedor nativo en lugar de Swiper
  @ViewChild('carouselRef') carouselRef!: ElementRef<HTMLDivElement>;

  // ====================================================================
  // 2. GETTERS
  // ====================================================================
  get activeTrack() {
    return this.present.currentTrack || this.reference.archivedTrack;
  }

  get currentTrackPhotos(): string[] {
    const waypoints = this.present.currentTrack?.features?.[0]?.waypoints;
    return waypoints?.flatMap((wp: any) => wp.photos || []) || [];
  }

  get referenceTrackPhotos(): string[] {
    const waypoints = this.reference.archivedTrack?.features?.[0]?.waypoints;
    return waypoints?.flatMap((wp: any) => wp.photos || []) || [];
  }

  get availableSlides() {
    const slides = [];
    if (this.present.currentTrack) {
      slides.push({ id: 'current', label: 'CANVAS.PAG1' });
    }
    if (this.reference.archivedTrack) {
      slides.push({ id: 'ref-data', label: 'CANVAS.PAG2' });
      slides.push({ id: 'ref-partials', label: 'CANVAS.PAG3' });
    }
    return slides;
  }
  
  // ====================================================================
  // 3. CONSTRUCTOR
  // ====================================================================
  constructor(
    public fs: FunctionsService,
    private translate: TranslateService,
    public reference: ReferenceService,
    public present: PresentService,
    private cdr: ChangeDetectorRef,
    private modalCtrl: ModalController,
    public geoMath: GeoMathService,
    private analytics: TrackAnalyticsService,
    private appState: AppStateService,
    private location: LocationManagerService,
    private zone: NgZone,
  ) {}

  // ====================================================================
  // 4. CICLO DE VIDA (Lifecycle)
  // ====================================================================
  async ngOnInit() {
    await this.forceUpdate('ngOnInit');

    this.appState.onEnterForeground$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        setTimeout(() => this.forceUpdate('Vuelta de Background'), 1000);
      });

    this.location.latestLocation$
      .pipe(
        takeUntil(this.destroy$),
        filter(loc => !!loc), 
        filter(() => this.appState.currentForegroundValue && this.canRenderSwiper),
        delay(500), 
        throttleTime(30000, undefined, { leading: true, trailing: true }) 
      )
      .subscribe(() => this.forceUpdate('GPS Throttled'));

    this.location.state$
      .pipe(
        takeUntil(this.destroy$),
        filter(state => state === 'stopped')
      )
      .subscribe(() => this.forceUpdate('Ruta Finalizada'));
  }

  ngOnDestroy() {
    this.canRenderSwiper = false;
    this.destroy$.next();
    this.destroy$.complete();

    if (this.carouselRef) {
      this.carouselRef.nativeElement.removeEventListener('scroll', this.onScrollNative.bind(this));
    }
  }

  ionViewWillEnter() { this.canRenderSwiper = true; }
  ionViewWillLeave() { this.canRenderSwiper = false; }

  async ionViewDidEnter() {
    this.canRenderSwiper = true;
    await this.forceUpdate('Entrando a Pestaña (ionViewDidEnter)');
  }

  // ====================================================================
  // 5. LÓGICA PRINCIPAL Y UI
  // ====================================================================
  private async forceUpdate(reason: string) {
    // Salimos si no hay ninguna de las dos rutas
    if (!this.activeTrack) return;
    
    this.chartUpdateTrigger++; 
    
    // SOLUCIÓN: Calculamos los parciales estrictamente sobre la ruta archivada
    if (this.reference.archivedTrack) {
      this.partialSpeeds = this.analytics.computePartialSpeeds(this.reference.archivedTrack);
    } else {
      this.partialSpeeds = [];
    }
    
    this.zone.run(() => this.cdr.detectChanges());
  }

  // 👈 Función adaptada al scroll nativo
  moveToSlide(index: number) {
    this.activeIndex = index; 
    if (this.carouselRef) {
      const container = this.carouselRef.nativeElement;
      container.scrollTo({
        left: index * container.clientWidth,
        behavior: 'smooth'
      });
    }
  }

  // 👈 Detecta el arrastre manual con el dedo
  onScroll(event: Event) {
    const container = event.target as HTMLDivElement;
    const slideIndex = Math.round(container.scrollLeft / container.clientWidth);
    
    if (this.activeIndex !== slideIndex) {
      this.activeIndex = slideIndex;
      this.cdr.detectChanges(); 
    }
  }

  // ====================================================================
  // 6. GESTIÓN DE FOTOS
  // ====================================================================
  getCoverPhotoUrl(photoUri: string): string {
    return photoUri ? Capacitor.convertFileSrc(photoUri) : '';
  }

  async openPhotoGallery(type: 'current' | 'reference') {
    let photos: string[] = [];
    
    if (type === 'current') {
      photos = this.currentTrackPhotos;
    } else if (type === 'reference') {
      photos = this.referenceTrackPhotos;
    }
    
    if (photos.length === 0) return;

    const modal = await this.modalCtrl.create({
      component: PhotoViewerComponent,
      componentProps: { photos: photos }
    });
    await modal.present();
  }

  ngAfterViewInit() {
    // Suscribimos el evento fuera de Angular para no saturar la detección de cambios
    this.zone.runOutsideAngular(() => {
      if (this.carouselRef) {
        this.carouselRef.nativeElement.addEventListener('scroll', this.onScrollNative.bind(this), { passive: true });
      }
    });
  }

  private onScrollNative(event: Event) {
    const container = event.target as HTMLDivElement;
    const slideIndex = Math.round(container.scrollLeft / container.clientWidth);
    
    if (this.activeIndex !== slideIndex) {
      // Solo volvemos a entrar a Angular si el índice realmente ha cambiado
      this.zone.run(() => {
        this.activeIndex = slideIndex;
        this.cdr.detectChanges(); 
      });
    }
  }
}