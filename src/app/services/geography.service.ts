import Map from 'ol/Map';
import { useGeographic } from 'ol/proj';
import { Injectable } from '@angular/core';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';

useGeographic();

@Injectable({
  providedIn: 'root'
})

export class GeographyService {
  
  map: Map | undefined;
  archivedLayer?: VectorLayer<VectorSource>;
  currentLayer?: VectorLayer<VectorSource>;
  searchLayer?: VectorLayer<VectorSource>;
  locationLayer?: VectorLayer<VectorSource>;
  mapProvider: string ='MapTiler_outdoor';
  public userLocation: [number, number] | null = null;

  constructor(
  ) { }

  // 1. SET MAP VIEW
  async setMapView(track: any): Promise<void> {
    return new Promise((resolve) => {
      if (!this.map) { resolve(); return; }
      const boundaries = track.features[0].bbox;
      if (!boundaries) { resolve(); return; }
      let viewExtent = [...boundaries];
      // Lógica de área mínima
      const minVal = 0.002;
      if ((viewExtent[2] - viewExtent[0] < minVal) && (viewExtent[3] - viewExtent[1] < minVal)) {
        const centerX = 0.5 * (viewExtent[0] + viewExtent[2]);
        const centerY = 0.5 * (viewExtent[1] + viewExtent[3]);
        viewExtent[0] = centerX - (minVal / 2);
        viewExtent[2] = centerX + (minVal / 2);
        viewExtent[1] = centerY - (minVal / 2);
        viewExtent[3] = centerY + (minVal / 2);
      }
      this.map.updateSize();
      // Usamos el fit sin la propiedad inexistente
      this.map.getView().fit(viewExtent, {
        padding: [50, 50, 50, 50], 
        duration: 200
      });
      this.map.once('rendercomplete', () => {
        resolve();
      });
      setTimeout(resolve, 500);
    });
  }

}  
