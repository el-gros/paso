import { FunctionsService } from './functions.service'
import { StylerService } from './styler.service'
import { Track } from 'src/globald';
import { GeographyService } from './geography.service';
import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { LineString, Point } from 'ol/geom';

@Injectable({
  providedIn: 'root'
})

  export class PresentService {
  
  private _currentTrack = new BehaviorSubject<Track | undefined>(undefined);
  currentTrack$ = this._currentTrack.asObservable(); // 👈 observable for others to subscribe
  currentColor: string = 'orange';

  constructor(
    private fs: FunctionsService,
    private stylerService: StylerService,
    private geography: GeographyService
  ) { }

  get currentTrack(): Track | undefined {
    return this._currentTrack.value;
  }

  set currentTrack(track: Track | undefined) {
    this._currentTrack.next(track); // 👈 triggers subscribers
  }

    async displayCurrentTrack(currentTrack: any): Promise<void> {
    if (!this.geography.map || !currentTrack || !this.geography.currentLayer) return;
    const source = this.geography.currentLayer.getSource();
    if (!source) return;
    const features = source.getFeatures();
    const coordinates = currentTrack.features?.[0]?.geometry?.coordinates;
    const num = coordinates.length;
    if (!Array.isArray(coordinates) || coordinates.length < 3) return;
    // Update geometries efficiently
    features[0].setGeometry(new LineString(coordinates));
    features[0].setStyle(this.stylerService.setStrokeStyle(this.currentColor));
    features[1].setGeometry(new Point(coordinates[0]));
    features[1].setStyle(this.stylerService.createPinStyle('green'));
    // Adjust map view occasionally
    if ([5, 10, 25].includes(num) || num % 50 === 0) {
      this.fs.setMapView(currentTrack);
    }
  }

}