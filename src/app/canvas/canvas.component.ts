import { CUSTOM_ELEMENTS_SCHEMA, ChangeDetectorRef, Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { Subject } from 'rxjs';
import { PartialSpeed } from '../../globald';
import { FunctionsService } from '../services/functions.service';
import { GeoMathService } from '../services/geo-math.service';
import { ReferenceService } from '../services/reference.service';
import { PresentService } from '../services/present.service';
import { LocationManagerService } from '../services/location-manager.service';
import { register } from 'swiper/element/bundle';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import * as htmlToImage from 'html-to-image';
import { IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SwiperOptions } from 'swiper/types';
import { Capacitor } from '@capacitor/core';
import { ModalController } from '@ionic/angular';
import { PhotoViewerComponent } from '../photo-viewer.component'; 
import { AppStateService } from '../services/appState.service'; 
import { takeUntil, filter, throttleTime, delay } from 'rxjs/operators';
import { TrackChartComponent } from '../track-chart.component'; 
import { NgZone } from '@angular/core';

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

  get activeTrack() {
    return this.present.currentTrack || this.reference.archivedTrack;
  }

  get trackPhotos(): string[] {
    const track = this.activeTrack;
    if (!track?.features[0]?.waypoints) return [];
    
    let allPhotos: string[] = [];
    for (const wp of track.features[0].waypoints) {
      if (wp.photos && wp.photos.length > 0) {
        allPhotos = [...allPhotos, ...wp.photos];
      }
    }
    return allPhotos;
  }

  activeIndex = 0;
  partialSpeeds: PartialSpeed[] = [];
  canRenderSwiper: boolean = true;
  private destroy$ = new Subject<void>();
  chartUpdateTrigger: number = 0;

  @ViewChild('swiperRef') swiperRef!: ElementRef;
  swiperParams: SwiperOptions = {
    pagination: false, 
    initialSlide: 0,
    speed: 400,
  };

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
    private zone: NgZone
  ) {}

  // ====================================================================
  // 🚀 NUEVA FUNCIÓN MAESTRA: Actualiza los gráficos desde cualquier sitio
  // ====================================================================
  private async forceUpdate(reason: string) {
    if (!this.activeTrack) return;
    
    // Sumamos 1. Esto obligará al TrackChartComponent a ejecutar ngOnChanges
    this.chartUpdateTrigger++; // 👈 🚀 AÑADE ESTO
    
    this.partialSpeeds = await this.geoMath.computePartialSpeeds(this.activeTrack);
    
    this.zone.run(() => {
      this.cdr.detectChanges();
    });
  }
  
  async ngOnInit() {
    // 1. Cálculo inicial
    await this.forceUpdate('ngOnInit');

    // 2. Al volver de segundo plano (Foreground) -> Forzar actualización
    this.appState.onEnterForeground$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        // Le damos 1 segundo al plugin nativo para que "escupa" los puntos
        // guardados en background antes de pedirle a Angular que recalcule.
        setTimeout(() => this.forceUpdate('Vuelta de Background'), 1000);
      });

    // 3. Actualizar con el latido del GPS
    this.location.latestLocation$
      .pipe(
        takeUntil(this.destroy$),
        filter(loc => !!loc), 
        filter(() => this.appState.currentForegroundValue && this.canRenderSwiper),
        // 🚀 CLAVE: Esperamos medio segundo. Le damos tiempo a Tab1Page 
        // para que coja el punto y lo guarde dentro de currentTrack.
        delay(500), 
        throttleTime(30000, undefined, { leading: true, trailing: true }) 
      )
      .subscribe(() => {
        this.forceUpdate('GPS Throttled (Con Retraso)');
      });

    // 4. Actualizar de forma forzosa cuando se pulsa STOP
    this.location.state$
      .pipe(
        takeUntil(this.destroy$),
        filter(state => state === 'stopped')
      )
      .subscribe(() => {
        this.forceUpdate('Ruta Finalizada');
      });
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

  ngOnDestroy() {
    this.canRenderSwiper = false;
    this.destroy$.next();
    this.destroy$.complete();
  }

  ionViewWillLeave() {
    this.canRenderSwiper = false;
  }

  ionViewWillEnter() {
    this.canRenderSwiper = true;
  }

  async ionViewDidEnter() {
    this.canRenderSwiper = true;
    
    // 🚀 VITAL PARA IONIC: Si el usuario se fue al Mapa y vuelve, 
    // ngOnInit NO salta de nuevo, pero esto sí. Actualizamos la gráfica al instante.
    await this.forceUpdate('Entrando a Pestaña (ionViewDidEnter)');
    
    if (this.swiperRef?.nativeElement) {
      Object.assign(this.swiperRef.nativeElement, this.swiperParams);
      this.swiperRef.nativeElement.initialize();
    }

    if (this.fs.buildTrackImage) {
      setTimeout(async () => {
        const success = await this.triggerExport();
        this.fs.buildTrackImage = false;
        if (success) this.fs.gotoPage('archive');
      }, 800); 
    }
  }

  async triggerExport(): Promise<boolean> {
    try {
      const exportArea = document.querySelector('#exportArea') as HTMLElement;
      if (!exportArea) return false;
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

  getCoverPhotoUrl(photoUri: string): string {
    if (!photoUri) return '';
    return Capacitor.convertFileSrc(photoUri);
  }

  async openPhotoGallery() {
    const photos = this.trackPhotos;
    if (photos.length === 0) return;

    const modal = await this.modalCtrl.create({
      component: PhotoViewerComponent,
      componentProps: {
        photos: photos 
      }
    });

    await modal.present();
  }
}