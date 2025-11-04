/**
 * CustomControl is an OpenLayers control that provides a single toggle button
 * to activate or deactivate real-time location tracking on the map.
 * - Blue circle = inactive
 * - Sand clock = waiting for GPS fix
 * - Red circle = active
 *
 * When activated, it centers the map on the user's current position and displays
 * a styled marker, updating the location at regular intervals.
 *
 * @extends Control
 */

import { Control } from 'ol/control';
import { Feature } from 'ol';
import VectorSource from 'ol/source/Vector';
import { Point, Geometry } from 'ol/geom';
import { Style, Circle as CircleStyle, Fill } from 'ol/style';
import VectorLayer from 'ol/layer/Vector';
import { MapService } from '../../services/map.service';
import { FunctionsService } from '../../services/functions.service';

export class CustomControl extends Control {
  private vectorSource: VectorSource;
  private vectorLayer: VectorLayer<any>;
  private isActive: boolean = false;
  private updateInterval: any; // interval ID
  private button: HTMLButtonElement;

  constructor(
    private mapService: MapService,
    public fs: FunctionsService
  ) {
    const element = document.createElement('div');
    element.className = 'ol-unselectable ol-control custom-control';

    // Toggle button
    const button = document.createElement('button');
    button.style.width = '30px';
    button.style.height = '30px';
    button.style.borderRadius = '50%';
    button.style.border = 'none';
    button.style.cursor = 'pointer';
    button.style.fontSize = '16px';
    button.style.fontWeight = 'bold';
    element.appendChild(button);

    super({
      element: element,
      target: undefined,
    });

    this.button = button;
    this.setButtonBlue();

    this.vectorSource = new VectorSource<Feature<Geometry>>({});
    this.vectorLayer = new VectorLayer({
      source: this.vectorSource,
      style: this.createCircleStyle('rgba(0, 60, 136, 0.7)'),
    });

    // Toggle behavior
    button.addEventListener('click', () => {
      if (this.isActive) {
        this.deactivate();
      } else {
        this.activate();
      }
    });
  }

  // ------------------------
  // Activate control
  // ------------------------
  private async activate() {
    if (!this.fs.map || this.isActive) return;

    this.setButtonSpinner();

    // Promise.race to wait for GPS or timeout
    const timeout = new Promise<null>(resolve =>
      setTimeout(() => resolve(null), 8000) // 8s max
    );

    const coordinates = await Promise.race([
      this.fs.getCurrentPosition(true, 5000),
      timeout,
    ]);

    if (!coordinates) {
      // Failed → back to blue
      this.setButtonBlue();
      return;
    }

    // Update location & layer
    this.updateLocation(coordinates);

    if (!this.fs.map.getLayers().getArray().includes(this.vectorLayer)) {
      this.fs.map.addLayer(this.vectorLayer);
    }

    this.startLocationUpdates();
    this.isActive = true;
    this.setButtonRed();
  }

  // ------------------------
  // Deactivate control
  // ------------------------
  private deactivate() {
    if (!this.fs.map || !this.isActive) return;

    this.vectorSource.clear();

    if (this.fs.map.getLayers().getArray().includes(this.vectorLayer)) {
      this.fs.map.removeLayer(this.vectorLayer);
    }

    this.stopLocationUpdates();
    this.isActive = false;
    this.setButtonBlue();
  }

  // ------------------------
  // Helpers
  // ------------------------
  private createCircleStyle(color: string): Style {
    return new Style({
      image: new CircleStyle({
        radius: 15,
        fill: new Fill({ color }),
      }),
    });
  }

  private updateLocation(coordinates: [number, number]) {
    if (!this.fs.map) return;

    this.vectorSource.clear();

    const feature = new Feature({
      geometry: new Point(coordinates),
    });

    feature.setStyle(this.createCircleStyle('rgba(0, 60, 136, 0.7)'));
    this.vectorSource.addFeature(feature);

    this.fs.map.getView().setCenter(coordinates);
  }

  private startLocationUpdates() {
    this.stopLocationUpdates(); // safety: clear old interval
    this.updateInterval = setInterval(async () => {
      const coordinates = await this.fs.getCurrentPosition(true, 5000);
      if (coordinates) this.updateLocation(coordinates);
    }, 5000);
  }

  private stopLocationUpdates() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  // ------------------------
  // Button styling
  // ------------------------
  private setButtonBlue() {
    this.button.innerHTML = '';
    this.button.style.backgroundColor = 'rgba(0, 60, 136, 0.7)';
    this.button.style.color = 'white';
  }

  private setButtonRed() {
    this.button.innerHTML = 'X';
    this.button.style.backgroundColor = 'rgba(136, 0, 0, 0.7)';
    this.button.style.color = 'white';
  }

  private setButtonSpinner() {
    this.button.innerHTML = '<span class="sandclock">⏳</span>';
    this.button.style.backgroundColor = 'gray';
    this.button.style.color = 'white';
  }

  // ------------------------
  // Ensure layer is attached
  // ------------------------
  override setMap(map: any): void {
    super.setMap(map);
    this.fs.map = map;
  }
}
