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
    const trackToEdit = this.fs.collection[index];
    if (!trackToEdit) return;

    const modalEdit = { 
      name: trackToEdit.name, 
      description: trackToEdit.description || '' 
    };

    const popover = await this.popoverCtrl.create({
      component: SaveTrackPopover,
      componentProps: { modalEdit, edit: true },
      backdropDismiss: true,
      cssClass: 'glass-island-wrapper',
      translucent: true,
    });

    await popover.present();
    const { data } = await popover.onDidDismiss();

    if (data?.action === 'ok') {
      // Update Collection
      this.fs.collection[index].name = data.name;
      this.fs.collection[index].description = data.description;
      await this.fs.storeSet('collection', this.fs.collection);

      // Update specific Storage entry
      if (trackToEdit.date) {
        const storageKey = trackToEdit.date.toISOString();
        const fullTrack = await this.fs.storeGet(storageKey);
        
        if (fullTrack?.features?.[0]) {
          fullTrack.features[0].properties.name = data.name;
          fullTrack.features[0].properties.description = data.description;
          await this.fs.storeSet(storageKey, fullTrack);

          // Sync current view if this is the track being displayed
          if (this.archivedTrack?.features?.[0]) {
            const props = this.archivedTrack.features[0].properties;
            props.name = data.name;
            props.description = data.description;
          }
        }
      }
      this.fs.displayToast(this.translate.instant('ARCHIVE.TRACK_UPDATED'), 'success');
    }
  }
}