import { Feature } from 'ol';
import { StylerService } from './styler.service';
import { FunctionsService } from '../services/functions.service';
import { LineString, MultiPoint, Point } from 'ol/geom';
import { Track } from 'src/globald';
import { GeographyService } from './geography.service';
import { Injectable } from '@angular/core';
import { Style } from 'ol/style';
import { PopoverController } from '@ionic/angular';
import { SaveTrackPopover } from '../save-track-popover.component';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

@Injectable({
  providedIn: 'root',
})

  export class ReferenceService {
  
    archivedTrack: Track | undefined = undefined;
    archivedColor: string = 'green';

  constructor(
    private stylerService: StylerService,
    private geography: GeographyService,
    private fs: FunctionsService,
    private popoverCtrl: PopoverController,
    private translate: TranslateService,
  ) { }

  async displayArchivedTrack(): Promise<void> {
    if (!this.geography.map || !this.archivedTrack?.features?.length) return;
    const coordinates = this.archivedTrack.features?.[0]?.geometry?.coordinates;
    if (!Array.isArray(coordinates) || coordinates.length === 0) return;
    // 1. Create features with identifiers
    const lineFeature = new Feature();
    lineFeature.set('type', 'archived_line');
    const startFeature = new Feature();
    startFeature.set('type', 'archived_start');
    const endFeature = new Feature();
    endFeature.set('type', 'archived_end');
    const waypointsFeature = new Feature();
    waypointsFeature.set('type', 'archived_waypoints');
    // 2. Configure Geometries and Styles with Z-Index
    // Track Line (Z-Index: 1)
    lineFeature.setGeometry(new LineString(coordinates));
    const lineStyle = this.stylerService.setStrokeStyle(this.archivedColor);
    this.applyZIndex(lineStyle, 1);
    lineFeature.setStyle(lineStyle);
    // Start point (Z-Index: 5)
    startFeature.setGeometry(new Point(coordinates[0]));
    const startStyle = this.stylerService.createPinStyle('green');
    this.applyZIndex(startStyle, 5);
    startFeature.setStyle(startStyle);
    // End point (Z-Index: 5)
    endFeature.setGeometry(new Point(coordinates.at(-1)!));
    const endStyle = this.stylerService.createPinStyle('red');
    this.applyZIndex(endStyle, 5);
    endFeature.setStyle(endStyle);
    // 3. Waypoints (Z-Index: 10 - Highest priority)
    const waypoints = Array.isArray(this.archivedTrack.features?.[0]?.waypoints)
      ? this.archivedTrack.features[0].waypoints
      : [];
    const multiPoint = waypoints
      .filter(p => typeof p.longitude === 'number' && typeof p.latitude === 'number')
      .map(p => [p.longitude, p.latitude]);
    if (multiPoint.length > 0) {
      waypointsFeature.setGeometry(new MultiPoint(multiPoint));
      waypointsFeature.set('waypoints', waypoints); 
      const waypointStyle = this.stylerService.createPinStyle('yellow');
      this.applyZIndex(waypointStyle, 10);
      waypointsFeature.setStyle(waypointStyle);
    }
    // 4. Update Map Source
    const source = this.geography.archivedLayer?.getSource();
    if (source) {
      source.clear();
      const featuresToAdd = [lineFeature, startFeature, endFeature];
      if (multiPoint.length > 0) featuresToAdd.push(waypointsFeature);
      source.addFeatures(featuresToAdd);
    }
  }

  private applyZIndex(style: any, z: number) {
    if (style instanceof Style) {
      style.setZIndex(z);
    } else if (Array.isArray(style)) {
      style.forEach(s => {
        if (s instanceof Style) s.setZIndex(z);
      });
    }
  }

  async editTrack(index: number) {
    const trackToEdit = this.fs.collection[index];
    if (!trackToEdit) return;
    const modalEdit = { 
      name: trackToEdit.name, 
      place: trackToEdit.place, 
      description: trackToEdit.description || '' 
    };
    const popover = await this.popoverCtrl.create({
      component: SaveTrackPopover,
      componentProps: { modalEdit: modalEdit, edit: true },
      cssClass: 'central-popover',
      backdropDismiss: false
    });
    await popover.present();
    const { data } = await popover.onDidDismiss();
    if (data?.action === 'ok') {
      // 1. Actualizar la lista en Functions Service
      this.fs.collection[index].name = data.name;
      this.fs.collection[index].description = data.description;
      await this.fs.storeSet('collection', this.fs.collection);
      // 2. Actualizar el archivo GeoJSON
      if (trackToEdit.date) {
        const storageKey = JSON.stringify(trackToEdit.date);
        const fullTrack = await this.fs.storeGet(storageKey);
        if (fullTrack && fullTrack.features?.[0]) {
          fullTrack.features[0].properties.name = data.name;
          fullTrack.features[0].properties.description = data.description;
          await this.fs.storeSet(storageKey, fullTrack);
          // 3. ¡Sincronización inmediata! Como estamos en ReferenceService,
          // tenemos acceso directo al track que se está dibujando.
          if (this.archivedTrack && this.archivedTrack.features?.[0]) {
            this.archivedTrack.features[0].properties.name = data.name;
            this.archivedTrack.features[0].properties.description = data.description;
          }
        }
      }
      this.fs.displayToast(this.translate.instant('ARCHIVE.TRACK_UPDATED'));
    }
  }
}  