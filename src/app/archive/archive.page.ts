import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule, LoadingController, IonItemSliding, ModalController, AlertController, PopoverController, ItemReorderEventDetail } from '@ionic/angular';
import { FormsModule } from '@angular/forms';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { Capacitor } from '@capacitor/core';

// --- SERVICES ---
import { FunctionsService } from '../services/functions.service';
import { ReferenceService } from '../services/reference.service';
import { MapService } from '../services/map.service';
import { GeographyService } from '../services/geography.service';
import { LocationManagerService } from '../services/location-manager.service';
import { TrackExportService } from '../services/track-export.service';
import { MapTracksService } from '../services/map-tracks.service';
import { VoiceRunnerService } from '../services/voice-runner.service';
import { ArchiveFolderService } from './archive-folder.service';

// --- INTERFACES & COMPONENTS ---
import { TrackDefinition, LocationResult } from '../../globald';
import { PhotoViewerComponent } from '../photo-viewer.component';
import { TrackOptionsPopoverComponent } from '../track-options-popover.component';
import { ArchivePlacesComponent } from './archive-places.component';

@Component({
  standalone: true,
  selector: 'app-archive',
  templateUrl: 'archive.page.html',
  styleUrls: ['archive.page.scss'],
  imports: [IonicModule, CommonModule, FormsModule, TranslateModule, ArchivePlacesComponent]
})
export class ArchivePage implements OnInit {

  public isConfirmDeletionOpen: boolean = false;
  public index: number = -1;
  private deleteTarget: { type: 'track' | 'place', index: number, data?: any } | null = null;
  public slidingItem: IonItemSliding | undefined = undefined;
  public isExportMenuOpen = false;
  public selectedTrackForExport: any = null;
  public exportConfig = {
    html: true,
    gpx: false,
    kmz: false,
    photos: false,
    kmzPhotos: false
  };
  activeTab: string = 'tracks';

  constructor(
    public fs: FunctionsService,
    public mapService: MapService,
    public mapTracks: MapTracksService,
    private translate: TranslateService,
    public reference: ReferenceService,
    public geography: GeographyService,
    public location: LocationManagerService,
    private loadingCtrl: LoadingController,
    private exportService: TrackExportService,
    private modalCtrl: ModalController,
    private alertController: AlertController,
    private popoverController: PopoverController,
    public voiceRunner: VoiceRunnerService,
    public folderService: ArchiveFolderService
  ) { }

  ngOnInit() {
    if (this.geography.searchLayer) {
      this.geography.searchLayer.getSource()?.clear();
    }
    this.geography.refreshPlacesLayer(this.fs.placesCollection);
  }

  // ==========================================================================
  // DELEGACIÓN AL SERVICIO DE CARPETAS (para usar desde el template)
  // ==========================================================================

  get currentPath() { return this.folderService.currentPath; }
  get foldersAtCurrentLevel() { return this.folderService.foldersAtCurrentLevel; }
  get tracksAtCurrentLevel() { return this.folderService.tracksAtCurrentLevel; }

  enterFolder(folderName: string) { this.folderService.enterFolder(folderName); }
  resetPath() { this.folderService.resetPath(); }
  navigateTo(index: number) { this.folderService.navigateTo(index); }
  createNewFolder() { return this.folderService.createNewFolder(); }
  openFolderOptions(event: Event, folder: string) { return this.folderService.openFolderOptions(event, folder); }
  handleFolderReorder(ev: CustomEvent<ItemReorderEventDetail>) { return this.folderService.handleFolderReorder(ev); }

  // ==========================================================================
  // 1. VISUALIZACIÓN Y NAVEGACIÓN DE TRACKS
  // ==========================================================================

  async displayTrack(active: boolean) {
    if (active) {
      this.reference.archivedTrack = await this.fs.retrieveTrack() ?? this.reference.archivedTrack;
      if (this.reference.archivedTrack) {
        await this.reference.displayArchivedTrack();
        await this.geography.setMapView(this.reference.archivedTrack!);
      }
    } else {
      this.reference.clearArchivedTrack();
    }
    await this.location.sendReferenceToPlugin();
    this.fs.gotoPage('tab1');
  }

  async displaySpecificTrack(item: TrackDefinition, slidingItem?: IonItemSliding) {
    if (slidingItem) slidingItem.close();
    if (!item.date) return;

    const trackData = await this.fs.storeGet(new Date(item.date).toISOString());
    this.reference.archivedTrack = trackData;

    this.fs.gotoPage('tab1');
    await new Promise(r => setTimeout(r, 200));

    this.reference.displayArchivedTrack();
    await this.geography.setMapView(this.reference.archivedTrack!);
    await this.location.sendReferenceToPlugin();
    this.reference.foundRoute = false;
  }

  async displayAllTracks(show: boolean) {
    try {
      if (show) {
        if (this.reference.archivedTrack) {
          this.reference.clearArchivedTrack();
          await this.location.sendReferenceToPlugin();
        }
        this.mapService.visibleAll = true;
        this.fs.gotoPage('tab1');
        setTimeout(async () => {
          await this.mapTracks.displayAllTracks();
          this.fs.displayToast(this.translate.instant('ARCHIVE.ALL_DISPLAYED'), 'success');
          this.reference.foundRoute = false;
        }, 200);
      } else {
        this.mapService.visibleAll = false;
        const source = this.geography.archivedLayer?.getSource();
        if (source) source.clear();
        this.fs.displayToast(this.translate.instant('ARCHIVE.ALL_HIDDEN'), 'success');
        await this.fs.gotoPage('tab1');
      }
    } catch (error) {
      console.error('Error displaying all tracks:', error);
    }
  }

  isTrackVisible(item: TrackDefinition): boolean {
    if (!this.reference.archivedTrack) return false;
    const activeDate = this.reference.archivedTrack.features?.[0]?.properties?.date;
    const itemDate = item.date;
    if (!activeDate || !itemDate) return false;
    return new Date(activeDate).getTime() === new Date(itemDate).getTime();
  }

  async toggleVisibility(item: TrackDefinition, slidingItem?: IonItemSliding) {
    if (this.isTrackVisible(item)) {
      await this.hideSpecificTrack(slidingItem);
    } else {
      await this.displaySpecificTrack(item, slidingItem);
    }
  }

  // ==========================================================================
  // 2. GESTIÓN DE TRACKS (CRUD)
  // ==========================================================================

  confirmDeletion(index: number, slidingItem?: IonItemSliding) {
    this.deleteTarget = { type: 'track', index };
    this.isConfirmDeletionOpen = true;
    this.index = index;
    this.slidingItem = slidingItem;
  }

  /** Llamado desde ArchivePlacesComponent vía @Output */
  onPlaceDeletionRequest(event: { place: LocationResult, slidingItem: IonItemSliding }) {
    const realIndex = this.fs.placesCollection.findIndex(p => p.lat === event.place.lat && p.lon === event.place.lon);
    this.deleteTarget = { type: 'place', index: realIndex, data: event.place };
    this.isConfirmDeletionOpen = true;
    this.slidingItem = event.slidingItem;
  }

  async executeDelete() {
    if (!this.deleteTarget) return;

    if (this.deleteTarget.type === 'track') {
      await this.deleteSpecificTrack(this.deleteTarget.index, this.slidingItem);
    } else {
      this.fs.removePlace(this.deleteTarget.index);
      this.geography.refreshPlacesLayer(this.fs.placesCollection);
      if (this.slidingItem) this.slidingItem.close();
    }

    this.isConfirmDeletionOpen = false;
    this.deleteTarget = null;
    this.slidingItem = undefined;
  }

  async deleteSpecificTrack(index: number, slidingItem?: IonItemSliding) {
    if (slidingItem) slidingItem.close();

    const item = this.fs.collection[index];
    if (item) {
      const isCurrentlyVisible = this.isTrackVisible(item);
      await this.fs.removeTrackFromCollection(index);

      if (isCurrentlyVisible) {
        this.reference.clearArchivedTrack();
        await this.location.sendReferenceToPlugin();
      }
    }
  }

  async editSpecificTrack(index: number, slidingItem?: IonItemSliding) {
    if (slidingItem) slidingItem.close();
    await this.reference.editTrack(index);
  }

  async hideSpecificTrack(slidingItem?: IonItemSliding) {
    if (slidingItem) slidingItem.close();
    this.reference.clearArchivedTrack();
    await this.location.sendReferenceToPlugin();
    this.fs.gotoPage('tab1');
  }

  async handleReorder(ev: CustomEvent<ItemReorderEventDetail>) {
    this.fs.collection = ev.detail.complete(this.fs.collection);
    await this.fs.storeSet('collection', this.fs.collection);
  }

  // ==========================================================================
  // 3. POPOVER DE OPCIONES DEL TRACK
  // ==========================================================================

  async openTrackOptionsPopover(item: TrackDefinition, event: Event | any) {
    if (event) event.stopPropagation();
    const popover = await this.popoverController.create({
      component: TrackOptionsPopoverComponent,
      componentProps: {
        trackItem: item,
        isCurrentlyVisible: this.isTrackVisible(item)
      },
      cssClass: 'glass-island-wrapper',
      translucent: true,
      backdropDismiss: true,
      event: event
    });

    await popover.present();

    const { data, role } = await popover.onDidDismiss();

    if (role === 'backdrop' || role === 'cancel') return;

    if (data && data.action) {
      switch (data.action) {
        case 'display':
          await this.toggleVisibility(item);
          break;
        case 'edit':
          await this.editSpecificTrack(this.fs.collection.indexOf(item));
          break;
        case 'export':
          this.openExportMenu(item, undefined);
          break;
        case 'move':
          await this.folderService.moveTrackToFolder(item);
          break;
        case 'delete':
          this.confirmDeletion(this.fs.collection.indexOf(item), undefined);
          break;
      }
    }
  }

  // ==========================================================================
  // 4. EXPORTACIÓN DE ARCHIVOS (HTML, GPX, KMZ)
  // ==========================================================================

  openExportMenu(item: TrackDefinition, slidingItem?: IonItemSliding) {
    this.selectedTrackForExport = item;
    this.exportConfig = { html: true, gpx: false, kmz: false, photos: false, kmzPhotos: false };
    this.isExportMenuOpen = true;
    if (slidingItem) slidingItem.close();
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

  // ==========================================================================
  // 5. GESTIÓN DE FOTOS
  // ==========================================================================

  getCoverPhotoUrl(photoUri: string | null): string {
    return photoUri ? Capacitor.convertFileSrc(photoUri) : '';
  }

  async openPhotoGallery(photos: string[], event: Event) {
    event.stopPropagation();
    if (!photos || photos.length === 0) return;

    const modal = await this.modalCtrl.create({
      component: PhotoViewerComponent,
      componentProps: { photos: photos }
    });
    await modal.present();
  }
}