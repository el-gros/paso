import { Injectable } from '@angular/core';
import Map from 'ol/Map';
import Feature from 'ol/Feature';
import { transformExtent } from 'ol/proj';
import { Circle, Point } from 'ol/geom';
import { GeoJSON } from 'ol/format';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import { boundingExtent } from 'ol/extent';
import { StylerService } from './styler.service';
import { Track, PLACE_CATEGORIES, LocationResult } from '../../globald';
import { Fill, Stroke, Style } from 'ol/style';
import { Icon, Circle as CircleStyle } from 'ol/style';

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
  /** Capa vectorial para mostrar los lugares guardados en el archivo. */
  public placesLayer?: VectorLayer<VectorSource>;
  /** Capa vectorial para mostrar la ubicación actual del usuario (flecha GPS). */
  public locationLayer?: VectorLayer<VectorSource>;

  constructor(private styler: StylerService) { }

  /**
   * Transforma un extent (bounding box) entre dos sistemas de proyección.
   */
  public transformExtent(extent: number[], source: string, destination: string): number[] {
    return transformExtent(extent, source, destination);
  }

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

    // Primero nos aseguramos de que haya un boundingbox. Si no lo hay, creamos uno falso usando su latitud y longitud.
    const bbox = location.boundingbox && location.boundingbox.length >= 4 
      ? location.boundingbox 
      : [location.lat, location.lat, location.lon, location.lon];

    const extent = [bbox[2], bbox[0], bbox[3], bbox[1]];
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

  // ==========================================================================
  // MÉTODOS PARA LUGARES ARCHIVADOS
  // ==========================================================================

  /**
   * Refresca la capa de lugares guardados dibujando solo aquellos marcados como visibles.
   * @param places Colección de lugares (normalmente fs.placesCollection)
   */
  public refreshPlacesLayer(places: LocationResult[]) {
    if (!this.placesLayer) return;
    
    const source = this.placesLayer.getSource();
    if (!source) return;

    // 1. Limpiamos la capa para evitar duplicados
    source.clear();

    // 2. Filtramos: Solo los que son explícitamente visibles
    // Usamos !== false para que, si por error es 'undefined', se muestre por defecto
    const visiblePlaces = places.filter(p => p.visible !== false);

    const features = visiblePlaces.map(place => {
      const feature = new Feature({
        geometry: new Point([place.lon, place.lat]),
        name: place.name,
        data: place // Guardamos el objeto original para el click
      });

      // 3. Obtenemos la categoría para definir el estilo
      const catId = (place.categories && place.categories.length > 0) ? place.categories[0] : 'other';
      const catDef = PLACE_CATEGORIES.find(c => c.id === catId);
      
      const pinColor = catDef ? catDef.color : 'medium'; 
      const iconName = catDef ? catDef.icon : 'location';

      // 4. Aplicamos el estilo de Pin profesional del StylerService
      // IMPORTANTE: Revisa si tu variable es 'styler' o 'stylerService'
      feature.setStyle(this.styler.createIconPinStyle(pinColor, iconName));
      
      return feature;
    });

    // 5. Añadimos todos los pines de una vez para mejorar el rendimiento
    source.addFeatures(features);
  }

  /**
   * Centra la vista del mapa en unas coordenadas específicas
   * @param lon Longitud
   * @param lat Latitud
   * @param zoom Nivel de zoom (opcional)
   */
  public centerMap(lon: number, lat: number, zoom: number = 15) {
    if (this.map) {
      const view = this.map.getView();
      view.animate({
        center: [lon, lat],
        zoom: zoom,
        duration: 1000 // Animación de 1 segundo para que sea suave
      });
    }
  }
}