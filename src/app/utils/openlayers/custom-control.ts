import { Control } from 'ol/control';
import { Feature } from 'ol';
import VectorSource from 'ol/source/Vector';
import { Point, Geometry } from 'ol/geom';
import { Style, Circle as CircleStyle, Fill } from 'ol/style';
import VectorLayer from 'ol/layer/Vector';
import { FunctionsService } from '../../services/functions.service'; // Location service
import { global } from '../../../environments/environment';

export class CustomControl extends Control {
  private map: any;
  private vectorSource: VectorSource;
  private vectorLayer: VectorLayer<any>;
  private isActive: boolean = false;
  private fs: FunctionsService;
  private updateInterval: any; // To store the interval ID

  constructor(fs: FunctionsService) {
    const element = document.createElement('div');
    element.className = 'ol-unselectable ol-control custom-control';
    element.style.display = 'flex';
    element.style.gap = '10px'; // Add some spacing between the buttons

    // Create the activate button
    const activateButton = document.createElement('button');
    activateButton.innerHTML = ''; // No text, just a circle
    activateButton.style.width = '30px';
    activateButton.style.height = '30px';
    activateButton.style.borderRadius = '50%';
    activateButton.style.backgroundColor = 'rgba(0, 60, 136, 0.7)'; // Bluish circle
    activateButton.style.border = 'none';
    activateButton.style.cursor = 'pointer';

    // Create the deactivate button
    const deactivateButton = document.createElement('button');
    deactivateButton.innerHTML = 'X'; // "X" for deactivation
    deactivateButton.style.width = '30px';
    deactivateButton.style.height = '30px';
    deactivateButton.style.borderRadius = '50%';
    deactivateButton.style.backgroundColor = 'rgba(136, 0, 0, 0.7)'; // Red circle
    deactivateButton.style.border = 'none';
    deactivateButton.style.color = 'white';
    deactivateButton.style.fontWeight = 'bold';
    deactivateButton.style.fontSize = '16px';
    deactivateButton.style.cursor = 'pointer';

    // Append buttons to the container
    element.appendChild(activateButton);
    element.appendChild(deactivateButton);

    // Initialize the Control class
    super({
      element: element,
      target: undefined,
    });

    this.fs = fs;

    this.vectorSource = new VectorSource<Feature<Geometry>>({});
    this.vectorLayer = new VectorLayer({
      source: this.vectorSource,
      style: this.createCircleStyle('rgba(0, 60, 136, 0.7)'),
    });

    // Add event listeners to buttons
    activateButton.addEventListener('click', () => this.activateControl(activateButton));
    deactivateButton.addEventListener('click', () => this.deactivateControl(activateButton));
  }

  // 1. ACTIVATE CONTROL /////////////////////////////
  private async activateControl(activateButton: HTMLButtonElement) {
    if (this.isActive) return; // Prevent reactivation if already active
    // Disable the activate button
    activateButton.disabled = true;
    // get coordinates
    const coordinates = await this.fs.getCurrentPosition();
    // center map
    this.updateLocation(coordinates);
    // create layer (if it does not exist)
    if (!this.map.getLayers().getArray().includes(this.vectorLayer)) {
      this.map.addLayer(this.vectorLayer);
    }
    // start location updates
    this.startLocationUpdates();
    this.isActive = true;
    global.locationUpdate = true; // Update the global variable
  }

  // 2. DEACTIVATE CONTROL ////////////////////////////////
  private deactivateControl(activateButton: HTMLButtonElement) {
    if (!this.isActive) return; // Prevent deactivation if already inactive
    // Remove layer and source
    this.vectorSource.clear();
    if (this.map.getLayers().getArray().includes(this.vectorLayer)) {
      this.map.removeLayer(this.vectorLayer);
    }
    // Stop location updates
    this.stopLocationUpdates();
    // Re-enable the activate button
    activateButton.disabled = false;
    this.isActive = false;
    global.locationUpdate = false; // Update the global variable
  }

  // 3. CREATE CIRCLE STYLE ///////////////////////////////
  private createCircleStyle(color: string): Style {
    return new Style({
      image: new CircleStyle({
        radius: 10,
        fill: new Fill({
          color: color,
        }),
      }),
    });
  }

  // 4. CENTER MAP //////////////////////////////// 
  private updateLocation(coordinates: [number, number]) {
    this.vectorSource.clear();
    // Define a point feature
    const feature = new Feature({
      geometry: new Point(coordinates),
    });
    // Assign style to feature
    feature.setStyle(
      new Style({
        image: new CircleStyle({
          radius: 10,
          fill: new Fill({
            color: 'rgba(0, 60, 136, 0.7)',
          }),
        }),
      })
    );
    // Add feature to source
    this.vectorSource.addFeature(feature);
    // Set map view
    this.map.getView().setCenter(coordinates);
  }
  
  // 5. START LOCATION UPDATES /////////////////////////
  private startLocationUpdates() {
    this.updateInterval = setInterval(async () => {
      const coordinates = await this.fs.getCurrentPosition();
      this.updateLocation(coordinates);
    }, 5000); // Update every 5 seconds
  }

  // 6. STOP LOCATION UPDATES //////////////////////////
  private stopLocationUpdates() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  override setMap(map: any): void {
    super.setMap(map);
    this.map = map;
    if (!this.map.getLayers().getArray().includes(this.vectorLayer)) {
      this.map.addLayer(this.vectorLayer);
    }
  }
}
