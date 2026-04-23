import { Injectable } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { Feature } from 'ol';
import { LineString, Point } from 'ol/geom';
import { Coordinate } from 'ol/coordinate';

import { FunctionsService } from './functions.service';
import { GeographyService } from './geography.service';
import { StylerService } from './styler.service';
import { LocationManagerService } from './location-manager.service';
import { ReferenceService } from './reference.service';
import { PresentService } from './present.service';
import { Track, TrackDefinition } from '../../globald';

@Injectable({ providedIn: 'root' })
export class MapTracksService {

  constructor(
    private fs: FunctionsService,
    private geography: GeographyService,
    private styler: StylerService,
    private translate: TranslateService,
    private location: LocationManagerService,
    private reference: ReferenceService,
    private present: PresentService
  ) {}

  async displayAllTracks() {
    if (!this.geography.map || !this.fs.collection.length || !this.geography.archivedLayer) return;

    try {
      const keys = this.fs.collection
        .filter(item => item?.date)
        .map(item => new Date(item.date!).toISOString());

      const rawTracks = await Promise.all(keys.map(key => this.fs.storeGet(key) as Promise<Track>));
      const source = this.geography.archivedLayer.getSource();
      if (!source) return;
      
      source.clear();
      const featuresToAdd: Feature[] = [];

      rawTracks.forEach((track, i) => {
        if (!track) return;
        const item = this.fs.collection[i];
        const coords = track.features?.[0]?.geometry?.coordinates;

        if (coords?.length) {
          const line = new Feature({ geometry: new LineString(coords) });
          line.setProperties({ type: 'archived_line', date: item.date });
          line.setStyle(this.styler.setStrokeStyle('black'));
          
          const start = new Feature({ geometry: new Point(coords[0]) });
          start.setProperties({ type: 'archived_start', date: item.date });
          start.setStyle(this.styler.createPinStyle('green'));

          const end = new Feature({ geometry: new Point(coords[coords.length - 1]) });
          end.setProperties({ type: 'archived_end', date: item.date });
          end.setStyle(this.styler.createPinStyle('red'));

          featuresToAdd.push(line, start, end);
        }
      });

      if (!featuresToAdd.length) {
        this.fs.displayToast('ARCHIVE.EMPTY_TRACKS', 'error');
        return;
      }

      source.addFeatures(featuresToAdd);
      setTimeout(() => this.centerAllTracks(), 150);
    } catch (error) {
      this.fs.displayToast('ARCHIVE.LOADING_ERROR', 'error');
    }
  }

  async centerAllTracks() {
    const pos = await this.location.getCurrentPosition();
    if (pos && this.geography.map) {
      this.geography.map.getView().animate({ center: pos, zoom: 8, duration: 1000 });
    }
  }

  updateColors() {
    const apply = (layer: any, color: string) => {
      layer?.getSource()?.getFeatures().forEach((f: any) => {
        if (f.getGeometry()?.getType() === 'LineString') {
          f.setStyle(this.styler.setStrokeStyle(color));
        }
      });
    };
    apply(this.geography.currentLayer, this.present.currentColor);
    apply(this.geography.archivedLayer, this.reference.archivedColor);
    this.geography.map?.render();
  }
}