import { Injectable } from '@angular/core';
import Map from 'ol/Map';
import Feature from 'ol/Feature';
import { Point } from 'ol/geom';
import { GeoJSON } from 'ol/format';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import { Track, LocationResult } from '../../globald';
import { boundingExtent } from 'ol/extent';
import { StylerService } from './styler.service';

@Injectable({
  providedIn: 'root'
})
export class GeographyService {
  
  // ==========================================================================
  // 1. ESTADO DEL MAPA
  // ==========================================================================

  /** Instancia principal del mapa OpenLayers. */
  public map?: Map;
  /** Proveedor de mapas actualmente seleccionado (ej. 'MapTiler_outdoor'). */
  public mapProvider: string = 'MapTiler_outdoor';
  /** Coordenadas de la ubicación actual del usuario. */
  public userLocation: [number, number] | null = null;

  // ==========================================================================
  // 2. CAPAS DEL MAPA
  // ==========================================================================

  /** Capa vectorial para mostrar tracks archivados o de referencia. */
  public archivedLayer?: VectorLayer<VectorSource>;
  /** Capa vectorial para mostrar el track que se está grabando actualmente. */
  public currentLayer?: VectorLayer<VectorSource>;
  /** Capa vectorial para mostrar los resultados de búsqueda. */
  public searchLayer?: VectorLayer<VectorSource>;
  /** Capa vectorial para mostrar la ubicación actual del usuario (flecha GPS). */
  public locationLayer?: VectorLayer<VectorSource>;

  constructor(private styler: StylerService) { }
  /**
   * Muestra un resultado de búsqueda en el mapa, ajustando la vista y el estilo.
   */
  public showLocationOnMap(location: LocationResult): void {
    const source = this.searchLayer?.getSource();
    if (!source) return;

    source.clear();
    const geojsonFormat = new GeoJSON();
    const features = geojsonFormat.readFeatures(location.geojson);
    
    if (features.some(f => f.getGeometry()?.getType().includes('Polygon'))) {
      features.push(new Feature(new Point([location.lon, location.lat])));
    }

    source.addFeatures(features);
    this.searchLayer?.setStyle((f) => this.styler.getSearchStyle(f));

    const extent = [location.boundingbox[2], location.boundingbox[0], location.boundingbox[3], location.boundingbox[1]];
    this.map?.getView().fit(extent, { duration: 800, padding: [50, 50, 50, 50] });
  }
  async setMapView(track: Track): Promise<void> {
  /**
   * Ajusta la vista del mapa para encuadrar un track completo.
   * Calcula el Bounding Box si no está definido y aplica un padding.
   * @param track El objeto `Track` a encuadrar en la vista.
   */
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

  /**
   * Limpia todas las capas vectoriales del mapa (track actual, archivado y búsqueda).
   */
  clearLayers(): void {
    this.currentLayer?.getSource()?.clear();
    this.archivedLayer?.getSource()?.clear();
    this.searchLayer?.getSource()?.clear();
  }

  /**
   * Fuerza una actualización del tamaño del mapa.
   * Útil cuando el contenedor del mapa cambia de dimensiones (ej. rotación de pantalla, cambio de pestaña).
   */
  updateSize(): void {
    if (this.map) {
      // setTimeout es necesario para esperar a que el DOM repinte el contenedor
      setTimeout(() => this.map?.updateSize(), 100);
    }
  }
}