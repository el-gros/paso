import { Injectable } from '@angular/core';
import { Feature } from 'ol';
import { LineString, MultiPoint, Point } from 'ol/geom';
import { Style } from 'ol/style';
import { PopoverController } from '@ionic/angular';
import { TranslateService } from '@ngx-translate/core';

import { Track, Waypoint } from 'src/globald';
import { StylerService } from './styler.service';
import { GeographyService } from './geography.service';
import { FunctionsService } from '../services/functions.service';
import { SaveTrackPopover } from '../save-track-popover.component';

@Injectable({
  providedIn: 'root',
})
export class ReferenceService {
  
  // --- ESTADO PRINCIPAL ---
  public archivedTrack: Track | undefined = undefined;
  public archivedColor: string = 'green';
  
  // --- ESTADO DE INTERFAZ (UI) ---
  public isSearchGuidePopoverOpen = false;
  public isSearchPopoverOpen = false;
  public isGuidePopoverOpen = false;
  public foundRoute: boolean = false;
  public foundPlace: boolean = false;

  constructor(
    private stylerService: StylerService,
    private geography: GeographyService,
    private fs: FunctionsService,
    private popoverCtrl: PopoverController,
    private translate: TranslateService,
  ) {}

  // ==========================================================================
  // 1. RENDERIZADO (OpenLayers)
  // ==========================================================================

  /**
   * Dibuja la ruta archivada/referencia en el mapa estableciendo un orden Z (Z-Index)
   * para asegurar que los pines y waypoints queden por encima de la línea.
   */
  public async displayArchivedTrack(): Promise<void> {
    const source = this.geography.archivedLayer?.getSource();
    if (!this.geography.map || !this.archivedTrack || !source) return;

    const feature0 = this.archivedTrack.features?.[0];
    const coordinates = feature0?.geometry?.coordinates;
    
    if (!Array.isArray(coordinates) || coordinates.length === 0) return;

    source.clear();
    const featuresToAdd: Feature[] = [];

    // 1. Línea de la ruta (Capa inferior, Z=1)
    const lineFeature = new Feature(new LineString(coordinates));
    lineFeature.set('type', 'archived_line');
    this.applyStyle(lineFeature, this.stylerService.setStrokeStyle(this.archivedColor), 1);
    featuresToAdd.push(lineFeature);

    // 2. Pines de Inicio y Fin (Capa media, Z=5)
    const startFeature = new Feature(new Point(coordinates[0]));
    startFeature.set('type', 'archived_start');
    this.applyStyle(startFeature, this.stylerService.createPinStyle('green'), 5);
    
    const endFeature = new Feature(new Point(coordinates[coordinates.length - 1]));
    endFeature.set('type', 'archived_end');
    this.applyStyle(endFeature, this.stylerService.createPinStyle('red'), 5);
    
    featuresToAdd.push(startFeature, endFeature);

    // 3. Waypoints/PDI (Capa superior, Z=10)
    const waypoints = Array.isArray(feature0.waypoints) ? feature0.waypoints : [];
    const wpCoords = waypoints
      .filter(p => typeof p.longitude === 'number' && typeof p.latitude === 'number')
      .map(p => [p.longitude, p.latitude]);

    if (wpCoords.length > 0) {
      const wpFeature = new Feature(new MultiPoint(wpCoords));
      wpFeature.set('type', 'archived_waypoints');
      wpFeature.set('waypoints', waypoints);
      this.applyStyle(wpFeature, this.stylerService.createPinStyle('yellow'), 10);
      featuresToAdd.push(wpFeature);
    }

    // Dibujar todo de golpe (más eficiente que uno a uno)
    source.addFeatures(featuresToAdd);
  }

  /**
   * Borra la ruta de referencia actual del mapa y de la memoria.
   */
  public clearArchivedTrack(): void {
    this.archivedTrack = undefined;
    this.geography.archivedLayer?.getSource()?.clear();
  }

  // ==========================================================================
  // 2. GESTIÓN Y EDICIÓN DE RUTAS
  // ==========================================================================

  /**
   * Abre el popover para editar metadatos de una ruta o guardar un borrador nuevo.
   * @param index - Índice en la colección. -1 indica que es un borrador temporal.
   */
  public async editTrack(index: number): Promise<void> {
    const isDraft = index === -1;
    let properties: any;
    let draftCoords: any = null;

    // 1. Recopilar datos según sea borrador o ruta guardada
    if (isDraft) {
      if (!this.archivedTrack?.features?.[0]) return;
      properties = this.archivedTrack.features[0].properties;
      draftCoords = this.archivedTrack.features[0].geometry?.coordinates;
    } else {
      if (!this.fs.collection[index]) return;
      properties = this.fs.collection[index];
    }

    // 2. Preparar datos para el modal
    const modalEdit = { 
      name: properties.name || '', 
      description: properties.description || '',
      coords: draftCoords 
    };

    const popover = await this.popoverCtrl.create({
      component: SaveTrackPopover,
      componentProps: { modalEdit },
      backdropDismiss: true,
      cssClass: 'top-glass-island-wrapper',
      translucent: true,
    });

    await popover.present();
    
    // 🚀 Extraemos tanto la data como el role
    const { data, role } = await popover.onDidDismiss();

    // 🚀 3. Comprobar si el usuario canceló o tocó fuera
    if (role === 'cancel' || role === 'backdrop') {
      return; // Morimos silenciosamente, como querías
    }

    // 4. Procesar la respuesta del usuario
    if (data?.action === 'ok') {
      if (isDraft) {
        await this.saveNewDraft(data);
      } else {
        await this.updateExistingTrack(index, data);
      }
    }
  } 

  // ==========================================================================
  // 3. MÉTODOS PRIVADOS (Helpers)
  // ==========================================================================

  private applyStyle(feature: Feature, style: Style | Style[], zIndex: number): void {
    if (Array.isArray(style)) {
      style.forEach(s => s.setZIndex(zIndex));
    } else {
      style.setZIndex(zIndex);
    }
    feature.setStyle(style);
  }

  private async saveNewDraft(data: any): Promise<void> {
    if (!this.archivedTrack?.features?.[0]) return;
    
    const props = this.archivedTrack.features[0].properties;
    props.name = data.name;
    props.description = data.description;
    
    // Generar ID único basado en fecha si no existe
    if (!props.date) {
      props.date = new Date().toISOString();
    }
    
    const storageKey = props.date instanceof Date ? props.date.toISOString() : props.date;

    // Guardar el GeoJSON pesado en Storage
    await this.fs.storeSet(storageKey, this.archivedTrack);

    // Crear ítem ligero para la colección/lista
    const newCollectionItem = {
      date: new Date(storageKey), 
      name: data.name,
      description: data.description,
      place: (props.place as string) || '' 
    };

    this.fs.collection.unshift(newCollectionItem);
    await this.fs.storeSet('collection', this.fs.collection);

    this.fs.displayToast(this.translate.instant('ARCHIVE.TRACK_SAVED'), 'success');
  }

  private async updateExistingTrack(index: number, data: any): Promise<void> {
    // 1. Actualizar la colección ligera
    this.fs.collection[index].name = data.name;
    this.fs.collection[index].description = data.description;
    await this.fs.storeSet('collection', this.fs.collection);

    // 2. Actualizar el GeoJSON pesado almacenado
    const trackDate = this.fs.collection[index].date;
    if (trackDate) {
      const storageKey = trackDate instanceof Date ? trackDate.toISOString() : trackDate;
      const fullTrack = await this.fs.storeGet(storageKey);
      
      if (fullTrack?.features?.[0]) {
        fullTrack.features[0].properties.name = data.name;
        fullTrack.features[0].properties.description = data.description;
        await this.fs.storeSet(storageKey, fullTrack);

        // Si es la ruta que estamos viendo ahora mismo en pantalla, actualizarla en vivo
        if (this.archivedTrack?.features?.[0]) {
          const currentProps = this.archivedTrack.features[0].properties;
          currentProps.name = data.name;
          currentProps.description = data.description;
        }
      }
    }
    this.fs.displayToast(this.translate.instant('ARCHIVE.TRACK_UPDATED'), 'success');
  }
}