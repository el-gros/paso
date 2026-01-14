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
    <ion-content [fullscreen]="true">
      <ion-popover [isOpen]="present.isRecordPopoverOpen" (didDismiss)="present.isRecordPopoverOpen = false">
        <ng-template>
          <ion-list>
            <ion-row>
              <button class="record-button map-color" 
                [disabled]="location.state !== 'inactive'" 
                (click)="startTracking(); present.isRecordPopoverOpen = false">
                <ion-icon name="caret-forward-circle-sharp"></ion-icon>
                <span>{{ 'RECORD.START_TRACKING' | translate }}</span>
              </button>

              <button class="record-button map-color" 
                [disabled]="location.state !== 'tracking'" 
                (click)="waypoint(); present.isRecordPopoverOpen = false">
                <ion-icon name="pin-sharp"></ion-icon>
                <span>{{ 'RECORD.WAYPOINT' | translate }}</span>
              </button>

              <button class="record-button map-color" 
                [disabled]="location.state !== 'tracking'" 
                (click)="present.isConfirmStopOpen = true; present.isRecordPopoverOpen = false">
                <ion-icon name="stop-circle-sharp"></ion-icon>
                <span>{{ 'RECORD.STOP_TRACKING' | translate }}</span>
              </button>

              <button class="record-button map-color" 
                [disabled]="location.state !== 'stopped'" 
                [class.enabled]="location.state === 'stopped'"
                (click)="setTrackDetails(); present.isRecordPopoverOpen = false">
                <ion-icon name="save-sharp"></ion-icon>
                <span>{{ 'RECORD.SAVE_TRACK' | translate }}</span>
              </button>

              <button class="record-button map-color" 
                [disabled]="location.state !== 'stopped' && location.state !== 'saved'" 
                (click)="present.isConfirmDeletionOpen = true; present.isRecordPopoverOpen = false">
                <ion-icon name="trash-sharp"></ion-icon>
                <span>{{ 'RECORD.REMOVE_TRACK' | translate }}</span>
              </button>
            </ion-row>
          </ion-list>
        </ng-template>
      </ion-popover>

      <ion-popover [isOpen]="present.isConfirmStopOpen" (didDismiss)="present.isConfirmStopOpen = false">
        <ng-template>
          <ion-list>
            <ion-item class="confirm" lines="none">
              <ion-label class="ion-text-wrap"><strong>{{ 'RECORD.CONFIRM_STOP' | translate }}</strong></ion-label>
            </ion-item>
            <ion-row>
              <button class="record-button green-color" (click)="stopTracking(); closeAllPopovers()">
                <ion-icon name="happy-sharp"></ion-icon>
                <span>{{ 'RECORD.DELETE_YES' | translate }}</span>
              </button>
              <button class="record-button red-color" (click)="closeAllPopovers()">
                <ion-icon name="sad-sharp"></ion-icon>
                <span>{{ 'RECORD.DELETE_NO' | translate }}</span>
              </button>
            </ion-row>
          </ion-list>
        </ng-template>
      </ion-popover>

      <ion-popover [isOpen]="present.isConfirmDeletionOpen" (didDismiss)="present.isConfirmDeletionOpen = false">
        <ng-template>
          <ion-list>
            <ion-item class="confirm" lines="none">
              <ion-label class="ion-text-wrap"><strong>{{ 'RECORD.CONFIRM_DELETION' | translate }}</strong></ion-label>
            </ion-item>
            <ion-row>
              <button class="record-button green-color" (click)="deleteTrack(); closeAllPopovers()">
                <ion-icon name="happy-sharp"></ion-icon>
                <span>{{ 'RECORD.DELETE_YES' | translate }}</span>
              </button>
              <button class="record-button red-color" (click)="closeAllPopovers()">
                <ion-icon name="sad-sharp"></ion-icon>
                <span>{{ 'RECORD.DELETE_NO' | translate }}</span>
              </button>
            </ion-row>
          </ion-list>
        </ng-template>
      </ion-popover>
    </ion-content>
  `,
  styles: [`
    .map-color { color: var(--ion-color-primary); }
    .confirm { font-weight: 400; transition: all 0.2s ease-in-out; --inner-padding-end: 0;
      --inner-padding-start: 0;  margin: 4px 0;  border-radius: 8px; }
    ion-row { display: flex; justify-content: center; gap: 5px; }
  `]
})
export class RecordPopoverComponent implements OnInit, OnDestroy {
  // Inyección de servicios con inject() para evitar NG0201
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
      const name = data.name || 'No name';
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
        this.fs.displayToast('Failed to fetch elevation data.');
        return [];
      }
      // Parse response as JSON and extract elevations
      const result = await response.json();
      return result.results.map((result: any) => result.elevation);
    } catch (error) {
      // Handle network or parsing errors gracefully
      this.fs.displayToast('Error retrieving elevation data.');
      return [];
    }
  }

}