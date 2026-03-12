import { Component, ChangeDetectorRef, inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule, DecimalPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule, PopoverController } from '@ionic/angular';
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

// Opcional pero recomendado: Inyectar el motor que creamos ayer para apagarlo correctamente
// import { TrackingEngineService } from './services/tracking-engine.service'; 

@Component({
  standalone: true,
  selector: 'app-record-popover',
  imports: [IonicModule, CommonModule, FormsModule, TranslateModule],
  providers: [DecimalPipe, DatePipe],
  template: `
    <ion-popover 
      [isOpen]="present.isRecordPopoverOpen" 
      (didDismiss)="present.isRecordPopoverOpen = false"
      backdropDismiss="false"
      class="floating-popover">
      <ng-template>
        <div class="popover-island">
          <div class="button-grid">
              <button class="nav-item-btn enabled" (click)="setTrackDetails(); present.isRecordPopoverOpen = false">
                <ion-icon name="save-sharp" class="primary-icon"></ion-icon>
                <p>{{ 'RECORD.SAVE_TRACK' | translate }}</p>
              </button>

              <button class="nav-item-btn" (click)="present.isConfirmDeletionOpen = true; present.isRecordPopoverOpen = false">
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
      class="confirm-popover">
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
      class="confirm-popover">
      <ng-template>
        <div class="popover-island confirm-box">
          <p class="confirm-title">{{ 'RECORD.CONFIRM_DELETION' | translate }}</p>
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
  styles: [`
    .popover-island { padding: 16px 10px; }
    .button-grid { display: flex; justify-content: space-around; align-items: center; gap: 5px; }
    .button-grid.horizontal { justify-content: center; gap: 40px; }
    .primary-icon { color: var(--ion-color-primary, #3880ff) !important; }
    .enabled ion-icon { animation: pulse 2s infinite; }
    @keyframes pulse {
      0% { transform: scale(1); }
      50% { transform: scale(1.1); }
      100% { transform: scale(1); }
    }
  `]
})

export class RecordPopoverComponent implements OnInit, OnDestroy { 
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
  // private trackingEngine = inject(TrackingEngineService); // Descomentar si decides parar el motor aquí

  loading = false;
  subscription?: Subscription;
  
  private isProcessingStop = false;
  private isProcessingDelete = false;

  ngOnInit() {}
  
  ngOnDestroy() { 
    this.subscription?.unsubscribe(); 
  }

  closeAllPopovers() {
    this.present.isRecordPopoverOpen = false;
    this.present.isConfirmStopOpen = false;
    this.present.isConfirmDeletionOpen = false;
  }

  // ==========================================
  // FLUJO DE PARADA (STOP)
  // ==========================================
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

  // ==========================================
  // FLUJO DE BORRADO (DELETE)
  // ==========================================
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
  // ==========================================
  // ACCIONES DEL TRACK
  // ==========================================
  async deleteTrack() {
    this.location.state = 'inactive';
    // this.trackingEngine.stopEngine(); // <-- Detener el motor si aplica
    
    this.present.currentTrack = undefined;
    this.geography.currentLayer?.getSource()?.clear();
    await this.photo.discardSessionPhotos();
    this.fs.displayToast(this.translate.instant('MAP.CURRENT_TRACK_DELETED'), 'success');
  }

  async stopTracking(): Promise<void> {
    this.location.state = 'stopped';
    // this.trackingEngine.stopEngine(); // <-- Detener el motor si aplica
    
    this.subscription?.unsubscribe();
    const source = this.geography.currentLayer?.getSource();
    
    if (!source || !this.present.currentTrack || !this.geography.map) return;

    // 🚀 Corregido: Limpiamos la duplicidad de validación
    const coordinates = this.present.currentTrack.features?.[0]?.geometry?.coordinates;
    if (!Array.isArray(coordinates) || coordinates.length === 0) {
      this.fs.displayToast(this.translate.instant('MAP.TRACK_EMPTY'), 'warning');
      return;
    }

    const features = source.getFeatures();
    const routeLine = features.find(f => f.get('type') === 'route_line');
    const startPin = features.find(f => f.get('type') === 'start_pin');
    const endPin = features.find(f => f.get('type') === 'end_pin');

    if (routeLine) {
      routeLine.setGeometry(new LineString(coordinates));
      routeLine.setStyle(this.stylerService.setStrokeStyle(this.present.currentColor));
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
    this.fs.displayToast(this.translate.instant('MAP.TRACK_FINISHED'), 'success');
    await this.location.sendReferenceToPlugin();

    await this.setTrackDetails();
  }

  async setTrackDetails(ev?: any) {
    const modalEdit = { name: '', description: '' };
    const popover = await this.popoverController.create({
      component: SaveTrackPopover,
      componentProps: { modalEdit },
      cssClass: 'top-glass-island-wrapper',
      translucent: true,
      backdropDismiss: true
    });
    
    await popover.present();
    
    // 🚀 Extraemos tanto la data como el role
    const { data, role } = await popover.onDidDismiss();
    
    // 1. Si el usuario cancela (botón o tocando el fondo oscuro)
    if (role === 'cancel' || role === 'backdrop') {
      if (this.location.state === 'stopped') {
        this.present.isRecordPopoverOpen = true;
      }
      return; // Salimos para no ejecutar nada más
    }
    
    // 2. Si el usuario confirma y todo está OK
    if (data?.action === 'ok') {
      const name = data.name || this.translate.instant('RECORD.DEFAULT_NAME');
      await this.saveFile(name, data.description);
    }
  }

  async saveFile(name: string, description: string) {
    const track = this.present.currentTrack;
    if (!track?.features?.[0]) return;
    
    this.loading = true;
    try {
      const trackToSave = JSON.parse(JSON.stringify(track));
      const feature = trackToSave.features[0];
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

      await this.fs.storeSet(dateKey, trackToSave);
      
      const newItem = {
        name,
        date: saveDate,
        place: feature.properties.place,
        description,
        isChecked: false,
        photos: routePhotos
      };

      this.fs.collection.unshift(newItem);
      
      await this.fs.storeSet('collection', this.fs.collection);
      this.fs.collection = [...this.fs.collection];
      
      await this.photo.confirmSessionPhotos();
      this.fs.displayToast(this.translate.instant('MAP.SAVED'), 'success');
      
      this.location.state = 'inactive';
      this.present.currentTrack = undefined;
      this.geography.currentLayer?.getSource()?.clear();
      this.closeAllPopovers(); // 🚀 Corregido: faltaba punto y coma aquí
    } catch (e) {
      console.error("Save failed", e);
    } finally {
      this.loading = false;
      this.cd.detectChanges();
    }
  }
}