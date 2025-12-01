import { Feature } from 'ol';
import { FunctionsService } from './functions.service'
import { StylerService } from './styler.service'
import { LineString, MultiPoint, Point } from 'ol/geom';
import { Track } from 'src/globald';
import { GeographyService } from './geography.service';
import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})

  export class ReferenceService {
  
    archivedTrack: Track | undefined = undefined;
    archivedColor: string = 'green';

  constructor(
    private fs: FunctionsService,
    private stylerService: StylerService,
    private geography: GeographyService
  ) { }

  async displayArchivedTrack(): Promise<void> {
    if (!this.geography.map || !this.archivedTrack?.features?.length) return;
    const coordinates = this.archivedTrack.features?.[0]?.geometry?.coordinates;
    if (!Array.isArray(coordinates) || coordinates.length === 0) return;
    var features = [new Feature(), new Feature(), new Feature(), new Feature()];
    // Line
    features[0].setGeometry(new LineString(coordinates));
    features[0].setStyle(this.stylerService.setStrokeStyle(this.archivedColor));
    // Start point
    features[1].setGeometry(new Point(coordinates[0]));
    features[1].setStyle(this.stylerService.createPinStyle('green'));
    // End point
    features[2].setGeometry(new Point(coordinates.at(-1)!));
    features[2].setStyle(this.stylerService.createPinStyle('red'));
    // Optional waypoints
    const waypoints = Array.isArray(this.archivedTrack.features?.[0]?.waypoints)
      ? this.archivedTrack.features[0].waypoints
      : [];
    const multiPoint = waypoints
      .filter(p => typeof p.longitude === 'number' && typeof p.latitude === 'number')
      .map(p => [p.longitude, p.latitude]);
    if (multiPoint.length > 0) {
      features[3].setGeometry(new MultiPoint(multiPoint));
      features[3].set('waypoints', waypoints);
      features[3].setStyle(this.stylerService.createPinStyle('yellow'));
    }
    this.geography.archivedLayer?.getSource()?.clear();
    this.geography.archivedLayer?.getSource()?.addFeatures(features);
    this.fs.setMapView(this.archivedTrack);
  }

}  