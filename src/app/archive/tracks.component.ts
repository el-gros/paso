import { Component, EventEmitter, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule, PopoverController, ModalController, ItemReorderEventDetail, IonItemSliding } from '@ionic/angular';
import { FormsModule } from '@angular/forms';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { Capacitor } from '@capacitor/core';

// --- SERVICIOS ---
import { FunctionsService } from '../services/functions.service';
import { ArchiveFolderService } from './archive-folder.service';
import { MapService } from '../services/map.service';
import { ReferenceService } from '../services/reference.service';
import { GeographyService } from '../services/geography.service';
import { LocationManagerService } from '../services/location-manager.service';
import { MapTracksService } from '../services/map-tracks.service';

// --- INTERFACES & COMPONENTES ---
import { TrackDefinition } from '../../globald';
import { PhotoViewerComponent } from '../photo-viewer.component';
import { TrackOptionsPopoverComponent } from '../track-options-popover.component';

@Component({
  standalone: true,
  selector: 'app-archive-tracks',
  templateUrl: 'tracks.component.html',
  styleUrls: ['tracks.component.scss'],
  imports: [IonicModule, CommonModule, FormsModule, TranslateModule]
})
export class TracksComponent {
  
  /** Eventos que se envían al componente padre (archive.page.ts) */
  @Output() requestTrackDeletion = new EventEmitter<{ index: number, isVisible: boolean }>();
  @Output() requestTrackExport = new EventEmitter<TrackDefinition>();

  constructor(
    public fs: FunctionsService,
    public folderService: ArchiveFolderService,
    public mapService: MapService,
    public reference: ReferenceService,
    public geography: GeographyService,
    public location: LocationManagerService,
    public mapTracks: MapTracksService,
    private translate: TranslateService,
    private popoverController: PopoverController,
    private modalCtrl: ModalController
  ) {}

  // ==========================================================================
  // CARPETAS Y RUTAS (Delegado a ArchiveFolderService)
  // ==========================================================================
  get currentPath() { return this.folderService.currentPath; }
  get foldersAtCurrentLevel() { return this.folderService.foldersAtCurrentLevel; }
  get tracksAtCurrentLevel() { return this.folderService.tracksAtCurrentLevel; }

  enterFolder(folderName: string) { this.folderService.enterFolder(folderName); }
  resetPath() { this.folderService.resetPath(); }
  navigateTo(index: number) { this.folderService.navigateTo(index); }
  createNewFolder() { this.folderService.createNewFolder(); }
  openFolderOptions(event: Event, folder: string) { this.folderService.openFolderOptions(event, folder); }
  handleFolderReorder(ev: CustomEvent<ItemReorderEventDetail>) { this.folderService.handleFolderReorder(ev); }

  async handleReorder(ev: CustomEvent<ItemReorderEventDetail>) {
    this.fs.collection = ev.detail.complete(this.fs.collection);
    await this.fs.storeSet('collection', this.fs.collection);
  }

  // ==========================================================================
  // VISUALIZACIÓN DE TRAYECTOS
  // ==========================================================================
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
        this.geography.archivedLayer?.getSource()?.clear();
        this.fs.displayToast(this.translate.instant('ARCHIVE.ALL_HIDDEN'), 'success');
        await this.fs.gotoPage('tab1');
      }
    } catch (error) {
      console.error('Error displaying all tracks:', error);
    }
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

  async hideSpecificTrack(slidingItem?: IonItemSliding) {
    if (slidingItem) slidingItem.close();
    this.reference.clearArchivedTrack();
    await this.location.sendReferenceToPlugin();
    this.fs.gotoPage('tab1');
  }

  async toggleVisibility(item: TrackDefinition, slidingItem?: IonItemSliding) {
    if (this.isTrackVisible(item)) {
      await this.hideSpecificTrack(slidingItem);
    } else {
      await this.displaySpecificTrack(item, slidingItem);
    }
  }

  isTrackVisible(item: TrackDefinition): boolean {
    if (!this.reference.archivedTrack) return false;
    const activeDate = this.reference.archivedTrack.features?.[0]?.properties?.date;
    const itemDate = item.date;
    if (!activeDate || !itemDate) return false;
    return new Date(activeDate).getTime() === new Date(itemDate).getTime();
  }

  async editSpecificTrack(index: number) {
    await this.reference.editTrack(index);
  }

  // ==========================================================================
  // POPOVER DE TRAYECTO
  // ==========================================================================
  async openTrackOptionsPopover(item: TrackDefinition, event: Event | any) {
    if (event) event.stopPropagation();
    const popover = await this.popoverController.create({
      component: TrackOptionsPopoverComponent,
      componentProps: { trackItem: item, isCurrentlyVisible: this.isTrackVisible(item) },
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
        case 'display': await this.toggleVisibility(item); break;
        case 'edit': await this.editSpecificTrack(this.fs.collection.indexOf(item)); break;
        case 'move': await this.folderService.moveTrackToFolder(item); break;
        case 'export': 
          this.requestTrackExport.emit(item); // Avisa al padre para exportar
          break;
        case 'delete': 
          this.requestTrackDeletion.emit({ 
            index: this.fs.collection.indexOf(item), 
            isVisible: this.isTrackVisible(item) 
          }); // Avisa al padre para borrar
          break;
      }
    }
  }

  // ==========================================================================
  // FOTOS
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