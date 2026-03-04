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
  archivedTrack: Track | undefined = undefined;
  archivedColor: string = 'green';
  
  // UI States
  isSearchGuidePopoverOpen = false;
  isSearchPopoverOpen = false;
  isGuidePopoverOpen = false;
  foundRoute: boolean = false;
  foundPlace: boolean = false;

  constructor(
    private stylerService: StylerService,
    private geography: GeographyService,
    private fs: FunctionsService,
    private popoverCtrl: PopoverController,
    private translate: TranslateService,
  ) {}

  /**
   * Renders an archived track on the map with specific Z-Indices for clarity.
   */
  async displayArchivedTrack(): Promise<void> {
    const source = this.geography.archivedLayer?.getSource();
    if (!this.geography.map || !this.archivedTrack || !source) return;

    const feature0 = this.archivedTrack.features?.[0];
    const coordinates = feature0?.geometry?.coordinates;
    
    if (!Array.isArray(coordinates) || coordinates.length === 0) return;

    source.clear();

    const featuresToAdd: Feature[] = [];

    // 1. Track Line (Bottom Layer)
    const lineFeature = new Feature(new LineString(coordinates));
    lineFeature.set('type', 'archived_line');
    this.applyStyle(lineFeature, this.stylerService.setStrokeStyle(this.archivedColor), 1);
    featuresToAdd.push(lineFeature);

    // 2. Start & End Pins (Middle Layer)
    const startFeature = new Feature(new Point(coordinates[0]));
    startFeature.set('type', 'archived_start');
    this.applyStyle(startFeature, this.stylerService.createPinStyle('green'), 5);
    
    const endFeature = new Feature(new Point(coordinates.at(-1)!));
    endFeature.set('type', 'archived_end');
    this.applyStyle(endFeature, this.stylerService.createPinStyle('red'), 5);
    
    featuresToAdd.push(startFeature, endFeature);

    // 3. Waypoints (Top Layer)
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

    source.addFeatures(featuresToAdd);
  }

  /**
   * Helper to set style and Z-Index simultaneously
   */
  private applyStyle(feature: Feature, style: Style | Style[], zIndex: number) {
    if (Array.isArray(style)) {
      style.forEach(s => s.setZIndex(zIndex));
    } else {
      style.setZIndex(zIndex);
    }
    feature.setStyle(style);
  }

  /**
   * Clears the archived track from the map and service state
   */
  clearArchivedTrack() {
    this.archivedTrack = undefined;
    this.geography.archivedLayer?.getSource()?.clear();
  }

  async editTrack(index: number) {
    const isDraft = index === -1;
    
    // Obtenemos las propiedades a editar (del borrador o de la colección)
    let properties: any;
    let draftCoords: any = null;

    if (isDraft) {
      if (!this.archivedTrack?.features?.[0]) return;
      properties = this.archivedTrack.features[0].properties;
      draftCoords = this.archivedTrack.features[0].geometry?.coordinates;
    } else {
      if (!this.fs.collection[index]) return;
      properties = this.fs.collection[index];
    }

    const modalEdit = { 
      name: properties.name || '', 
      description: properties.description || '',
      coords: draftCoords // <-- Pasamos las coordenadas directamente al popover
    };

    const popover = await this.popoverCtrl.create({
      component: SaveTrackPopover,
      componentProps: { modalEdit },
      backdropDismiss: true,
      cssClass: 'glass-island-wrapper',
      translucent: true,
    });

    await popover.present();
    const { data } = await popover.onDidDismiss();

    if (data?.action === 'ok') {
      if (isDraft) {
        // --- CASO 1: GUARDAR TRACK NUEVO (-1) ---
        
        // SOLUCIÓN ERROR 1: Volvemos a asegurar a TypeScript que esto existe
        if (!this.archivedTrack?.features?.[0]) return;
        
        const props = this.archivedTrack.features[0].properties;
        props.name = data.name;
        props.description = data.description;
        
        // Aseguramos que tenga una fecha que servirá como ID único
        if (!props.date) {
          props.date = new Date().toISOString();
        }
        const storageKey = props.date instanceof Date ? props.date.toISOString() : props.date;

        // 2. Guardamos el track completo (GeoJSON) en SQLite
        await this.fs.storeSet(storageKey, this.archivedTrack);

        // 3. Creamos el objeto resumen para la colección
        const newCollectionItem = {
          date: new Date(storageKey), // <-- ¡Convertimos el string a objeto Date!
          name: data.name,
          description: data.description,
          place: (props.place as string) || '' // <-- Aseguramos que sea string
          // distance: props.distance || 0,
          // time: props.time || 0
        };

        // 4. Lo añadimos al principio de la colección y guardamos
        this.fs.collection.unshift(newCollectionItem);
        await this.fs.storeSet('collection', this.fs.collection);

        this.fs.displayToast(this.translate.instant('ARCHIVE.TRACK_SAVED') || 'Ruta guardada correctamente', 'success');

      } else {
        // --- CASO 2: ACTUALIZAR TRACK EXISTENTE ---
        // (El resto del código de este bloque se mantiene igual)
        
        this.fs.collection[index].name = data.name;
        this.fs.collection[index].description = data.description;
        await this.fs.storeSet('collection', this.fs.collection);

        const trackDate = this.fs.collection[index].date;
        if (trackDate) {
          const storageKey = trackDate instanceof Date ? trackDate.toISOString() : trackDate;
          const fullTrack = await this.fs.storeGet(storageKey);
          
          if (fullTrack?.features?.[0]) {
            fullTrack.features[0].properties.name = data.name;
            fullTrack.features[0].properties.description = data.description;
            await this.fs.storeSet(storageKey, fullTrack);

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
  }
}  