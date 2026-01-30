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
  
  archivedLayer?: VectorLayer<VectorSource>;
  currentLayer?: VectorLayer<VectorSource>;
  searchLayer?: VectorLayer<VectorSource>;
  locationLayer?: VectorLayer<VectorSource>;
  mapProvider: string = 'MapTiler_outdoor';
  public userLocation: [number, number] | null = null;
  map: Map | undefined;

  constructor() { }

  // 1. SET MAP VIEW
  async setMapView(track: any): Promise<void> {
    return new Promise((resolve) => {
      if (!this.map) { resolve(); return; }
      
      const boundaries = track.features[0].bbox;
      if (!boundaries) { resolve(); return; }
      
      let viewExtent = [...boundaries];
      
      // Lógica de área mínima para evitar zooms excesivos en puntos únicos
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
      
      this.map.getView().fit(viewExtent, {
        padding: [50, 50, 50, 50], 
        duration: 800 // Aumentado un poco para una transición más suave
      });

      this.map.once('rendercomplete', () => {
        resolve();
      });
      
      // Fallback por si el evento rendercomplete no dispara
      setTimeout(resolve, 1000);
    });
  }

  // 2. LIMPIAR CAPAS (Útil al navegar entre rutas)
  clearLayers() {
    this.currentLayer?.getSource()?.clear();
    this.archivedLayer?.getSource()?.clear();
    this.searchLayer?.getSource()?.clear();
  }

  // 3. ACTUALIZAR TAMAÑO (Llamar tras cambios de orientación o popovers)
  updateSize() {
    if (this.map) {
      setTimeout(() => this.map?.updateSize(), 100);
    }
  }
}