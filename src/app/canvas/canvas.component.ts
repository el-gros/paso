import { CUSTOM_ELEMENTS_SCHEMA, ChangeDetectorRef, Component, ElementRef, OnDestroy, OnInit, ViewChild, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule, ModalController } from '@ionic/angular';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { Subject } from 'rxjs';
import { takeUntil, filter, throttleTime, delay } from 'rxjs/operators';
import { register } from 'swiper/element/bundle';
import { SwiperOptions } from 'swiper/types';
import { Capacitor } from '@capacitor/core';

// --- CUSTOM IMPORTS ---
import { PartialSpeed } from '../../globald';
import { FunctionsService } from '../services/functions.service';
import { GeoMathService } from '../services/geo-math.service';
import { ReferenceService } from '../services/reference.service';
import { PresentService } from '../services/present.service';
import { LocationManagerService } from '../services/location-manager.service';
import { AppStateService } from '../services/appState.service'; 
import { TrackExportService } from '../services/track-export.service'; // <-- AÑADIDO
import { PhotoViewerComponent } from '../photo-viewer.component'; 
import { TrackChartComponent } from '../track-chart.component'; 

register();

@Component({
  selector: 'app-canvas',
  templateUrl: './canvas.component.html',
  styleUrls: ['./canvas.component.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule, TranslateModule, TrackChartComponent],
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class CanvasComponent implements OnInit, OnDestroy {

  // ====================================================================
  // 1. ESTADO Y VARIABLES
  // ====================================================================
  private destroy$ = new Subject<void>();
  
  public activeIndex = 0;
  public partialSpeeds: PartialSpeed[] = [];
  public canRenderSwiper: boolean = true;
  public chartUpdateTrigger: number = 0;

  @ViewChild('swiperRef') swiperRef!: ElementRef;
  public swiperParams: SwiperOptions = {
    pagination: false, 
    initialSlide: 0,
    speed: 400,
  };

  // ====================================================================
  // 2. GETTERS (Optimizados)
  // ====================================================================
  get activeTrack() {
    return this.present.currentTrack || this.reference.archivedTrack;
  }

  get trackPhotos(): string[] {
    const waypoints = this.activeTrack?.features?.[0]?.waypoints;
    // 🚀 JS Moderno: flatMap extrae y aplana todas las fotos en un solo array de golpe
    return waypoints?.flatMap(wp => wp.photos || []) || [];
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
    private appState: AppStateService,
    private location: LocationManagerService,
    private zone: NgZone,
    private trackExport: TrackExportService // <-- INYECTADO
  ) {}

  // ====================================================================
  // 4. CICLO DE VIDA (Lifecycle)
  // ====================================================================
  async ngOnInit() {
    await this.forceUpdate('ngOnInit');

    // 1. Al volver de segundo plano
    this.appState.onEnterForeground$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        setTimeout(() => this.forceUpdate('Vuelta de Background'), 1000);
      });

    // 2. Actualizar con el latido del GPS
    this.location.latestLocation$
      .pipe(
        takeUntil(this.destroy$),
        filter(loc => !!loc), 
        filter(() => this.appState.currentForegroundValue && this.canRenderSwiper),
        delay(500), 
        throttleTime(30000, undefined, { leading: true, trailing: true }) 
      )
      .subscribe(() => this.forceUpdate('GPS Throttled'));

    // 3. Actualizar al hacer STOP
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
  }

  ionViewWillEnter() { this.canRenderSwiper = true; }
  ionViewWillLeave() { this.canRenderSwiper = false; }

  async ionViewDidEnter() {
    this.canRenderSwiper = true;
    
    await this.forceUpdate('Entrando a Pestaña (ionViewDidEnter)');
    
    if (this.swiperRef?.nativeElement) {
      Object.assign(this.swiperRef.nativeElement, this.swiperParams);
      this.swiperRef.nativeElement.initialize();
    }

    if (this.fs.buildTrackImage) {
      setTimeout(async () => {
        // 🚀 Delegamos la lógica nativa al servicio
        const success = await this.trackExport.generateAndSaveDataImage('exportArea');
        this.fs.buildTrackImage = false;
        if (success) this.fs.gotoPage('archive');
      }, 800); 
    }
  }

  // ====================================================================
  // 5. LÓGICA PRINCIPAL Y UI
  // ====================================================================
  private async forceUpdate(reason: string) {
    if (!this.activeTrack) return;
    
    this.chartUpdateTrigger++; 
    this.partialSpeeds = await this.geoMath.computePartialSpeeds(this.activeTrack);
    
    this.zone.run(() => this.cdr.detectChanges());
  }

  onSegmentChange(ev: any) {
    this.activeIndex = parseInt(ev.detail.value);
    this.swiperRef.nativeElement.swiper.slideTo(this.activeIndex);
  }

  moveToSlide(index: number) {
    this.activeIndex = index; 
    if (this.swiperRef?.nativeElement?.swiper) {
      this.swiperRef.nativeElement.swiper.slideTo(index);
    }
  }

  onSlideChange(ev: any) {
    const swiper = ev.detail[0];
    this.activeIndex = swiper.activeIndex;
    this.cdr.detectChanges(); 
  }

  // ====================================================================
  // 6. GESTIÓN DE FOTOS
  // ====================================================================
  getCoverPhotoUrl(photoUri: string): string {
    return photoUri ? Capacitor.convertFileSrc(photoUri) : '';
  }

  async openPhotoGallery() {
    const photos = this.trackPhotos;
    if (photos.length === 0) return;

    const modal = await this.modalCtrl.create({
      component: PhotoViewerComponent,
      componentProps: { photos: photos }
    });
    await modal.present();
  }
}