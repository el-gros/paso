import Map from 'ol/Map';
import { Injectable } from '@angular/core';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import { Track } from 'src/globald';



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
 async setMapView(track: Track): Promise<void> {
  return new Promise((resolve) => {
    // 1. Validaciones rápidas
    if (!this.map) { resolve(); return; }
    
    // Acceso seguro a bbox (usando optional chaining)
    const boundaries = track.features?.[0]?.bbox;
    if (!boundaries) { resolve(); return; }

    // 2. Copia del extent para no mutar el original
    let viewExtent = [...boundaries];

    // 3. Lógica de Área Mínima (CORREGIDA)
    // Usamos el cálculo manual para no depender de imports si no quieres, 
    // pero cambiamos && por || para cubrir líneas rectas.
    const minVal = 0.002; // Aprox 200m en el ecuador
    const width = viewExtent[2] - viewExtent[0];
    const height = viewExtent[3] - viewExtent[1];

    // MEJORA: Usamos OR (||). Si es muy estrecho O muy bajo, expandimos.
    if (width < minVal || height < minVal) {
      const centerX = (viewExtent[0] + viewExtent[2]) / 2;
      const centerY = (viewExtent[1] + viewExtent[3]) / 2;
      
      // Expandimos ambos lados para garantizar el cuadro mínimo
      // Usamos Math.max para asegurar que si una dimensión ya es grande, no la achicamos
      const halfSize = Math.max(minVal, Math.max(width, height)) / 2;

      viewExtent = [
        centerX - halfSize, // minX
        centerY - halfSize, // minY
        centerX + halfSize, // maxX
        centerY + halfSize  // maxY
      ];
    }

    // 4. Actualizar tamaño (necesario si el contenedor cambió de tamaño recientemente)
    this.map.updateSize();

    // 5. Ajustar vista con Callback nativo
    this.map.getView().fit(viewExtent, {
      padding: [50, 50, 50, 50],
      duration: 800,
      maxZoom: 18, // Seguridad extra: nunca hacer zoom más allá del nivel calle
      callback: () => {
        // Esta función se ejecuta cuando la animación termina exitosamente
        resolve();
      }
    });

    // 6. Fallback de seguridad (por si la app pasa a segundo plano y la animación se pausa)
    setTimeout(() => resolve(), 850);
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