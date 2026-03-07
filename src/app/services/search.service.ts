import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http'; // 🚀 NUEVO
import { Observable, of, throwError } from 'rxjs'; // 🚀 NUEVO
import { map, catchError } from 'rxjs/operators'; // 🚀 NUEVO
import { CapacitorHttp } from '@capacitor/core';
import { global } from '../../environments/environment';
import { LocationResult } from 'src/globald';

@Injectable({
  providedIn: 'root'
})
export class SearchService {

  private readonly NOMINATIM_BASE_URL = 'https://nominatim.openstreetmap.org/search';
  private readonly ORS_BASE_URL = 'https://api.openrouteservice.org/v2/directions';

  // 🚀 Inyectamos HttpClient para las peticiones a MapTiler
  constructor(private http: HttpClient) {}

  /**
   * Busca lugares en OpenStreetMap (Nominatim)
   */
  async searchPlaces(query: string, limit: number = 12): Promise<LocationResult[]> {
    if (!query.trim()) return [];

    const url = `${this.NOMINATIM_BASE_URL}?q=${encodeURIComponent(query)}&format=json&polygon_geojson=1&addressdetails=1&limit=${limit}`;
    
    try {
      const response = await CapacitorHttp.get({
        url,
        headers: { 
          'Accept': 'application/json', 
          'User-Agent': 'PasoApp/1.0' 
        }
      });

      const data = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
      
      if (!Array.isArray(data)) return [];

      return data.map((item: any) => {
        const parts = item.display_name.split(',');
        return {
          lat: Number(item.lat), 
          lon: Number(item.lon),
          name: parts[0], 
          short_name: parts.slice(0, 2).join(','),
          display_name: item.display_name, 
          boundingbox: item.boundingbox.map(Number), 
          geojson: item.geojson,
          place_id: item.place_id,
          type: item.type
        } as LocationResult;
      });
    } catch (e) {
      console.error("[SearchService] Error en Nominatim:", e);
      return [];
    }
  }

  /**
   * Calcula una ruta entre dos puntos con OpenRouteService
   */
  async getRoute(origin: [number, number], destination: [number, number], transport: string): Promise<any> {
    const url = `${this.ORS_BASE_URL}/${transport}/geojson`;
    
    const body = { 
      coordinates: [origin, destination], 
      elevation: true, 
      units: 'm',
      geometry: true
    };

    try {
      const resp = await CapacitorHttp.post({
        url,
        headers: { 
          'Accept': 'application/json, application/geo+json; charset=utf-8', 
          'Content-Type': 'application/json; charset=utf-8', 
          'Authorization': global.ors_key 
        },
        data: body
      });

      if (resp.status !== 200) {
        throw new Error(resp.data?.error?.message || `Error ORS: ${resp.status}`);
      }

      return typeof resp.data === 'string' ? JSON.parse(resp.data) : resp.data;
    } catch (error) {
      console.error("[SearchService] Error en enrutamiento:", error);
      throw error;
    }
  }

  // =========================================================
  // 🚀 NUEVOS MÉTODOS MUDADOS DESDE MAP.SERVICE
  // =========================================================

  /**
   * Reverse Geocoding: Obtiene el nombre de un lugar a partir de sus coordenadas
   */
  reverseGeocode(lat: number, lon: number): Observable<LocationResult | null> {
    if (
      typeof lat !== 'number' || typeof lon !== 'number' ||
      isNaN(lat) || isNaN(lon) ||
      lat < -90 || lat > 90 ||
      lon < -180 || lon > 180
    ) {
      return throwError(() => new Error('Invalid coordinates'));
    }
    const url = `https://api.maptiler.com/geocoding/${lon},${lat}.json?key=${global.mapTilerKey}`;
    
    return this.http.get<any>(url).pipe(
      map((response: any) => {
        const f = response?.features?.[0];
        if (!f) return null;
        
        const [featureLon, featureLat] = f.geometry.coordinates;
        const bbox = f.bbox ? f.bbox : [featureLon, featureLat, featureLon, featureLat];
        
        const result: LocationResult = {
          lat: featureLat,
          lon: featureLon,
          name: f.text ?? '(no name)',
          display_name: f.place_name ?? f.text ?? '(no name)',
          short_name: this.buildMapTilerShortName(f),
          type: f.place_type?.[0] ?? 'unknown',
          place_id: f.id ?? undefined,
          boundingbox: bbox,
          geojson: f.geometry
        };
        return result;
      }),
      catchError((error) => {
        console.error('Reverse geocoding error:', error);
        return of(null);
      })
    );
  }

  private buildMapTilerShortName(f: any): string {
    if (!f) return '(no name)';
    const main = f.text ?? '(no name)';
    const city = f.context?.find((c: any) =>
      c.id.startsWith('place') || c.id.startsWith('locality')
    )?.text;
    return city ? `${main}, ${city}` : main;
  }
}