import { Injectable, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { SnapToTrailService } from './snapToTrail.service';

@Injectable({
  providedIn: 'root'
})
export class SmartRouteBuilderService {
  private translate = inject(TranslateService);
  private snapToTrailService = inject(SnapToTrailService);

  // ==========================================
  // 1. ACCIONES PÚBLICAS
  // ==========================================

  /**
   * Genera un título y descripción inteligente basados en los puntos geográficos de la ruta.
   */
  public async generateWikilocStyleTexts(feature: any): Promise<{ title: string, description: string }> {
    const coords = feature.geometry?.coordinates;
    const dataArray = feature.geometry?.properties?.data;

    if (!coords || coords.length < 2 || !dataArray) return { title: '', description: '' };

    const startIndex = 0;
    const endIndex = coords.length - 1;
    const startCoord = coords[startIndex];
    const endCoord = coords[endIndex];

    const distanceStartEnd = this.snapToTrailService.calculateHaversineDistance(
      { lat: startCoord[1], lng: startCoord[0] },
      { lat: endCoord[1], lng: endCoord[0] }
    );
    const isCircular = distanceStartEnd < 200; 
    
    // 1. Obtener la info del punto de inicio (Barrio y Ciudad) con el nuevo método
    const startInfo = await this.getPlaceInfo(startCoord[1], startCoord[0]);
    let targetInfo = { local: '', city: '' };

    // 2. Determinar el destino real (el final si es lineal, el punto más lejano si es circular)
    if (isCircular) {
      const furthestCoord = this.getFurthestPoint(coords, startCoord);
      targetInfo = await this.getPlaceInfo(furthestCoord[1], furthestCoord[0]);
      
      // Pequeño salvavidas: si el punto más lejano está en el mismo barrio exacto, 
      // intentamos añadir algo de contexto para que no diga "Ruta de Gràcia a Gràcia"
      if (startInfo.local === targetInfo.local) {
         targetInfo.local = this.translate.instant('RECORD.SURROUNDINGS'); // Ej: "los alrededores"
      }
    } else {
      targetInfo = await this.getPlaceInfo(endCoord[1], endCoord[0]);
    }

    // 3. Lógica para decidir qué título usar (Urbano vs Naturaleza/Interurbano)
    let title = '';
    const sameCity = startInfo.city && targetInfo.city && startInfo.city === targetInfo.city;

    if (isCircular) {
      title = sameCity
        ? this.translate.instant('RECORD.URBAN_CIRCULAR_ROUTE', { city: startInfo.city, start: startInfo.local, target: targetInfo.local })
        : this.translate.instant('RECORD.CIRCULAR_ROUTE', { start: startInfo.local, target: targetInfo.local });
    } else {
      title = sameCity
        ? this.translate.instant('RECORD.URBAN_LINEAR_ROUTE', { city: startInfo.city, start: startInfo.local, end: targetInfo.local })
        : this.translate.instant('RECORD.LINEAR_ROUTE', { start: startInfo.local, end: targetInfo.local });
    }

    // 4. Descripción adaptada
    let description = isCircular 
      ? this.translate.instant('RECORD.PASSING_BY_CIRCULAR', { start: startInfo.local, target: targetInfo.local }) 
      : this.translate.instant('RECORD.PASSING_BY_LINEAR', { start: startInfo.local, end: targetInfo.local });

    // 5. Motor de Overpass para buscar POIs
    try {
      let minLat, minLng, maxLat, maxLng;
      if (feature.bbox && feature.bbox.length === 4) {
        minLng = feature.bbox[0]; minLat = feature.bbox[1]; maxLng = feature.bbox[2]; maxLat = feature.bbox[3];
      } else {
        const bounds = this.getBoundingBox(coords);
        minLat = bounds[0]; minLng = bounds[1]; maxLat = bounds[2]; maxLng = bounds[3];
      }

      const pois = await this.fetchPOIsFromOverpass(minLat, minLng, maxLat, maxLng);

      if (pois.length > 0) {
        const matchedPOIs = this.intersectRouteWithPOIs(coords, dataArray, pois, 150);

        if (matchedPOIs.length > 0) {
          description += '\n';
          matchedPOIs.forEach(poi => {
            description += `- ${poi.name} (${poi.km.toFixed(1)} km)\n`;
          });
        } else {
          description += '\n' + this.translate.instant('RECORD.NO_POIS');
        }
      } else {
        description += '\n' + this.translate.instant('RECORD.NO_POIS');
      }
    } catch (error) {
      console.warn('Error al obtener POIs de Overpass', error);
    }

    return { title, description };
  }

  // ==========================================================================
  // 2. LÓGICA GEOMÉTRICA (Private)
  // ==========================================================================

  /**
   * Encuentra el punto más alejado del inicio para rutas circulares.
   */
  private getFurthestPoint(coords: [number, number][], startCoord: [number, number]): [number, number] {
    let maxDist = 0;
    let furthest = coords[0];
    const p1 = { lat: startCoord[1], lng: startCoord[0] };

    for (const c of coords) {
      const p2 = { lat: c[1], lng: c[0] };
      const dist = this.snapToTrailService.calculateHaversineDistance(p1, p2);
      if (dist > maxDist) {
        maxDist = dist;
        furthest = c;
      }
    }
    return furthest;
  }

  /**
   * Calcula el marco delimitador (Bounding Box) de una serie de coordenadas.
   */
  private getBoundingBox(coords: [number, number][]): number[] {
    let minLat = Infinity, minLng = Infinity, maxLat = -Infinity, maxLng = -Infinity;
    coords.forEach(c => {
      const lng = c[0], lat = c[1];
      if (lat < minLat) minLat = lat;
      if (lng < minLng) minLng = lng;
      if (lat > maxLat) maxLat = lat;
      if (lng > maxLng) maxLng = lng;
    });
    return [minLat, minLng, maxLat, maxLng]; 
  }

  // ==========================================================================
  // 3. INTERSECCIÓN CON PUNTOS DE INTERÉS (POIs)
  // ==========================================================================

  /**
   * Cruza la ruta con una lista de POIs y devuelve los que están dentro del umbral.
   */
private intersectRouteWithPOIs(coords: [number, number][], dataArray: any[], pois: any[], thresholdMeters: number): any[] {
    let matched = [];
    const usedPOIs = new Set(); 
    let accumulatedDistanceMeters = 0; // Guardamos la distancia real que vamos recorriendo
    let lastPoiKm = -999; // Control para no poner POIs demasiado juntos

    for (let i = 0; i < coords.length; i++) {
      const currentPoint = { lat: coords[i][1], lng: coords[i][0] };
      
      // Calculamos la distancia acumulada sumando el tramo desde el punto anterior
      if (i > 0) {
        const prevPoint = { lat: coords[i-1][1], lng: coords[i-1][0] };
        accumulatedDistanceMeters += this.snapToTrailService.calculateHaversineDistance(prevPoint, currentPoint);
      }
      
      const currentKm = accumulatedDistanceMeters / 1000; 
      
      for (const poi of pois) {
        if (!usedPOIs.has(poi.name)) {
          const dist = this.snapToTrailService.calculateHaversineDistance(currentPoint, poi);
          
          if (dist <= thresholdMeters) {
            // Filtro anti-spam: Deben pasar al menos 250m desde el último POI listado
            if (currentKm - lastPoiKm >= 0.25) {
              matched.push({ name: poi.name, km: currentKm });
              usedPOIs.add(poi.name);
              lastPoiKm = currentKm;
            }
          }
        }
      }
    }

    // Como máximo, mostramos solo los 8 puntos de interés más relevantes
    if (matched.length > 8) {
        matched = matched.slice(0, 8);
    }

    return matched;
  }

  /**
   * Consulta la API de Overpass para obtener lugares de interés (montañas, parques, museos)
   * dentro de un área rectangular.
   */
private async fetchPOIsFromOverpass(minLat: number, minLng: number, maxLat: number, maxLng: number): Promise<any[]> {
    // Consulta restringida a lugares de interés importantes (sin placas ni fuentes pequeñas)
    const query = `
      [out:json][timeout:10];
      (
        // Naturaleza y montaña
        nwr["natural"="peak"](${minLat},${minLng},${maxLat},${maxLng});
        
        // Parques grandes y miradores
        nwr["leisure"="park"](${minLat},${minLng},${maxLat},${maxLng});
        nwr["tourism"="viewpoint"](${minLat},${minLng},${maxLat},${maxLng});
        
        // Museos, castillos, monumentos mayores y centros culturales
        nwr["tourism"="museum"](${minLat},${minLng},${maxLat},${maxLng});
        nwr["historic"="monument"](${minLat},${minLng},${maxLat},${maxLng});
        nwr["historic"="castle"](${minLat},${minLng},${maxLat},${maxLng});
        nwr["amenity"="arts_centre"](${minLat},${minLng},${maxLat},${maxLng});
      );
      out center; // Obligatorio para devolver el centro geográfico de las áreas
    `;
    
    const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;
    
    try {
      const response = await fetch(url);
      const result = await response.json();
      
      return result.elements
        .filter((e: any) => e.tags && e.tags.name)
        .map((e: any) => ({
          lat: e.type === 'node' ? e.lat : e.center?.lat, 
          lng: e.type === 'node' ? e.lon : e.center?.lon, 
          name: e.tags.name, 
          type: e.tags.natural || e.tags.leisure || e.tags.tourism || 'poi'
        }))
        .filter((e: any) => e.lat && e.lng);
    } catch (error) {
      console.warn('Error fetching POIs from Overpass', error);
      return []; 
    }
  }
  
  // ==========================================================================
  // 4. INFORMACIÓN DEL LUGAR (Nominatim)
  // ==========================================================================

  /**
   * Obtiene información detallada del lugar (barrio, ciudad) usando Geocoding Inverso.
   */
  private async getPlaceInfo(lat: number, lng: number): Promise<{ local: string, city: string }> {
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=18`;
      const response = await fetch(url, { headers: { 'Accept-Language': this.translate.currentLang || 'es' } });
      const data = await response.json();
      
      if (data && data.address) {
        const addr = data.address;
        
        // 1. Buscamos el nivel más local posible (Barrio puro)
        const localName = addr.square || addr.neighbourhood || addr.quarter || addr.suburb || addr.city_district || addr.village || addr.town || this.translate.instant('RECORD.START_POINT');
        
        // 2. Buscamos la ciudad o municipio general
        const cityName = addr.city || addr.town || addr.village || addr.county || '';

        return { local: localName, city: cityName };
      }
      return { local: this.translate.instant('RECORD.UNKNOWN_PLACE'), city: '' };
    } catch (error) {
      return { local: this.translate.instant('RECORD.UNKNOWN_PLACE'), city: '' };
    }
  }
}