import { Injectable } from '@angular/core';
import Map from 'ol/Map';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import { Track } from 'src/globald';
import { boundingExtent } from 'ol/extent';

@Injectable({
  providedIn: 'root'
})
export class GeographyService {
  
  // --- STATE PROPERTIES ---
  public map?: Map;
  public mapProvider: string = 'MapTiler_outdoor';
  public userLocation: [number, number] | null = null;

  // --- LAYERS ---
  public archivedLayer?: VectorLayer<VectorSource>;
  public currentLayer?: VectorLayer<VectorSource>;
  public searchLayer?: VectorLayer<VectorSource>;
  public locationLayer?: VectorLayer<VectorSource>;

  constructor() { }

  // 1. SET MAP VIEW //////////////////////////////////////////
  async setMapView(track: Track): Promise<void> {
    return new Promise((resolve) => {
      if (!this.map) return resolve();
      
      let boundaries = track.features?.[0]?.bbox;
      const coordinates = track.features?.[0]?.geometry?.coordinates;

      // 🚀 NUEVO: Si no hay bbox pero tenemos coordenadas, lo calculamos al vuelo
      if (!boundaries && coordinates && coordinates.length > 0) {
        boundaries = boundingExtent(coordinates) as [number, number, number, number];
      }

      // Si después de intentar calcularlo seguimos sin nada, abortamos
      if (!boundaries) return resolve();

      // Copia del extent para no mutar el original
      let viewExtent = [...boundaries];

      // Lógica de Área Mínima (Evita zoom infinito en líneas rectas)
      const minVal = 0.002; // Aprox 200m
      const width = viewExtent[2] - viewExtent[0];
      const height = viewExtent[3] - viewExtent[1];

      if (width < minVal || height < minVal) {
        const centerX = (viewExtent[0] + viewExtent[2]) / 2;
        const centerY = (viewExtent[1] + viewExtent[3]) / 2;
        
        const halfSize = Math.max(minVal, Math.max(width, height)) / 2;

        viewExtent = [
          centerX - halfSize, // minX
          centerY - halfSize, // minY
          centerX + halfSize, // maxX
          centerY + halfSize  // maxY
        ];
      }

      this.map.updateSize();

      // Guardamos el ID del timeout para limpiarlo si la animación termina bien
      let fallbackTimeout: any;

      this.map.getView().fit(viewExtent, {
        padding: [50, 50, 50, 50],
        duration: 800,
        maxZoom: 18,
        callback: () => {
          clearTimeout(fallbackTimeout); // Evitamos que el fallback se dispare innecesariamente
          resolve();
        }
      });

      // Fallback de seguridad por si la app pasa a segundo plano
      fallbackTimeout = setTimeout(() => resolve(), 850);
    });
  }

  // 2. CLEAR LAYERS //////////////////////////////////////////
  clearLayers(): void {
    this.currentLayer?.getSource()?.clear();
    this.archivedLayer?.getSource()?.clear();
    this.searchLayer?.getSource()?.clear();
  }

  // 3. UPDATE SIZE ///////////////////////////////////////////
  updateSize(): void {
    if (this.map) {
      // setTimeout es necesario para esperar a que el DOM repinte el contenedor
      setTimeout(() => this.map?.updateSize(), 100);
    }
  }
}