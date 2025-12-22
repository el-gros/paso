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

  constructor(
  ) { }

  setMapView(track: any) {
    if (!this.map) return;
    const boundaries = track.features[0].bbox;
    if (!boundaries) return;
    // Set a minimum area
    const minVal = 0.002;
    if ((boundaries[2] - boundaries[0] < minVal) && (boundaries[3] - boundaries[1] < minVal)) {
      const centerX = 0.5 * (boundaries[0] + boundaries[2]);
      const centerY = 0.5 * (boundaries[1] + boundaries[3]);
      boundaries[0] = centerX - minVal / 2;
      boundaries[2] = centerX + minVal / 2;
      boundaries[1] = centerY - minVal / 2;
      boundaries[3] = centerY + minVal / 2;
    }
    // map view
    setTimeout(() => {
      this.map?.getView().fit(boundaries, {
        size: this.map.getSize(),
        padding: [50, 50, 50, 50],
        duration: 100  // Optional: animation duration in milliseconds
      });
    })
  }

}  
