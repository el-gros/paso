import { Component, OnInit } from '@angular/core';
import { IonicModule, LoadingController, IonItemSliding, ModalController } from '@ionic/angular';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share'; // 👈 IMPORTANTE: El nuevo import

// --- SERVICES ---
import { FunctionsService } from '../services/functions.service';
import { ReferenceService } from '../services/reference.service';
import { MapService } from '../services/map.service';
import { GeographyService } from '../services/geography.service';
import { LocationManagerService } from '../services/location-manager.service';
import { TrackExportService } from '../services/track-export.service';
import { SnapToTrailService } from '../services/snapToTrail.service';
import { GeoMathService } from '../services/geo-math.service';

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
  public isExportMenuOpen = false;
  public selectedTrackForExport: any = null;
  public exportConfig = {
    html: true,
    gpx: false, 
    kmz: false,
    photos: false,
    kmzPhotos: false
  };

  constructor(
    public fs: FunctionsService,
    public mapService: MapService,
    private translate: TranslateService,
    public reference: ReferenceService,
    public geography: GeographyService,
    public location: LocationManagerService,
    private loadingCtrl: LoadingController,
    private exportService: TrackExportService,
    private modalCtrl: ModalController,
    private snapToTrailService: SnapToTrailService,
    private geoMath: GeoMathService
    // ELIMINADO: private socialSharing: SocialSharing
  ) { }

  ngOnInit() { }

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
  // 3. Ejecuta la exportación según las opciones seleccionadas
  async executeExport() {
    this.isExportMenuOpen = false;
    const item = this.selectedTrackForExport;
    
    if (!item || !item.date) return;

    // 1. Mostrar pantalla de carga
    const loading = await this.loadingCtrl.create({
      message: this.translate.instant('ARCHIVE.GENERATING_FILES'),
      backdropDismiss: false,
      spinner: 'crescent',
      cssClass: 'glass-loading-overlay'
    });
    await loading.present();

    const filesToShare: string[] = []; 

    try {
      // 2. Obtener el track completo de la base de datos
      const storageKey = new Date(item.date).toISOString();
      const trackData = await this.fs.storeGet(storageKey);

      if (!trackData) {
        throw new Error("No se pudo cargar la ruta desde el almacenamiento.");
      }

      const featureToExport = trackData.features ? trackData.features[0] : (trackData as any);

      if (!featureToExport.properties) featureToExport.properties = {};
      featureToExport.properties.name = item.name || featureToExport.properties.name || 'Track';
      featureToExport.properties.description = item.description || featureToExport.properties.description || '';

      const safeName = (item.name || 'track').replace(/[^a-zA-Z0-9_\-\.]/g, '_');

      // 3. Generar dinámicamente según la configuración
      
      // -- HTML --
      if (this.exportConfig.html) {
        const htmlText = this.exportService.generateStandaloneHtml(trackData, item.name);
        const savedHtml = await this.writeFile(`${safeName}.html`, htmlText, Encoding.UTF8);
        filesToShare.push(savedHtml.uri);
      }
      
      // -- GPX --
      if (this.exportConfig.gpx) {
        const gpxText = await this.exportService.geoJsonToGpx(featureToExport);
        const savedGpx = await this.writeFile(`${safeName}.gpx`, gpxText, Encoding.UTF8);
        filesToShare.push(savedGpx.uri);
      }
      
      // -- KMZ (Solo ruta) --
      if (this.exportConfig.kmz) {
        const kmzBase64 = await this.exportService.geoJsonToKmz(featureToExport);
        const savedKmz = await Filesystem.writeFile({ path: `${safeName}.kmz`, data: kmzBase64, directory: Directory.Cache });
        filesToShare.push(savedKmz.uri);
      }

      // -- FOTOS SUELTAS --
      if (this.exportConfig.photos && item.photos && item.photos.length > 0) {
        // Recorremos el array de fotos de la ruta
        for (const photoPath of item.photos) {
          // El plugin Share de Capacitor necesita que los archivos locales
          // empiecen por "file://". Normalmente, tu app ya las guarda así.
          // Si por algún motivo no tienen ese prefijo, se lo ponemos por seguridad:
          const finalPath = photoPath.startsWith('file://') ? photoPath : `file://${photoPath}`;
          filesToShare.push(finalPath);
        }
      }

      // -- KMZ CON FOTOS --
      if (this.exportConfig.kmzPhotos) {
        const kmzPhotosBase64 = await this.exportService.geoJsonToKmzWithPhotos(featureToExport);
        const savedKmzPhotos = await Filesystem.writeFile({ path: `${safeName}_completo.kmz`, data: kmzPhotosBase64, directory: Directory.Cache });
        filesToShare.push(savedKmzPhotos.uri);
      }

      // 4. Compartir usando Capacitor
      if (filesToShare.length > 0) {
        const shareSubject = `${this.translate.instant('SEARCH.ROUTE')}: ${item.name}`;

        await Share.share({
          title: shareSubject,
          files: filesToShare,
          dialogTitle: this.translate.instant('ARCHIVE.DIALOG_TITLE')
        });

        // Mostrar Toast de éxito
        this.fs.displayToast(this.translate.instant('ARCHIVE.EXPORT_SUCCESS'), 'success');
      } else {
        this.fs.displayToast('No se seleccionó ningún archivo para exportar', 'warning');
      }

    } catch (error) {
      console.error("Error al exportar:", error);
      // Ignoramos el error si el usuario simplemente cerró la ventana de compartir del sistema operativo
      if (String(error).indexOf('Canceled') === -1 && String(error).indexOf('canceled') === -1) {
          this.fs.displayToast(this.translate.instant('ARCHIVE.EXPORT_ERROR'), 'error');
      }
    } finally {
      // 5. Ocultar la pantalla de carga
      await loading.dismiss();
    }
  }

  private async writeFile(path: string, data: string, encoding?: Encoding) {
    return Filesystem.writeFile({ path, data, directory: Directory.Cache, encoding });
  }

  private cleanupFiles(paths: string[]) {
      for (const path of paths) {
        Filesystem.deleteFile({ path, directory: Directory.Cache }).catch(e => console.log('Cleanup error', e));
      }
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

  /**
   * Abre el menú de exportación. 
   * Configura HTML como única opción por defecto y permite selección manual.
   */
  openExportMenu(item: TrackDefinition, slidingItem: IonItemSliding) {
    this.selectedTrackForExport = item;

    this.exportConfig = {
      html: true,
      gpx: false,
      kmz: false,
      photos: false,
      kmzPhotos: false
    };

    this.isExportMenuOpen = true;
    if (slidingItem) slidingItem.close();
  }

  /**
   * Helper para deshabilitar opciones en el HTML si no hay fotos.
   */
  get trackHasPhotos(): boolean {
    return !!(this.selectedTrackForExport?.photos && this.selectedTrackForExport.photos.length > 0);
  }

  // 2. Comprueba si hay al menos una opción marcada para habilitar el botón OK
  isAnyExportOptionSelected(): boolean {
    return Object.values(this.exportConfig).some(value => value === true);
  }

  /**
   * Mantiene la exclusión mutua entre KMZ normal y KMZ con fotos.
   */
  onKmzToggle(type: 'kmz' | 'kmzPhotos') {
    if (type === 'kmz' && this.exportConfig.kmz) {
      this.exportConfig.kmzPhotos = false;
    } else if (type === 'kmzPhotos' && this.exportConfig.kmzPhotos) {
      this.exportConfig.kmz = false;
    }
  }

}