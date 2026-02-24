import { CUSTOM_ELEMENTS_SCHEMA, ChangeDetectorRef, Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { Subject } from 'rxjs';
import { PartialSpeed } from '../../globald';
import { FunctionsService } from '../services/functions.service';
import { ReferenceService } from '../services/reference.service';
import { PresentService } from '../services/present.service';
import { register } from 'swiper/element/bundle';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import * as htmlToImage from 'html-to-image';
import { IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SwiperOptions } from 'swiper/types';

// IMPORTAMOS EL NUEVO COMPONENTE HIJO
import { TrackChartComponent } from '../track-chart.component'; 

register();

@Component({
  selector: 'app-canvas',
  templateUrl: './canvas.component.html',
  styleUrls: ['./canvas.component.scss'],
  standalone: true,
  // AÑADIMOS EL HIJO AQUÍ
  imports: [IonicModule, CommonModule, FormsModule, TranslateModule, TrackChartComponent],
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class CanvasComponent implements OnInit, OnDestroy {

  activeIndex = 0;
  partialSpeeds: PartialSpeed[] = [];
  canRenderSwiper: boolean = true;
  private destroy$ = new Subject<void>();

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
  ) {}

  async ngOnInit() {
    // Calculamos las velocidades parciales al inicio si hay track de referencia
    if (this.reference.archivedTrack) {
      this.partialSpeeds = await this.fs.computePartialSpeeds(this.reference.archivedTrack);
    }
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
    this.destroy$.next();
  }

  ionViewWillEnter() {
    this.canRenderSwiper = true;
  }

  async ionViewDidEnter() {
    this.canRenderSwiper = true;
    this.cdr.detectChanges(); 
    
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
}