import {
  Component,
  ChangeDetectorRef,
  inject,
  OnInit,
  OnDestroy,
} from '@angular/core';
import { DecimalPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  IonicModule,
  PopoverController,
  LoadingController,
} from '@ionic/angular';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { Subscription } from 'rxjs';

// OpenLayers
import Point from 'ol/geom/Point';
import LineString from 'ol/geom/LineString';

// Servicios
import { FunctionsService } from './services/functions.service';
import { GeographyService } from './services/geography.service';
import { LocationManagerService } from './services/location-manager.service';
import { PresentService } from './services/present.service';
import { StylerService } from './services/styler.service';
import { MapService } from './services/map.service';
import { PhotoService } from './services/photo.service';
import { SaveTrackPopover } from './save-track-popover.component';
import { SnapToTrailService } from './services/snapToTrail.service';
import { GeoMathService } from './services/geo-math.service';
import { SmartRouteBuilderService } from './services/smart-route-builder.service';

@Component({
  standalone: true,
  selector: 'app-record-popover',
  imports: [IonicModule, FormsModule, TranslateModule],
  providers: [DecimalPipe, DatePipe],
  template: `
    <ion-popover
      [isOpen]="present.isRecordPopoverOpen"
      (didDismiss)="present.isRecordPopoverOpen = false"
      backdropDismiss="false"
      class="floating-popover"
    >
      <ng-template>
        <div class="popover-island">
          <div class="button-grid">
            
            <button
              class="nav-item-btn enabled primary-btn-style"
              (click)="setTrackDetails(); closeAllPopovers()"
            >
              <ion-icon name="save-outline" class="primary-icon"></ion-icon>
              <p>{{ 'RECORD.SAVE_TRACK' | translate }}</p>
            </button>

            <button
              class="nav-item-btn danger-btn-style"
              (click)="
                present.isConfirmDeletionOpen = true;
                present.isRecordPopoverOpen = false
              "
            >
              <ion-icon name="trash-outline" class="danger-icon"></ion-icon>
              <p>{{ 'RECORD.REMOVE' | translate }}</p>
            </button>

          </div>
        </div>
      </ng-template>
    </ion-popover>

    <ion-popover
      [isOpen]="present.isConfirmStopOpen"
      (didDismiss)="cancelStop()"
      class="confirm-popover"
    >
      <ng-template>
        <div class="popover-island confirm-box">
          <p class="confirm-title">{{ 'RECORD.CONFIRM_STOP' | translate }}</p>
          <div class="button-grid horizontal">
            <button class="nav-item-btn green-pill" (click)="confirmStop()">
              <ion-icon name="checkmark-circle-outline"></ion-icon>
              <p>{{ 'RECORD.DELETE_YES' | translate }}</p>
            </button>
            <button class="nav-item-btn red-pill" (click)="cancelStop()">
              <ion-icon name="close-circle-outline"></ion-icon>
              <p>{{ 'RECORD.DELETE_NO' | translate }}</p>
            </button>
          </div>
        </div>
      </ng-template>
    </ion-popover>

    <ion-popover
      [isOpen]="present.isConfirmDeletionOpen"
      (didDismiss)="cancelDelete()"
      class="confirm-popover"
    >
      <ng-template>
        <div class="popover-island confirm-box">
          <p class="confirm-title">
            {{ 'RECORD.CONFIRM_DELETION' | translate }}
          </p>
          <div class="button-grid horizontal">
            <button class="nav-item-btn green-pill" (click)="confirmDelete()">
              <ion-icon name="checkmark-circle-outline"></ion-icon>
              <p>{{ 'RECORD.DELETE_YES' | translate }}</p>
            </button>
            <button class="nav-item-btn red-pill" (click)="cancelDelete()">
              <ion-icon name="close-circle-outline"></ion-icon>
              <p>{{ 'RECORD.DELETE_NO' | translate }}</p>
            </button>
          </div>
        </div>
      </ng-template>
    </ion-popover>
  `,
  styles: [
    `
      .popover-island {
        padding: 16px 10px;
      }
      .button-grid {
        display: flex;
        justify-content: space-around;
        align-items: center;
        gap: 5px;
      }
      .button-grid.horizontal {
        justify-content: center;
        gap: 40px;
      }
      
      /* Colores para iconos principales */
      .primary-icon { color: var(--ion-color-primary, #3880ff) !important; }
      .danger-icon { color: var(--ion-color-danger, #eb445a) !important; }
      
      /* Ajuste de color para el texto de los botones principales */
      .primary-btn-style p { color: var(--ion-color-primary, #3880ff) !important; }
      .danger-btn-style p { color: var(--ion-color-danger, #eb445a) !important; }

      /* Estilos para los botones de SI/NO en confirmaciones (icono + texto) */
      .green-pill ion-icon, .green-pill p {
        color: var(--ion-color-success, #2dd36f) !important;
      }
      .red-pill ion-icon, .red-pill p {
        color: var(--ion-color-danger, #eb445a) !important;
      }

      /* Animación de pulso para el botón activo */
      .enabled ion-icon {
        animation: pulse 2s infinite;
      }

      @keyframes pulse {
        0% { transform: scale(1); }
        50% { transform: scale(1.1); }
        100% { transform: scale(1); }
      }
    `,
  ],
})
export class RecordPopoverComponent implements OnInit, OnDestroy {
  // ==========================================================================
  // 1. PROPIEDADES E INYECCIONES
  // ==========================================================================

  public fs = inject(FunctionsService);
  public geography = inject(GeographyService);
  public location = inject(LocationManagerService);
  public present = inject(PresentService);
  public stylerService = inject(StylerService);
  private translate = inject(TranslateService);
  private popoverController = inject(PopoverController);
  private cd = inject(ChangeDetectorRef);
  private mapService = inject(MapService);
  private photo = inject(PhotoService);
  public snapToTrailService = inject(SnapToTrailService);
  private geoMath = inject(GeoMathService);
  public smartRouteBuilder = inject(SmartRouteBuilderService);
  private loadingCtrl = inject(LoadingController);

  public loading = false;
  private subscription?: Subscription;

  private isProcessingStop = false;
  private isProcessingDelete = false;

  // ==========================================================================
  // 2. CICLO DE VIDA
  // ==========================================================================

  ngOnInit() {}

  ngOnDestroy() {
    this.subscription?.unsubscribe();
  }

  // ==========================================================================
  // 3. FLUJO DE CONTROL DE POPOVERS (UI)
  // ==========================================================================

  closeAllPopovers() {
    this.present.isRecordPopoverOpen = false;
    this.present.isConfirmStopOpen = false;
    this.present.isConfirmDeletionOpen = false;
  }

  // --------------------------------------------------------------------------
  // A. Gestión de parada (Stop)
  // --------------------------------------------------------------------------

  async confirmStop() {
    this.isProcessingStop = true;
    this.present.isConfirmStopOpen = false;

    try {
      await this.stopTracking();
    } catch (error) {
      console.error('Error al detener track:', error);
    }
  }

  cancelStop() {
    if (this.isProcessingStop) {
      this.isProcessingStop = false;
      return;
    }
    this.present.isConfirmStopOpen = false;
  }

  // --------------------------------------------------------------------------
  // B. Gestión de borrado (Delete)
  // --------------------------------------------------------------------------

  async confirmDelete() {
    this.isProcessingDelete = true;
    this.present.isConfirmDeletionOpen = false;

    try {
      await this.deleteTrack();
    } catch (error) {
      console.error('Error al borrar track:', error);
    }
  }

  cancelDelete() {
    if (this.isProcessingDelete) {
      this.isProcessingDelete = false;
      return;
    }
    this.present.isConfirmDeletionOpen = false;
    this.present.isRecordPopoverOpen = true;
  }

  // ==========================================================================
  // 4. ACCIONES DE GRABACIÓN (Core)
  // ==========================================================================

  async deleteTrack() {
    this.location.state = 'inactive';

    this.present.currentTrack = undefined;
    this.geography.currentLayer?.getSource()?.clear();
    await this.photo.discardSessionPhotos();
    this.fs.displayToast(
      this.translate.instant('MAP.CURRENT_TRACK_DELETED'),
      'success'
    );
  }

  async stopTracking(): Promise<void> {
    this.location.state = 'stopped';

    this.subscription?.unsubscribe();
    const source = this.geography.currentLayer?.getSource();

    if (!source || !this.present.currentTrack || !this.geography.map) return;

    const coordinates =
      this.present.currentTrack.features?.[0]?.geometry?.coordinates;
    if (!Array.isArray(coordinates) || coordinates.length === 0) {
      this.fs.displayToast(
        this.translate.instant('MAP.TRACK_EMPTY'),
        'warning'
      );
      return;
    }

    const features = source.getFeatures();
    const routeLine = features.find((f) => f.get('type') === 'route_line');
    const startPin = features.find((f) => f.get('type') === 'start_pin');
    const endPin = features.find((f) => f.get('type') === 'end_pin');

    if (routeLine) {
      routeLine.setGeometry(new LineString(coordinates));
      routeLine.setStyle(
        this.stylerService.setStrokeStyle(this.present.currentColor)
      );
    }
    if (startPin) {
      startPin.setGeometry(new Point(coordinates[0]));
      startPin.setStyle(this.stylerService.createPinStyle('green'));
    }
    if (endPin) {
      endPin.setGeometry(new Point(coordinates[coordinates.length - 1]));
      endPin.setStyle(this.stylerService.createPinStyle('red'));
    }

    await this.geography.setMapView(this.present.currentTrack);
    this.fs.displayToast(
      this.translate.instant('MAP.TRACK_FINISHED'),
      'success'
    );
    await this.location.sendReferenceToPlugin();

    await this.setTrackDetails();
  }

  // ==========================================================================
  // 5. PERSISTENCIA Y DETALLES DEL TRACK
  // ==========================================================================

  async setTrackDetails(ev?: any) {
    const track = this.present.currentTrack;
    let proposedTexts = { name: '', description: '' };

    if (track?.features?.[0]) {
      const loadingOverlay = await this.loadingCtrl.create({
        message: this.translate.instant('RECORD.ANALYZING_ROUTE'),
        spinner: 'crescent',
        backdropDismiss: false,
      });
      await loadingOverlay.present();

      try {
        // 🚀 Ajustado a 10 segundos
        const timeout = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('TIMEOUT_SMART_ROUTE')), 10000)
        );

        const autoTexts: any = await Promise.race([
          this.smartRouteBuilder.generateWikilocStyleTexts(track.features[0]),
          timeout
        ]);

        console.log('Textos autogenerados:', autoTexts);

        proposedTexts = { 
          name: autoTexts?.title || autoTexts?.name || '', 
          description: autoTexts?.description || '' 
        };
      } catch (err: any) {
        console.warn('⚠️ Fallo o timeout al autogenerar textos:', err.message || err);
      } finally {
        await loadingOverlay.dismiss();
      }
    }

    const popover = await this.popoverController.create({
      component: SaveTrackPopover,
      componentProps: { modalEdit: proposedTexts },
      backdropDismiss: true,
      cssClass: 'top-glass-island-wrapper',
      translucent: true,
    });

    await popover.present();
    const { data, role } = await popover.onDidDismiss();

    // 🛡️ RED DE SEGURIDAD UI
    if (role === 'cancel' || role === 'backdrop' || data?.action !== 'ok') {
      if (this.location.state === 'stopped') {
        this.present.isRecordPopoverOpen = true; 
      }
      return; 
    }

    const finalName = data.name || this.translate.instant('RECORD.DEFAULT_NAME');
    await this.saveFile(finalName, data.description);
  }

  async saveFile(name: string, description: string) {
    const track = this.present.currentTrack;
    if (!track?.features?.[0]) return;

    const loadingOverlay = await this.loadingCtrl.create({
      message: this.translate.instant('RECORD.SAVING_TRACK'),
      spinner: 'crescent',
      backdropDismiss: false,
      translucent: true,
      cssClass: 'custom-loading-save'
    });

    await loadingOverlay.present();
    this.loading = true; 

    try {
      let trackToProcess = JSON.parse(JSON.stringify(track));
      const rawCoords = trackToProcess.features[0].geometry.coordinates;

      const cleanedCoords = this.geoMath.removeGpsSpikesHybrid(rawCoords, 15);
      trackToProcess.features[0].geometry.coordinates = cleanedCoords;

      loadingOverlay.message = this.translate.instant('RECORD.APPLYING_ELEVATION');
      
      let snappedTrack;
      try {
        const trailReference = trackToProcess.features[0].geometry.coordinates.map((c: any) => ({
          lng: c[0],
          lat: c[1],
        }));

        // 🚀 Ajustado a 10 segundos para el DEM
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('TIMEOUT_OFFLINE')), 10000)
        );

        snappedTrack = await Promise.race([
          this.snapToTrailService.prepareTrackWithTrails(trackToProcess, trailReference),
          timeoutPromise
        ]);

      } catch (err) {
        console.warn('⚠️ Sin conexión o DEM muy lento. Guardando con GPS puro + EGM96.', err);
        snappedTrack = trackToProcess;
      }

      const optimizedTrack = await this.geoMath.filterSpeedAndAltitude(snappedTrack, 0);

      const finalTrack = optimizedTrack?.features?.[0]?.geometry?.coordinates?.length > 0
        ? optimizedTrack
        : trackToProcess;

      const feature = finalTrack.features[0];
      const saveDate = new Date();
      const dateKey = saveDate.toISOString();

      feature.properties.name = name;
      feature.properties.place = feature.geometry.coordinates[0];
      feature.properties.description = description;
      feature.properties.date = saveDate;

      let routePhotos: string[] = [];
      if (feature.waypoints) {
        routePhotos = feature.waypoints
          .filter((wp: any) => wp.photos?.length > 0)
          .flatMap((wp: any) => wp.photos);
      }

      await this.fs.storeSet(dateKey, finalTrack);

      const newItem: any = {
        name,
        date: saveDate,
        place: feature.properties.place,
        description,
        isChecked: false,
        photos: routePhotos,
        file: dateKey,
        distance: feature.properties.distance || 0,
        duration: feature.properties.duration || 0,
      };

      this.fs.collection.unshift(newItem);
      await this.fs.storeSet('collection', this.fs.collection);
      this.fs.collection = [...this.fs.collection];

      await this.photo.confirmSessionPhotos();
      this.fs.displayToast(this.translate.instant('MAP.SAVED'), 'success');

      this.location.state = 'inactive';
      this.present.currentTrack = undefined;
      this.geography.currentLayer?.getSource()?.clear();
      
      this.closeAllPopovers();

    } catch (e) {
      console.error('❌ Error crítico al guardar el Track:', e);
      this.fs.displayToast(this.translate.instant('RECORD.SAVE_ERROR'), 'danger');
    } finally {
      await loadingOverlay.dismiss();
      this.loading = false;
      this.cd.detectChanges();
    }
  }
}