import { Component, NgZone, ChangeDetectorRef, inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule, DecimalPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule, PopoverController, Platform, ModalController } from '@ionic/angular';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { lastValueFrom, Subscription } from 'rxjs';

// OpenLayers & Plugins
import Point from 'ol/geom/Point';
import LineString from 'ol/geom/LineString';
import { useGeographic } from 'ol/proj.js';
import { register } from 'swiper/element/bundle';
import { Waypoint } from 'src/globald';

// Tus Servicios (Asegúrate de que las rutas sean correctas)
import { FunctionsService } from './services/functions.service';
import { GeographyService } from './services/geography.service';
import { LocationManagerService } from './services/location-manager.service';
import { PresentService } from './services/present.service';
import { StylerService } from './services/styler.service';
import { SaveTrackPopover } from './save-track-popover.component';
import { MapService } from './services/map.service';

useGeographic();
register();

@Component({
  standalone: true,
  selector: 'app-record-popover',
  imports: [IonicModule, CommonModule, FormsModule, TranslateModule],
  providers: [DecimalPipe, DatePipe],
  template: `
    <ion-popover 
      [isOpen]="present.isRecordPopoverOpen" 
      (didDismiss)="present.isRecordPopoverOpen = false"
      class="floating-popover">
      <ng-template>
        <div class="popover-island">
          <div class="button-grid">
            <button class="nav-item-btn" 
              [disabled]="location.state !== 'inactive'" 
              (click)="startTracking(); present.isRecordPopoverOpen = false">
              <ion-icon name="caret-forward-circle-sharp" class="primary-icon"></ion-icon>
              <p>{{ 'RECORD.START_TRACKING' | translate }}</p>
            </button>

            <button class="nav-item-btn" 
              [disabled]="location.state !== 'tracking'" 
              (click)="waypoint(); present.isRecordPopoverOpen = false">
              <ion-icon name="pin-sharp" class="primary-icon"></ion-icon>
              <p>{{ 'RECORD.WAYPOINT' | translate }}</p>
            </button>

            <button class="nav-item-btn" 
              [disabled]="location.state !== 'tracking'" 
              (click)="present.isConfirmStopOpen = true; present.isRecordPopoverOpen = false">
              <ion-icon name="stop-circle-sharp" class="primary-icon"></ion-icon>
              <p>{{ 'RECORD.STOP_TRACKING' | translate }}</p>
            </button>

            <button class="nav-item-btn" 
              [disabled]="location.state !== 'stopped'" 
              [class.enabled]="location.state === 'stopped'"
              (click)="setTrackDetails(); present.isRecordPopoverOpen = false">
              <ion-icon name="save-sharp" class="primary-icon"></ion-icon>
              <p>{{ 'RECORD.SAVE_TRACK' | translate }}</p>
            </button>

            <button class="nav-item-btn" 
              [disabled]="location.state !== 'stopped' && location.state !== 'saved'" 
              (click)="present.isConfirmDeletionOpen = true; present.isRecordPopoverOpen = false">
              <ion-icon name="trash-sharp" class="primary-icon"></ion-icon>
              <p>{{ 'RECORD.REMOVE_TRACK' | translate }}</p>
            </button>
          </div>
        </div>
      </ng-template>
    </ion-popover>

    <ion-popover 
      [isOpen]="present.isConfirmStopOpen || present.isConfirmDeletionOpen" 
      (didDismiss)="closeAllPopovers()"
      class="confirm-popover">
      <ng-template>
        <div class="popover-island confirm-box">
          <p class="confirm-title">
            {{ (present.isConfirmStopOpen ? 'RECORD.CONFIRM_STOP' : 'RECORD.CONFIRM_DELETION') | translate }}
          </p>
          <div class="button-grid horizontal">
            <button class="nav-item-btn green-pill" 
              (click)="present.isConfirmStopOpen ? stopTracking() : deleteTrack(); closeAllPopovers()">
              <ion-icon name="checkmark-sharp"></ion-icon>
              <p>{{ 'RECORD.DELETE_YES' | translate }}</p>
            </button>
            
            <button class="nav-item-btn red-pill" (click)="closeAllPopovers()">
              <ion-icon name="close-sharp"></ion-icon>
              <p>{{ 'RECORD.DELETE_NO' | translate }}</p>
            </button>
          </div>
        </div>
      </ng-template>
    </ion-popover>
  `,
styles: [`
    /* --- ESTRUCTURA BASE FLOTANTE --- */
    .floating-popover, .confirm-popover {
      --background: transparent;
      --box-shadow: none;
      --width: 95%;
      --max-width: 420px;
    }

    .popover-island {
      background: rgba(255, 255, 255, 0.9) !important; /* Mismo Alpha que tus botones principales */
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border-radius: 28px;
      padding: 16px 10px;
      border: 1px solid rgba(255, 255, 255, 0.5);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
    }

    /* --- BOTÓN TIPO NAV (VERTICAL) --- */
    .nav-item-btn {
      background: transparent !important;
      border: none;
      display: flex !important;
      flex-direction: column !important;
      align-items: center !important;
      justify-content: center !important;
      flex: 1; /* Distribución uniforme */
      transition: transform 0.1s ease;
      min-width: 65px;
      cursor: pointer;

      ion-icon {
        font-size: 26px; /* Tamaño estandarizado */
        margin-bottom: 4px;
      }

      p {
        margin: 0;
        font-size: 10px; /* Tamaño unificado */
        font-weight: 700;
        text-transform: uppercase;
        color: #333;
        letter-spacing: 0.5px;
        white-space: nowrap;
      }

      &:active:not(:disabled) {
        transform: scale(0.92);
        opacity: 0.7;
      }

      &:disabled {
        opacity: 0.2;
        filter: grayscale(1);
      }
    }

    /* --- GRID Y CONTENEDORES --- */
    .button-grid {
      display: flex;
      justify-content: space-around;
      align-items: center;
      gap: 5px;
    }

    .button-grid.horizontal {
      justify-content: center;
      gap: 40px; /* Espacio mayor para botones de SÍ/NO */
    }

    /* --- COLORES Y ESTADOS --- */
    .primary-icon { 
      color: var(--ion-color-primary, #3880ff) !important; 
    }

    .green-pill ion-icon, .green-pill p { 
      color: #2dd36f !important; 
    }

    .red-pill ion-icon, .red-pill p { 
      color: #eb445a !important; 
    }

    /* Clase especial para resaltar el botón de Guardar cuando está listo */
    .enabled ion-icon {
      animation: pulse 2s infinite;
    }

    @keyframes pulse {
      0% { transform: scale(1); }
      50% { transform: scale(1.1); }
      100% { transform: scale(1); }
    }

    /* --- CAJA DE CONFIRMACIÓN --- */
    .confirm-box { 
      padding: 24px 16px; 
      text-align: center;
    }

    .confirm-title {
      margin-bottom: 20px;
      font-size: 12px;
      font-weight: 800;
      color: #555;
      text-transform: uppercase;
      letter-spacing: 0.8px;
    }
  `]
})

export class RecordPopoverComponent { 
// ... resto de la lógica permanece igual ...  // Inyección de servicios con inject() para evitar NG0201
  public fs = inject(FunctionsService);
  public geography = inject(GeographyService);
  public location = inject(LocationManagerService);
  public present = inject(PresentService);
  public stylerService = inject(StylerService);
  private translate = inject(TranslateService);
  private popoverController = inject(PopoverController);
  private cd = inject(ChangeDetectorRef);
  private mapService = inject(MapService);

  // Estados de UI

  loading = false;
  subscription?: Subscription;

  ngOnInit() {
    // Inicialización si es necesaria
  }

  ngOnDestroy() {
    this.subscription?.unsubscribe();
  }

  closeAllPopovers() {
    this.present.isRecordPopoverOpen = false;
    this.present.isConfirmStopOpen = false;
    this.present.isConfirmDeletionOpen = false;
  }

  async startTracking() {
    this.present.currentTrack = undefined;
    this.location.currentPoint = 0;
    this.present.filtered = 0;
    this.location.averagedSpeed = 0;
    this.present.computedDistances = 0;
    if (this.geography.currentLayer) this.geography.currentLayer.getSource()?.clear();
    this.location.state = 'tracking';
    await this.location.sendReferenceToPlugin();
  }

  async deleteTrack() {
    this.location.state = 'inactive';
    this.present.currentTrack = undefined;
    this.geography.currentLayer?.getSource()?.clear();
    this.fs.displayToast(this.translate.instant('MAP.CURRENT_TRACK_DELETED'));
  }

  async stopTracking(): Promise<void> {
    this.location.state = 'stopped';
    this.subscription?.unsubscribe();
    const source = this.geography.currentLayer?.getSource();
    if (!source || !this.present.currentTrack || !this.geography.map) return;

    let coordinates = this.present.currentTrack.features?.[0]?.geometry?.coordinates;
    if (!Array.isArray(coordinates) || coordinates.length < 1) {
      this.fs.displayToast(this.translate.instant('MAP.TRACK_EMPTY'));
      return;
    }

    await this.present.setWaypointAltitude();
    coordinates = this.present.currentTrack.features?.[0]?.geometry?.coordinates;
    if (!Array.isArray(coordinates) || coordinates.length < 1) return;

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
      endPin.setGeometry(new Point(coordinates.at(-1)!));
      endPin.setStyle(this.stylerService.createPinStyle('red'));
    }

    await this.geography.setMapView(this.present.currentTrack);
    this.fs.displayToast(this.translate.instant('MAP.TRACK_FINISHED'));
    await this.location.sendReferenceToPlugin();
  }

  // 37. ADD WAYPOINT ////////////////////////////////////
  async waypoint() {
    if (!this.present.currentTrack) return;
    const num: number = this.present.currentTrack.features[0].geometry.coordinates.length;
    const point = this.present.currentTrack.features[0].geometry.coordinates[num - 1];
    // Wrap the reverse geocode in a timeout
    const addressObservable = this.mapService.reverseGeocode(point[1], point[0]);
    const addressPromise = lastValueFrom(addressObservable);
    // Timeout promise (rejects or resolves after 500 ms)
    const timeoutPromise = new Promise(resolve =>
      setTimeout(() => resolve(null), 500)
    );
    // Race both
    const address: any = (await Promise.race([addressPromise, timeoutPromise])) || {
      name: '',
      display_name: '',
      short_name: ''
    };
    const waypoint: Waypoint = {
      longitude: point[0],
      latitude: point[1],
      altitude: num - 1,
      name: address?.short_name ?? address?.name ?? address?.display_name ?? '',
      comment: ''
    };
    const response: { action: string; name: string; comment: string } =
      await this.fs.editWaypoint(waypoint, false, true);
    if (response.action === 'ok') {
      waypoint.name = response.name;
      waypoint.comment = response.comment;
      this.present.currentTrack?.features[0].waypoints?.push(waypoint);
      this.fs.displayToast(this.translate.instant('MAP.WPT_ADDED'));
    }
  }

  async setTrackDetails(ev?: any) {
    const modalEdit = { name: '', description: '' };
    const edit = true;
    const popover = await this.popoverController.create({
      component: SaveTrackPopover,
      componentProps: { modalEdit, edit },
      event: ev,
      translucent: true,
      dismissOnSelect: false
    });
    await popover.present();
    const { data } = await popover.onDidDismiss();
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

      await this.fs.storeSet(dateKey, trackToSave);
      this.fs.collection.unshift({
        name,
        date: saveDate,
        place: feature.properties.place,
        description,
        isChecked: false
      });
      await this.fs.storeSet('collection', this.fs.collection);

      this.fs.displayToast(this.translate.instant('MAP.SAVED'));
      this.location.state = 'saved';
    } catch (e) {
      console.error("Save failed", e);
    } finally {
      this.loading = false;
      this.cd.detectChanges();
    }
  }

  async getAltitudesFromMap(coordinates: [number, number][] ) {
    try {
      const altitudes = await this.getAltitudes(coordinates)
      const slopes = await this.fs.computeElevationGainAndLoss(altitudes)
      return {altitudes: altitudes, slopes: slopes}
    }
    catch {
      return {altitudes: null, slopes: null}
    }
  }

  async getAltitudes(rawCoordinates: [number, number][]): Promise<number[]> {
    const requestBody = {
      locations: rawCoordinates.map(([lon, lat]) => ({
        latitude: lat,
        longitude: lon
      }))
    };
    try {
      const response = await fetch('https://api.open-elevation.com/api/v1/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });
      //const result = await response.json();
      console.log(response)
      // Check status
      if (response.status < 200 || response.status >= 300) {
        this.fs.displayToast(this.translate.instant('ERRORS.ELEVATION_FETCH'));
        return [];
      }
      // Parse response as JSON and extract elevations
      const result = await response.json();
      return result.results.map((result: any) => result.elevation);
    } catch (error) {
      // Handle network or parsing errors gracefully
      this.fs.displayToast(this.translate.instant('ERRORS.ELEVATION_GENERIC'));
      return [];
    }
  }

}