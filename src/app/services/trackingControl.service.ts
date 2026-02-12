
import { Injectable } from '@angular/core';
import { LocationManagerService } from './location-manager.service';
import { Feature } from 'ol';
import Point from 'ol/geom/Point';
import { Style, Icon } from 'ol/style';
import { Subscription, BehaviorSubject } from 'rxjs';
import { GeographyService } from './geography.service';

@Injectable({ providedIn: 'root' })
export class TrackingControlService {
  private isRunning = new BehaviorSubject<boolean>(false);
  public isRunning$ = this.isRunning.asObservable();

  private locationFeature: Feature<Point> | null = null;
  private subscription: Subscription | null = null;
  private shouldCenterOnNextUpdate = false;

  // 🔹 Path compartido para que el botón y el marcador sean idénticos
  public readonly arrowPath = "M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z"; 
  private readonly markerColor = "#3880ff"; 

  constructor(
    private location: LocationManagerService,
    private geography: GeographyService,
  ) {}

  async start() {
    if (this.isRunning.value) return;
    this.isRunning.next(true);
    this.shouldCenterOnNextUpdate = true;
    this.ensureMarkerCreated();

    this.subscription = this.location.latestLocation$.subscribe((loc: any) => {
      if (!loc || !this.locationFeature) return;
      const coords = [loc.longitude, loc.latitude];
      this.locationFeature.getGeometry()!.setCoordinates(coords);
      this.setFeatureStyle(loc.bearing || 0);

      if (this.shouldCenterOnNextUpdate) {
        this.geography.map?.getView().animate({ center: coords, zoom: 16, duration: 800 });
        this.shouldCenterOnNextUpdate = false;
      }
    });
  }

  stop() {
    this.isRunning.next(false);
    
    if (this.subscription) {
      this.subscription.unsubscribe();
      this.subscription = null;
    }

    if (this.locationFeature) {
      // Esto hace que el marcador desaparezca físicamente del mapa
      this.geography.locationLayer?.getSource()?.removeFeature(this.locationFeature);
      this.locationFeature = null; // Limpiamos la referencia
    }
  }

  private ensureMarkerCreated() {
    const source = this.geography.locationLayer?.getSource();
    if (!source || this.locationFeature) return;
    this.locationFeature = new Feature(new Point([0, 0]));
    source.addFeature(this.locationFeature);
    this.setFeatureStyle(0);
  }

  private setFeatureStyle(bearing: number) {
    if (!this.locationFeature) return;
    const markerSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24"><path fill="${this.markerColor}" d="${this.arrowPath}"></path></svg>`;
    const svgUrl = 'data:image/svg+xml;base64,' + btoa(markerSvg);
    this.locationFeature.setStyle(new Style({
      image: new Icon({
        src: svgUrl,
        anchor: [0.5, 0.5],
        rotation: bearing * (Math.PI / 180),
        rotateWithView: true,
        scale: 1.2,
        crossOrigin: 'anonymous'
      })
    }));
  }

  public getIsRunning(): boolean {
    return this.isRunning.value;
  }

}