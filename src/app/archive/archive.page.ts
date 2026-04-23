import { Component, OnInit } from '@angular/core';
import { IonicModule, LoadingController, IonItemSliding, ModalController, AlertController, PopoverController } from '@ionic/angular';
import { CommonModule } from '@angular/common';
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

// --- INTERFACES & COMPONENTS ---
import { TrackDefinition, Track, LocationResult, PLACE_CATEGORIES } from '../../globald';
import { PhotoViewerComponent } from '../photo-viewer.component';
import { PlaceEditPopover } from '../place-edit-popover.component';

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

  get isAnyPlaceVisible(): boolean {
    return this.fs.placesCollection.some(p => p.visible === true);
  }

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
    private popoverController: PopoverController
  ) { }

  ngOnInit() {
    // Limpiamos la capa de búsqueda y la wiki/meteo para que no ensucien la vista
    if (this.geography.searchLayer) {
      this.geography.searchLayer.getSource()?.clear();
    }
    
    // Opcional: nos aseguramos de que los pines del archivo estén actualizados al entrar
    this.geography.refreshPlacesLayer(this.fs.placesCollection);
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
      console.error("Error displaying all tracks:", error);
    }
  }

  // ==========================================================================
  // 2. GESTIÓN DE TRACKS (CRUD)
  // ==========================================================================
  confirmDeletion(index: number, slidingItem: IonItemSliding) {
    this.deleteTarget = { type: 'track', index };
    this.isConfirmDeletionOpen = true;
    this.index = index;
    this.slidingItem = slidingItem;
  }

  confirmPlaceDeletion(place: LocationResult, slidingItem: IonItemSliding) {
    const realIndex = this.fs.placesCollection.findIndex(p => p.lat === place.lat && p.lon === place.lon);
    this.deleteTarget = { type: 'place', index: realIndex, data: place };
    this.isConfirmDeletionOpen = true;
    this.slidingItem = slidingItem;
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

  isTrackVisible(item: TrackDefinition): boolean {
    if (!this.reference.archivedTrack) return false;
    const activeDate = this.reference.archivedTrack.features?.[0]?.properties?.date;
    const itemDate = item.date;
    if (!activeDate || !itemDate) return false;
    return new Date(activeDate).getTime() === new Date(itemDate).getTime();
  }

  // archive.page.ts

togglePlaceVisibility(place: LocationResult, event: Event) { // <-- Añadido 'event'
  // 1. Evitamos que el clic se propague al item (así no se cierra el panel ni centra el mapa)
  event.stopPropagation();
  
  // 2. Buscamos el índice real del lugar en la colección
  const realIndex = this.fs.placesCollection.findIndex(p => p.lat === place.lat && p.lon === place.lon);
  
  if (realIndex > -1) {
    // 3. Persistimos el cambio en el almacenamiento (Storage/Disco)
    this.fs.updatePlace(realIndex, place);
    
    // 4. Refrescamos la capa de OpenLayers para que el pin aparezca o desaparezca
    this.geography.refreshPlacesLayer(this.fs.placesCollection);
  }
}
  // ==========================================================================
  // 3. EXPORTACIÓN DE ARCHIVOS (HTML, GPX, KMZ)
  // ==========================================================================
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

    try {
      await this.exportService.exportAndShareTrack(item, this.exportConfig);
      this.fs.displayToast(this.translate.instant('ARCHIVE.EXPORT_SUCCESS'), 'success');
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

  // ==========================================================================
  // MÉTODOS PARA LA PESTAÑA DE LUGARES
  // ==========================================================================

  // Agrupador de lugares por categorías para la vista HTML
  get groupedPlaces() {
    const groups: { category: any, places: LocationResult[] }[] = [];
    
    for (const cat of PLACE_CATEGORIES) {
      const placesInCat = this.fs.placesCollection.filter(p => 
        p.categories && p.categories.length > 0 && p.categories[0] === cat.id
      );
      
      if (placesInCat.length > 0) {
        groups.push({ category: cat, places: placesInCat });
      }
    }
    return groups;
  }

  // Centrar mapa en el lugar
  focusOnPlace(place: LocationResult) {
    if (place.lat && place.lon) {
      this.geography.showLocationOnMap(place); // Usamos tu geografía existente
      this.fs.gotoPage('tab1'); // Mandamos al usuario a la vista del mapa
    }
  }

  async toggleVisibility(item: TrackDefinition, slidingItem?: IonItemSliding) {
    if (this.isTrackVisible(item)) {
      await this.hideSpecificTrack(slidingItem);
    } else {
      await this.displaySpecificTrack(item, slidingItem);
    }
  }

  // Helper para saber si una categoría está "activa" (para el icono del ojo)
  isCategoryVisible(categoryId: string): boolean {
    return this.fs.placesCollection
      .filter(p => p.categories && p.categories[0] === categoryId)
      .some(p => p.visible === true);
  }

  // Centrar el mapa en un lugar específico
  centerPlace(place: LocationResult) {
    // Aseguramos que sea visible si lo vamos a centrar
    place.visible = true;
    this.fs.savePlacesToStorage();
    this.geography.refreshPlacesLayer(this.fs.placesCollection);
    
    // Llamamos al método de centrado de tu servicio de geografía
    this.geography.centerMap(place.lon, place.lat, 15);
    
    // Opcional: Volver al mapa automáticamente
    // this.activeTab = 'map'; 
  }

  // Refrescar el mapa cuando tocas un checkbox individual
  onPlaceVisibilityChange() {
    this.fs.savePlacesToStorage();
    this.geography.refreshPlacesLayer(this.fs.placesCollection);
  }
 
  // ==========================================================================
  // ESTADOS DE VISIBILIDAD (Para desactivar botones)
  // ==========================================================================

  get isAllPlacesVisible(): boolean {
    if (this.fs.placesCollection.length === 0) return true;
    return this.fs.placesCollection.every(p => p.visible);
  }

  get isAllPlacesHidden(): boolean {
    if (this.fs.placesCollection.length === 0) return true;
    return this.fs.placesCollection.every(p => !p.visible);
  }

  isAllCategoryVisible(categoryId: string): boolean {
    const places = this.fs.placesCollection.filter(p => p.categories && p.categories[0] === categoryId);
    if (places.length === 0) return true;
    return places.every(p => p.visible);
  }

  isAllCategoryHidden(categoryId: string): boolean {
    const places = this.fs.placesCollection.filter(p => p.categories && p.categories[0] === categoryId);
    if (places.length === 0) return true;
    return places.every(p => !p.visible);
  }

  // ==========================================================================
  // ACCIONES DE VISIBILIDAD
  // ==========================================================================

  displayAllPlaces(show: boolean) {
    this.fs.placesCollection.forEach(p => p.visible = show);
    this.fs.savePlacesToStorage();
    this.geography.refreshPlacesLayer(this.fs.placesCollection);
    const msg = show ? 'ARCHIVE.ALL_DISPLAYED' : 'ARCHIVE.ALL_HIDDEN';
    this.fs.displayToast(this.translate.instant(msg), 'success');
  }

  setCategoryVisibility(categoryId: string, show: boolean, event: Event) {
    event.stopPropagation(); // Evita que el acordeón se abra/cierre al pulsar el ojo
    this.fs.placesCollection.forEach(p => {
      if (p.categories && p.categories[0] === categoryId) p.visible = show;
    });
    this.fs.savePlacesToStorage();
    this.geography.refreshPlacesLayer(this.fs.placesCollection);
  }

  // ==========================================================================
  // EDICIÓN Y BORRADO DE LUGARES
  // ==========================================================================

  // Editar las categorías
  async editPlace(place: LocationResult, slidingItem?: IonItemSliding) {
    if (slidingItem) slidingItem.close();
    
    // Obtenemos el índice real
    const realIndex = this.fs.placesCollection.findIndex(p => p.lat === place.lat && p.lon === place.lon);
    
    if (realIndex > -1) {
      const popover = await this.popoverController.create({
        component: PlaceEditPopover,
        componentProps: { place: place },
        backdropDismiss: true,
        cssClass: 'top-glass-island-wrapper',
        translucent: true,
      });

      await popover.present();
      const { data } = await popover.onDidDismiss();

      if (data?.action === 'ok' && data.place) {
        this.fs.updatePlace(realIndex, data.place);
        // Refrescamos la capa para que el pin cambie de color o nombre inmediatamente
        this.geography.refreshPlacesLayer(this.fs.placesCollection);
      }
    }
  }
}