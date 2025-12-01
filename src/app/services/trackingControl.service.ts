
import { Injectable } from '@angular/core';
import { LocationManagerService } from './location-manager.service';
import { Feature } from 'ol';
import Point from 'ol/geom/Point';
import { Style, Icon } from 'ol/style';
import { Subscription } from 'rxjs';
import { GeographyService } from '../services/geography.service';

@Injectable({ providedIn: 'root' })
export class TrackingControlService {

  private isRunning = false;
  private locationFeature: Feature<Point> | null = null;
  private subscription: Subscription | null = null;

  private readonly ICON_SRC = 'assets/icons/navigate-sharp-blue.svg';
  
  constructor(
    private locationService: LocationManagerService,
    private geography: GeographyService,
  ) {}

  /** -------------------------------------------
   * START: begin sampling & subscribe to updates
   -------------------------------------------- */
  async start() {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log('[LocationTracking] START');

    // Create feature only once, in active (sharp) state
    if (!this.locationFeature) {
      this.locationFeature = new Feature(new Point([0, 0]));
      this.setFeatureStyle(0); // initial rotation = 0
      this.geography.locationLayer?.getSource()?.addFeature(this.locationFeature);
    }

    // Subscribe to LocationService
    this.subscription = this.locationService.latestLocation$.subscribe(loc => {
      if (!loc || !this.locationFeature) return;
      this.locationFeature.getGeometry()!.setCoordinates([loc.longitude, loc.latitude]);
      this.setFeatureStyle(loc.bearing || 0); // rotate icon based on heading
    });
  }

  /** -------------------------------------------
   * STOP: clear sampling, unsubscribe, remove marker
   -------------------------------------------- */
  stop() {
    if (!this.isRunning) return;
    this.isRunning = false;
    console.log('[LocationTracking] STOP');

    if (this.subscription) {
      this.subscription.unsubscribe();
      this.subscription = null;
    }

    // Remove the marker from the map
    if (this.locationFeature) {
      this.geography.locationLayer?.getSource()?.removeFeature(this.locationFeature);
      this.locationFeature = null;
    }
  }

  /** -------------------------------------------
   * SET MARKER STYLE WITH ROTATION
   -------------------------------------------- */
    private setFeatureStyle(bearing: number) {
    if (!this.locationFeature) return;

    // Adjust: Bearing (0° = North) → OL rotation (0° = East)
    const rotation = bearing * (Math.PI / 180);

    this.locationFeature.setStyle(
        new Style({
        image: new Icon({
            src: this.ICON_SRC,
            size: [48, 48],
            scale: 22 / 48,
            rotation: rotation,
            rotateWithView: true,
            crossOrigin: 'anonymous',
        }),
        })
    );
    }

}
