import { Injectable, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';

@Injectable({
  providedIn: 'root'
})
export class SmartRouteBuilderService {
  private translate = inject(TranslateService);

  /**
   * Genera un título y descripción inteligente basados en los puntos geográficos de la ruta.
   */
  public async generateWikilocStyleTexts(feature: any): Promise<{ title: string, description: string }> {
    const coords = feature.geometry?.coordinates;
    const dataArray = feature.geometry?.properties?.data;

    if (!coords || coords.length < 2 || !dataArray) return { title: '', description: '' };

    const startIndex = 0;
    const endIndex = coords.length - 1;
    const startName = await this.getPlaceName(coords[startIndex][1], coords[startIndex][0]);
    const endName = await this.getPlaceName(coords[endIndex][1], coords[endIndex][0]);

    const distanceStartEnd = this.calculateHaversineDistance(
      { lat: coords[startIndex][1], lng: coords[startIndex][0] },
      { lat: coords[endIndex][1], lng: coords[endIndex][0] }
    );
    const isCircular = distanceStartEnd < 200; 
    
    // Textos Traducidos
    const title = isCircular 
      ? this.translate.instant('RECORD.CIRCULAR_ROUTE', { start: startName }) 
      : this.translate.instant('RECORD.LINEAR_ROUTE', { start: startName, end: endName });

    let description = isCircular 
      ? this.translate.instant('RECORD.PASSING_BY_CIRCULAR', { start: startName }) 
      : this.translate.instant('RECORD.PASSING_BY_LINEAR', { start: startName, end: endName });

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
        const matchedPOIs = this.intersectRouteWithPOIs(coords, dataArray, pois, 75);

        if (matchedPOIs.length > 0) {
          matchedPOIs.forEach(poi => {
            description += `- ${poi.name} (${poi.km.toFixed(1)} km)\n`;
          });
        } else {
          description += this.translate.instant('RECORD.NO_POIS');
        }
      } else {
        description += this.translate.instant('RECORD.NO_POIS');
      }
    } catch (error) {
      console.warn('Error al obtener POIs de Overpass', error);
    }

    return { title, description };
  }

  // ==========================================
  // MÉTODOS PRIVADOS DEL MOTOR
  // ==========================================

  private intersectRouteWithPOIs(coords: [number, number][], dataArray: any[], pois: any[], thresholdMeters: number): any[] {
    const matched = [];
    const usedPOIs = new Set(); 

    for (let i = 0; i < coords.length; i++) {
      const currentPoint = { lat: coords[i][1], lng: coords[i][0] };
      const currentKm = (dataArray[i]?.distance || 0) / 1000; 
      
      for (const poi of pois) {
        if (!usedPOIs.has(poi.name)) {
          const dist = this.calculateHaversineDistance(currentPoint, poi);
          if (dist <= thresholdMeters) {
            matched.push({ name: poi.name, km: currentKm });
            usedPOIs.add(poi.name);
          }
        }
      }
    }
    return matched;
  }

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

  private async fetchPOIsFromOverpass(minLat: number, minLng: number, maxLat: number, maxLng: number): Promise<any[]> {
    const query = `
      [out:json][timeout:10];
      (
        node["natural"="peak"](${minLat},${minLng},${maxLat},${maxLng});
        node["natural"="saddle"](${minLat},${minLng},${maxLat},${maxLng});
        node["natural"="spring"](${minLat},${minLng},${maxLat},${maxLng});
      );
      out body;
    `;
    const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;
    
    const response = await fetch(url);
    const result = await response.json();
    
    return result.elements
      .filter((e: any) => e.tags && e.tags.name)
      .map((e: any) => ({
        lat: e.lat, lng: e.lon, name: e.tags.name, type: e.tags.natural
      }));
  }

  private async getPlaceName(lat: number, lng: number): Promise<string> {
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=14`;
      const response = await fetch(url, { headers: { 'Accept-Language': this.translate.currentLang || 'es' } });
      const data = await response.json();
      if (data && data.address) {
        return data.address.village || data.address.town || data.address.city_district || data.address.city || this.translate.instant('RECORD.START_POINT');
      }
      return this.translate.instant('RECORD.UNKNOWN_PLACE');
    } catch (error) {
      return this.translate.instant('RECORD.UNKNOWN_PLACE');
    }
  }
  
  private calculateHaversineDistance(p1: any, p2: any): number {
    const R = 6371e3; 
    const dLat = (p2.lat - p1.lat) * Math.PI / 180;
    const dLon = (p2.lng - p1.lng) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(p1.lat * Math.PI / 180) * Math.cos(p2.lat * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }
}