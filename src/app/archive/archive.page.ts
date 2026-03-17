import { Component, OnInit } from '@angular/core';
import { IonicModule, LoadingController, IonItemSliding, ModalController } from '@ionic/angular';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { SocialSharing } from '@awesome-cordova-plugins/social-sharing/ngx';
import { Capacitor } from '@capacitor/core';

// --- SERVICES ---
import { FunctionsService } from '../services/functions.service';
import { ReferenceService } from '../services/reference.service';
import { MapService } from '../services/map.service';
import { GeographyService } from '../services/geography.service';
import { LocationManagerService } from '../services/location-manager.service';
import { TrackExportService } from '../services/track-export.service';
// 🚀 Eliminado SupabaseService

// --- INTERFACES & COMPONENTS ---
import { TrackDefinition, Track } from '../../globald';
import { PhotoViewerComponent } from '../photo-viewer.component';

@Component({
  standalone: true,
  selector: 'app-archive',
  templateUrl: 'archive.page.html',
  styleUrls: ['archive.page.scss'],
  imports: [IonicModule, CommonModule, FormsModule, TranslateModule]
})
export class ArchivePage implements OnInit {

  public isConfirmDeletionOpen: boolean = false;
  public index: number = -1;
  public slidingItem: IonItemSliding | undefined = undefined;

  constructor(
    public fs: FunctionsService,
    public mapService: MapService,
    private translate: TranslateService,
    private socialSharing: SocialSharing,
    public reference: ReferenceService,
    public geography: GeographyService,
    public location: LocationManagerService,
    private loadingCtrl: LoadingController,
    private exportService: TrackExportService,
    private modalCtrl: ModalController
    // 🚀 Eliminado SupabaseService del constructor
  ) { }

  ngOnInit() { }

  async ionViewDidEnter() {
    if (this.fs.buildTrackImage) await this.shareImages();
  }

  // ==========================================================================
  // 1. VISUALIZACIÓN Y NAVEGACIÓN
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
        await this.fs.gotoPage('tab1');
        setTimeout(async () => {
          await this.mapService.displayAllTracks();
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
      console.error("Error displaying all tracks:", error);
    }
  }

  // ==========================================================================
  // 2. GESTIÓN DE TRACKS (CRUD)
  // ==========================================================================
  confirmDeletion(index: number, slidingItem: IonItemSliding) {
    this.isConfirmDeletionOpen = true;
    this.index = index;
    this.slidingItem = slidingItem;
  }

  async deleteTrack() {
    await this.deleteSpecificTrack(this.index, this.slidingItem);
    this.isConfirmDeletionOpen = false;
    this.slidingItem = undefined;
  }

  async deleteSpecificTrack(index: number, slidingItem?: IonItemSliding) {
    if (slidingItem) slidingItem.close();
    
    const trackToRemove = this.fs.collection[index];
    if (trackToRemove && trackToRemove.date) {
        const key = new Date(trackToRemove.date).toISOString();
        
        const isCurrentlyVisible = this.isTrackVisible(trackToRemove);

        if (key) await this.fs.storeRem(key);

        if (isCurrentlyVisible) {
           this.reference.clearArchivedTrack();
           await this.location.sendReferenceToPlugin();
        }
    }
    
    this.fs.collection.splice(index, 1);
    await this.fs.storeSet('collection', this.fs.collection);
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
  // 3. EXPORTACIÓN DE ARCHIVOS (HTML, GPX, KMZ)
  // ==========================================================================
  async exportTrack(item: TrackDefinition, slidingItem?: IonItemSliding) {
    if (!item || !item.date) return;
    if (slidingItem) slidingItem.close();

    const loading = await this.loadingCtrl.create({
      message: this.translate.instant('ARCHIVE.GENERATING_FILES'),
      backdropDismiss: false,
      spinner: 'crescent',
      cssClass: 'glass-loading-overlay'
    });
    await loading.present();

    try {
      const storageKey = new Date(item.date).toISOString();
      const trackData = await this.fs.storeGet(storageKey);

      if (!trackData) {
        this.fs.displayToast(this.translate.instant('ARCHIVE.LOADING_ERROR'), 'error');
        return;
      }

      const featureToExport = trackData.features ? trackData.features[0] : (trackData as any);
      const safeName = (item.name || 'track').replace(/[^a-zA-Z0-9_\-\.]/g, '_');

      // 1. GENERAR EL ARCHIVO HTML INTERACTIVO
      const htmlText = this.exportService.generateStandaloneHtml(trackData, item.name);

      // 2. GENERAR ARCHIVOS GPX Y KMZ (Adiós PDF y generación de imágenes)
      const [gpxText, kmzBase64] = await Promise.all([
        this.exportService.geoJsonToGpx(featureToExport),
        this.exportService.geoJsonToKmz(featureToExport)
      ]);

      const gpxName = `${safeName}.gpx`;
      const kmzName = `${safeName}.kmz`;
      const htmlName = `${safeName}.html`;

      // 3. GUARDAR ARCHIVOS EN CACHÉ EXTERNA
      const [savedGpx, savedKmz, savedHtml] = await Promise.all([
          this.writeFile(gpxName, gpxText, Encoding.UTF8),
          this.writeFile(kmzName, kmzBase64),
          this.writeFile(htmlName, htmlText, Encoding.UTF8)
      ]);

      // 4. COMPARTIR (Mensajes mejorados para WhatsApp y Gmail)
      const shareMessage = `Te envío información sobre la ruta: ${item.name}`;
      const shareSubject = `Ruta: ${item.name}`; // Gmail usa esto como Asunto

      const result = await this.socialSharing.shareWithOptions({
        message: shareMessage,
        subject: shareSubject,
        files: [savedGpx.uri, savedKmz.uri, savedHtml.uri],
        chooserTitle: this.translate.instant('ARCHIVE.DIALOG_TITLE')
      });

      if (result && result.completed) {
        await this.fs.displayToast(this.translate.instant('ARCHIVE.EXPORT_SUCCESS'), 'success'); 
      }

      // Limpieza de archivos
      this.cleanupFiles([gpxName, kmzName, htmlName]);

    } catch (e) {
      console.error('Export error:', e);
      await this.fs.displayToast(this.translate.instant('ARCHIVE.EXPORT_ERROR'), 'error');
    } finally {
      await loading.dismiss();
    }
  }
  
  // ==========================================================================
  // 4. COMPARTIR IMÁGENES (Social)
  // ==========================================================================
  async prepareImageExport() {
    this.fs.buildTrackImage = true;
    await this.displayTrack(true);
  }

  async shareImages() {
    try {
      const mapFile = await Filesystem.getUri({ path: 'map.png', directory: Directory.ExternalCache });
      const slideFile = await Filesystem.getUri({ path: 'data.png', directory: Directory.ExternalCache });
      
      await this.socialSharing.share(undefined, this.translate.instant('ARCHIVE.TEXT'), [mapFile.uri, slideFile.uri]);
      this.fs.buildTrackImage = false; 
    } catch (err) {
      console.error('Failed to share images:', err);
    }
  }

  private async writeFile(path: string, data: string, encoding?: Encoding) {
    return Filesystem.writeFile({ path, data, directory: Directory.ExternalCache, encoding });
  }

  private cleanupFiles(paths: string[]) {
    setTimeout(async () => {
      for (const path of paths) {
        try { await Filesystem.deleteFile({ path, directory: Directory.ExternalCache }); } catch(e) {}
      }
    }, 5000);
  }

  // ==========================================================================
  // 5. GESTIÓN DE FOTOS DE LA RUTA
  // ==========================================================================
  getFirstPhoto(track: any): string | null {
    const waypoints = track?.features?.[0]?.waypoints;
    return waypoints?.find((wp: any) => wp.photos && wp.photos.length > 0)?.photos[0] || null;
  }

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