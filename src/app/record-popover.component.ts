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

// Opcional pero recomendado: Inyectar el motor que creamos ayer para apagarlo correctamente
// import { TrackingEngineService } from './services/tracking-engine.service';

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
              class="nav-item-btn enabled"
              (click)="setTrackDetails(); present.isRecordPopoverOpen = false"
            >
              <ion-icon name="save-sharp" class="primary-icon"></ion-icon>
              <p>{{ 'RECORD.SAVE_TRACK' | translate }}</p>
            </button>

            <button
              class="nav-item-btn"
              (click)="
                present.isConfirmDeletionOpen = true;
                present.isRecordPopoverOpen = false
              "
            >
              <ion-icon name="trash-sharp" class="primary-icon"></ion-icon>
              <p>{{ 'RECORD.REMOVE_TRACK' | translate }}</p>
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
              <ion-icon name="checkmark-sharp"></ion-icon>
              <p>{{ 'RECORD.DELETE_YES' | translate }}</p>
            </button>
            <button class="nav-item-btn red-pill" (click)="cancelStop()">
              <ion-icon name="close-sharp"></ion-icon>
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
              <ion-icon name="checkmark-sharp"></ion-icon>
              <p>{{ 'RECORD.DELETE_YES' | translate }}</p>
            </button>
            <button class="nav-item-btn red-pill" (click)="cancelDelete()">
              <ion-icon name="close-sharp"></ion-icon>
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
      .primary-icon {
        color: var(--ion-color-primary, #3880ff) !important;
      }
      .enabled ion-icon {
        animation: pulse 2s infinite;
      }
      @keyframes pulse {
        0% {
          transform: scale(1);
        }
        50% {
          transform: scale(1.1);
        }
        100% {
          transform: scale(1);
        }
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
  // private trackingEngine = inject(TrackingEngineService); // Descomentar si decides parar el motor aquí

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
    this.isProcessingStop = true; // 1. Ponemos el candado
    this.present.isConfirmStopOpen = false; // 2. Ocultamos popover (Inicia animación que disparará didDismiss)

    try {
      await this.stopTracking();
    } catch (error) {
      console.error('Error al detener track:', error);
    }
    // IMPORTANTE: NO ponemos finally aquí. El candado se liberará en cancelStop()
  }

  cancelStop() {
    if (this.isProcessingStop) {
      // Entra aquí si se cerró porque pulsamos SÍ.
      // Liberamos el candado y NO hacemos nada más.
      this.isProcessingStop = false;
      return;
    }
    // Entra aquí si pulsamos NO o clicamos fuera del popover.
    this.present.isConfirmStopOpen = false;
  }

  // --------------------------------------------------------------------------
  // B. Gestión de borrado (Delete)
  // --------------------------------------------------------------------------

  async confirmDelete() {
    this.isProcessingDelete = true; // 1. Ponemos el candado
    this.present.isConfirmDeletionOpen = false; // 2. Ocultamos popover (Inicia animación que disparará didDismiss)

    try {
      await this.deleteTrack();
    } catch (error) {
      console.error('Error al borrar track:', error);
    }
    // IMPORTANTE: NO ponemos finally aquí. El candado se liberará en cancelDelete()
  }

  cancelDelete() {
    if (this.isProcessingDelete) {
      // Entra aquí si se cerró porque pulsamos SÍ.
      // Liberamos el candado y NO REABRIMOS el menú anterior.
      this.isProcessingDelete = false;
      return;
    }

    // Entra aquí si pulsamos NO o clicamos fuera del popover.
    // Solo entonces reabrimos el popover principal.
    this.present.isConfirmDeletionOpen = false;
    this.present.isRecordPopoverOpen = true;
  }

  // ==========================================================================
  // 4. ACCIONES DE GRABACIÓN (Core)
  // ==========================================================================

  async deleteTrack() {
    this.location.state = 'inactive';
    // this.trackingEngine.stopEngine(); // <-- Detener el motor si aplica

    this.present.currentTrack = undefined;
    this.geography.currentLayer?.getSource()?.clear();
    await this.photo.discardSessionPhotos();
    this.fs.displayToast(
      this.translate.instant('MAP.CURRENT_TRACK_DELETED'),
      'success'
    );
  }

  /**
   * Finaliza la grabación, actualiza los pines en el mapa y
   * dispara el flujo de guardado de detalles.
   */
  async stopTracking(): Promise<void> {
    this.location.state = 'stopped';
    // this.trackingEngine.stopEngine(); // <-- Detener el motor si aplica

    this.subscription?.unsubscribe();
    const source = this.geography.currentLayer?.getSource();

    if (!source || !this.present.currentTrack || !this.geography.map) return;

    // 🚀 Corregido: Limpiamos la duplicidad de validación
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
      // 🚀 Corregido: Forma más segura y compatible de obtener el último elemento
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

  /**
   * Orquesta el análisis inteligente de la ruta y abre el popover para
   * que el usuario introduzca nombre y descripción antes de guardar.
   */
  async setTrackDetails(ev?: any) {
    const track = this.present.currentTrack;
    let proposedTexts = { name: '', description: '' };

    // 1. Si hay un track válido, autogeneramos los textos mostrando un Loading Alert
    if (track && track.features && track.features[0]) {
      // Creamos el alert de carga con la variable de traducción
      const loadingOverlay = await this.loadingCtrl.create({
        message: this.translate.instant('RECORD.ANALYZING_ROUTE'), // <-- Nueva variable
        spinner: 'crescent',
        backdropDismiss: false, // Evita que el usuario lo cierre tocando fuera
      });
      await loadingOverlay.present();

      try {
        const feature = track.features[0];
        const autoTexts =
          await this.smartRouteBuilder.generateWikilocStyleTexts(feature);
        proposedTexts = {
          name: autoTexts.title,
          description: autoTexts.description,
        };
      } catch (err) {
        console.warn('No se pudo autogenerar el texto de la ruta', err);
      } finally {
        // Pase lo que pase, quitamos el alert al terminar
        await loadingOverlay.dismiss();
      }
    }

    // 2. Abrimos el popover pasando los textos propuestos
    const popover = await this.popoverController.create({
      component: SaveTrackPopover,
      componentProps: { modalEdit: proposedTexts },
      cssClass: 'top-glass-island-wrapper',
      translucent: true,
      backdropDismiss: true,
    });

    await popover.present();

    // 3. Esperamos a que el usuario confirme o edite
    const { data, role } = await popover.onDidDismiss();

    if (role === 'cancel' || role === 'backdrop') {
      if (this.location.state === 'stopped') {
        this.present.isRecordPopoverOpen = true;
      }
      return;
    }

    if (data?.action === 'ok') {
      const finalName =
        data.name || this.translate.instant('RECORD.DEFAULT_NAME');
      // Llamamos al guardado (el Toast de éxito ya lo tienes al final de saveFile!)
      await this.saveFile(finalName, data.description);
    }
  }

  /**
   * Realiza el procesado final del archivo (Snap-to-trail, optimización)
   * y lo persiste en el almacenamiento local.
   */
  async saveFile(name: string, description: string) {
    const track = this.present.currentTrack;
    if (!track?.features?.[0]) return;

    this.loading = true;
    try {
      // 1. Clonamos el track original crudo
      let trackToProcess = JSON.parse(JSON.stringify(track));

      // --- INICIO DEL PIPELINE DE OPTIMIZACIÓN ---

      // Limpiamos los rebotes del GPS usando el filtro de Triangulación + Velocidad
      const rawCoords = trackToProcess.features[0].geometry.coordinates;
      const cleanedCoords = this.geoMath.removeGpsSpikesHybrid(rawCoords, 15); // 15 m/s (~54 km/h) por defecto
      trackToProcess.features[0].geometry.coordinates = cleanedCoords;

      const trailReference = // This is not used in the current version of prepareTrackWithTrails
        trackToProcess.features[0].geometry.coordinates.map((c: any) => ({
          lng: c[0],
          lat: c[1],
        }));
      const snappedTrack = await this.snapToTrailService.prepareTrackWithTrails(
        trackToProcess,
        trailReference
      );
      const optimizedTrack = await this.geoMath.filterSpeedAndAltitude(
        snappedTrack,
        0
      );
      // --- FIN DEL PIPELINE ---

      // 🛡️ SAFETY CHECK: Si el pipeline falla y vacía las coordenadas, usamos el track original
      const finalTrack =
        optimizedTrack?.features?.[0]?.geometry?.coordinates?.length > 0
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
        for (const wp of feature.waypoints) {
          if (wp.photos && wp.photos.length > 0) {
            routePhotos = [...routePhotos, ...wp.photos];
          }
        }
      }

      // 3. Guardamos el archivo optimizado en el Storage con su dateKey
      await this.fs.storeSet(dateKey, finalTrack);

      // 4. Creamos el ítem para la lista (Metadata)
      const newItem = {
        name,
        date: saveDate,
        place: feature.properties.place,
        description,
        isChecked: false,
        photos: routePhotos,
        file: dateKey, // 👈 CRITICAL FIX: The foreign key linking to the track file

        // Optional: If your list UI relies on these properties to show stats before opening the map
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
      console.error('Save failed', e);
    } finally {
      this.loading = false;
      this.cd.detectChanges();
    }
  }
}
