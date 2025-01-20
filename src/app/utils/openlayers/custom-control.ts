import { Control } from 'ol/control';
import { Feature } from 'ol';
import { Vector as VectorSource } from 'ol/source';
import { Point } from 'ol/geom';
import { Style, Circle as CircleStyle, Fill } from 'ol/style';
import { Vector as VectorLayer } from 'ol/layer';
import { FunctionsService } from '../../services/functions.service'; // Location service

export class CustomControl extends Control {
  private map: any;
  private vectorSource: VectorSource;
  private vectorLayer: VectorLayer<Feature>;
  private isActive: boolean = false;
  private fs: FunctionsService;

  constructor(fs: FunctionsService) {
    // Create the button element
    const button = document.createElement('button');
    button.innerHTML = ''; // Empty initially
    button.style.width = '20px';
    button.style.height = '20px';
    button.style.borderRadius = '50%';
    button.style.backgroundColor = 'blue';
    button.style.border = 'none';
    button.style.cursor = 'pointer';
    button.style.display = 'flex';
    button.style.justifyContent = 'center';
    button.style.alignItems = 'center';
    button.style.color = 'white';
    button.style.fontWeight = 'bold';
    button.style.fontSize = '14px';

    // Create a container div for the button
    const element = document.createElement('div');
    element.className = 'ol-unselectable ol-control custom-control';
    element.appendChild(button);

    // Initialize the Control class
    super({
      element: element,
      target: undefined,
    });

    this.fs = fs;

    // Initialize the vector source and vector layer
    this.vectorSource = new VectorSource();
    this.vectorLayer = new VectorLayer({
      source: this.vectorSource,
      style: this.createCircleStyle('blue'),
    });

    // Add the click event listener to the button
    button.addEventListener('click', () => this.handleControlClick());
  }

  private async handleControlClick() {
    const button = this.element.querySelector('button') as HTMLButtonElement;

    if (this.isActive) {
      // Deactivate: Clear the circle and reset the button
      this.vectorSource.clear();
      button.innerHTML = '';
      button.style.backgroundColor = 'blue';
    } else {
      // Activate: Add a circle and update the button
      const coordinates = await this.fs.getCurrentPosition(); // Assuming lonlat coordinates

      const feature = new Feature(new Point(coordinates));
      feature.setStyle(
        new Style({
          image: new CircleStyle({
            radius: 10,
            fill: new Fill({
              color: 'blue',
            }),
          }),
        })
      );

      this.vectorSource.addFeature(feature);

      if (!this.map.getLayers().getArray().includes(this.vectorLayer)) {
        this.map.addLayer(this.vectorLayer);
      }

      this.map.getView().setCenter(coordinates);
      this.map.getView().setZoom(12);

      button.innerHTML = 'X';
      button.style.backgroundColor = 'blue';
    }

    this.isActive = !this.isActive;
  }

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

  override setMap(map: any): void {
    super.setMap(map);
    this.map = map;

    // Add the vector layer to the map if not already added
    if (!this.map.getLayers().getArray().includes(this.vectorLayer)) {
      this.map.addLayer(this.vectorLayer);
    }
  }
}
