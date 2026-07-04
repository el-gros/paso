import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule, LoadingController, IonItemSliding } from '@ionic/angular';
import { FormsModule } from '@angular/forms';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

// --- SERVICIOS ---
import { FunctionsService } from '../services/functions.service';
import { ReferenceService } from '../services/reference.service';
import { GeographyService } from '../services/geography.service';
import { LocationManagerService } from '../services/location-manager.service';
import { TrackExportService } from '../services/track-export.service';
import { VoiceRunnerService } from '../services/voice-runner.service';

// --- COMPONENTES E INTERFACES ---
import { TrackDefinition, LocationResult } from '../../globald';
import { PlacesComponent } from './places.component';
import { TracksComponent } from './tracks.component'; // Añadido

@Component({
  standalone: true,
  selector: 'app-archive',
  templateUrl: 'archive.page.html',
  styleUrls: ['archive.page.scss'],
  imports: [IonicModule, CommonModule, FormsModule, TranslateModule, PlacesComponent, TracksComponent]
})
export class ArchivePage implements OnInit {

  public activeTab: string = 'tracks';

  // Variables de Borrado
  public isConfirmDeletionOpen: boolean = false;
  private deleteTarget: { type: 'track' | 'place', index: number, data?: any, isVisible?: boolean } | null = null;
  public slidingItem: IonItemSliding | undefined = undefined;

  // Variables de Exportación
  public isExportMenuOpen = false;
  public selectedTrackForExport: any = null;
  public exportConfig = { html: true, gpx: false, kmz: false, photos: false, kmzPhotos: false };

  constructor(
    public fs: FunctionsService,
    private translate: TranslateService,
    public reference: ReferenceService,
    public geography: GeographyService,
    public location: LocationManagerService,
    private loadingCtrl: LoadingController,
    private exportService: TrackExportService,
    public voiceRunner: VoiceRunnerService
  ) { }

  ngOnInit() {
    if (this.geography.searchLayer) {
      this.geography.searchLayer.getSource()?.clear();
    }
    this.geography.refreshPlacesLayer(this.fs.placesCollection);
  }

  // ==========================================================================
  // GESTIÓN DE BORRADO (Tracks y Places)
  // ==========================================================================

  /** Recibido desde app-archive-tracks */
  onTrackDeletionRequest(event: { index: number, isVisible: boolean }) {
    this.deleteTarget = { type: 'track', index: event.index, isVisible: event.isVisible };
    this.isConfirmDeletionOpen = true;
    this.slidingItem = undefined; // Se maneja sin sliding en el popover actual
  }

  /** Recibido desde app-archive-places */
  onPlaceDeletionRequest(event: { place: LocationResult, slidingItem: IonItemSliding }) {
    const realIndex = this.fs.placesCollection.findIndex(p => p.lat === event.place.lat && p.lon === event.place.lon);
    this.deleteTarget = { type: 'place', index: realIndex, data: event.place };
    this.isConfirmDeletionOpen = true;
    this.slidingItem = event.slidingItem;
  }

  async executeDelete() {
    if (!this.deleteTarget) return;

    if (this.deleteTarget.type === 'track') {
      await this.fs.removeTrackFromCollection(this.deleteTarget.index);
      if (this.deleteTarget.isVisible) {
        this.reference.clearArchivedTrack();
        await this.location.sendReferenceToPlugin();
      }
    } else {
      this.fs.removePlace(this.deleteTarget.index);
      this.geography.refreshPlacesLayer(this.fs.placesCollection);
      if (this.slidingItem) this.slidingItem.close();
    }

    this.isConfirmDeletionOpen = false;
    this.deleteTarget = null;
    this.slidingItem = undefined;
  }

  // ==========================================================================
  // EXPORTACIÓN
  // ==========================================================================

  /** Recibido desde app-archive-tracks */
  openExportMenu(item: TrackDefinition) {
    this.selectedTrackForExport = item;
    this.exportConfig = { html: true, gpx: false, kmz: false, photos: false, kmzPhotos: false };
    this.isExportMenuOpen = true;
  }

  async executeExport() {
    this.isExportMenuOpen = false;
    const item = this.selectedTrackForExport;
    if (!item || !item.date) return;

    const loading = await this.loadingCtrl.create({
      message: this.translate.instant('ARCHIVE.GENERATING_FILES'),
      backdropDismiss: false,
      spinner: 'crescent',
      cssClass: 'glass-loading-overlay'
    });
    await loading.present();

    try {
      await this.exportService.exportAndShareTrack(item, this.exportConfig);
      this.fs.displayToast(this.translate.instant('ARCHIVE.EXPORT_SUCCESS'), 'success');
    } catch (error) {
      console.error('Error al exportar:', error);
      if (String(error).indexOf('Canceled') === -1 && String(error).indexOf('canceled') === -1) {
        this.fs.displayToast(this.translate.instant('ARCHIVE.EXPORT_ERROR'), 'error');
      }
    } finally {
      await loading.dismiss();
    }
  }

  get trackHasPhotos(): boolean {
    return !!(this.selectedTrackForExport?.photos && this.selectedTrackForExport.photos.length > 0);
  }

  isAnyExportOptionSelected(): boolean {
    return Object.values(this.exportConfig).some(value => value === true);
  }

  onKmzToggle(type: 'kmz' | 'kmzPhotos') {
    if (type === 'kmz' && this.exportConfig.kmz) {
      this.exportConfig.kmzPhotos = false;
    } else if (type === 'kmzPhotos' && this.exportConfig.kmzPhotos) {
      this.exportConfig.kmz = false;
    }
  }
}