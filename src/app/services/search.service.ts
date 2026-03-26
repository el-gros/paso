import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, throwError } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { CapacitorHttp } from '@capacitor/core';
import { global } from '../../environments/environment';
import { LocationResult } from 'src/globald';

@Injectable({
  providedIn: 'root'
})
export class SearchService {

  // =========================================================
  // 🚀 CONFIGURACIÓN DE PROVEEDORES
  // Cambia 'photon' por 'nominatim' o 'mapbox' para alternar
  // =========================================================
  private readonly SEARCH_PROVIDER: 'photon' | 'nominatim' | 'mapbox' = 'photon';
  private readonly MAPBOX_TOKEN = 'TU_TOKEN_DE_MAPBOX_AQUI'; // Solo necesario si usas 'mapbox'

  private readonly NOMINATIM_BASE_URL = 'https://nominatim.openstreetmap.org/search';
  private readonly NOMINATIM_LOOKUP_URL = 'https://nominatim.openstreetmap.org/lookup';
  private readonly ORS_BASE_URL = 'https://api.openrouteservice.org/v2/directions';

  constructor(private http: HttpClient) {}
  
  /**
   * Busca lugares con sistema de FALLBACK (Si uno falla, intenta con el siguiente)
   */
  async searchPlaces(query: string, limit: number = 12): Promise<LocationResult[]> {
    if (!query.trim()) return [];

    // Definimos el orden de prioridad según el proveedor seleccionado
    let providersOrder: ('photon' | 'nominatim' | 'mapbox')[] = [];
    
    if (this.SEARCH_PROVIDER === 'photon') {
      providersOrder = ['photon', 'nominatim', 'mapbox'];
    } else if (this.SEARCH_PROVIDER === 'nominatim') {
      providersOrder = ['nominatim', 'photon', 'mapbox'];
    } else {
      providersOrder = ['mapbox', 'photon', 'nominatim'];
    }

    // Intentamos buscar iterando por la lista de proveedores
    for (const provider of providersOrder) {
      try {
        // Si toca mapbox pero no has puesto token, lo saltamos para que no falle a propósito
        if (provider === 'mapbox' && this.MAPBOX_TOKEN === 'TU_TOKEN_DE_MAPBOX_AQUI') {
          continue;
        }

        // Ejecutamos la búsqueda real
        const results = await this.executeSearch(provider, query, limit);
        
        // Si llegamos aquí sin que haya "saltado" un error al catch, devolvemos los resultados
        return results;

      } catch (error) {
        // Si el servidor falla (caída, timeout, error 500), lo capturamos y el bucle sigue al siguiente
        console.warn(`[SearchService] ⚠️ El proveedor '${provider}' falló o está caído. Intentando con el siguiente...`);
      }
    }

    // Si el bucle termina y todos han fallado:
    console.error('[SearchService] ❌ Todos los proveedores de búsqueda están caídos.');
    return [];
  }

  /**
   * Lógica interna que ejecuta la petición HTTP según el proveedor
   */
  private async executeSearch(provider: string, query: string, limit: number): Promise<LocationResult[]> {
    switch (provider) {
      
      // --------------------------------------------------
      // 1. PHOTON (Híbrido)
      // --------------------------------------------------
      case 'photon': {
        const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=${limit}`;
        const response = await CapacitorHttp.get({ url });
        
        if (response.status !== 200) throw new Error('Photon API Error');
        
        const data = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
        if (!data.features) return [];

        return await Promise.all(data.features.map(async (f: any) => {
          const props = f.properties;
          const [lon, lat] = f.geometry.coordinates;
          const name = props.name || props.street || props.city || '(Sin nombre)';
          
          const displayParts = [name, props.city, props.state, props.country].filter(Boolean);
          const display_name = [...new Set(displayParts)].join(', ');

          let geojson = f.geometry;
          let boundingbox = props.extent || [lon, lat, lon, lat];

          if (props.osm_type && props.osm_id) {
             const nominatimData = await this.fetchNominatimGeoJSON(props.osm_type, props.osm_id);
             if (nominatimData) {
                geojson = nominatimData.geojson || geojson;
                boundingbox = nominatimData.boundingbox ? nominatimData.boundingbox.map(Number) : boundingbox;
             }
          }

          return {
            lat, lon, name,
            short_name: displayParts.slice(0, 2).join(', '),
            display_name, place_id: props.osm_id?.toString(),
            type: props.osm_value || props.osm_key,
            geojson, boundingbox
          } as LocationResult;
        }));
      }

      // --------------------------------------------------
      // 2. MAPBOX
      // --------------------------------------------------
      case 'mapbox': {
        const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${this.MAPBOX_TOKEN}&limit=${limit}`;
        const response = await CapacitorHttp.get({ url });
        
        if (response.status !== 200) throw new Error('Mapbox API Error');

        const data = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
        if (!data.features) return [];

        return data.features.map((f: any) => {
          const [lon, lat] = f.center;
          return {
            lat, lon, name: f.text, short_name: f.text, display_name: f.place_name,
            place_id: f.id, type: f.place_type?.[0] || 'unknown', geojson: f.geometry,
            boundingbox: f.bbox || [lon, lat, lon, lat]
          } as LocationResult;
        });
      }

      // --------------------------------------------------
      // 3. NOMINATIM
      // --------------------------------------------------
      case 'nominatim':
      default: {
        const url = `${this.NOMINATIM_BASE_URL}?q=${encodeURIComponent(query)}&format=json&polygon_geojson=1&addressdetails=1&limit=${limit}`;
        const response = await CapacitorHttp.get({
          url, headers: { 'Accept': 'application/json', 'User-Agent': 'PasoApp/1.0' }
        });
        
        if (response.status !== 200) throw new Error('Nominatim API Error');

        const data = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
        if (!Array.isArray(data)) return [];

        return data.map((item: any) => {
          const parts = item.display_name.split(',');
          return {
            lat: Number(item.lat), lon: Number(item.lon), name: parts[0], 
            short_name: parts.slice(0, 2).join(','), display_name: item.display_name, 
            boundingbox: item.boundingbox.map(Number), geojson: item.geojson,
            place_id: item.place_id, type: item.type
          } as LocationResult;
        });
      }
    }
  }

  /**
   * Petición auxiliar a Nominatim para obtener la geometría (Polígono)
   */
  private async fetchNominatimGeoJSON(osmType: string, osmId: number): Promise<any | null> {
    const typeMap: { [key: string]: string } = { 'N': 'N', 'W': 'W', 'R': 'R' };
    const osmTypeLetter = typeMap[osmType] || 'N'; 
    const url = `${this.NOMINATIM_LOOKUP_URL}?osm_ids=${osmTypeLetter}${osmId}&format=json&polygon_geojson=1`;

    try {
      const response = await CapacitorHttp.get({
        url, headers: { 'Accept': 'application/json', 'User-Agent': 'PasoApp/1.0' }
      });
      // Si Nominatim falla en la sub-consulta, no rompemos todo, simplemente devolvemos null
      if (response.status !== 200) return null; 

      const data = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
      if (Array.isArray(data) && data.length > 0) return data[0];
      
      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Calcula una ruta entre dos puntos con OpenRouteService
   */
  async getRoute(origin: [number, number], destination: [number, number], transport: string): Promise<any> {
    const url = `${this.ORS_BASE_URL}/${transport}/geojson`;
    const body = { coordinates: [origin, destination], elevation: true, units: 'm', geometry: true };

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
  // MÉTODOS MUDADOS DESDE MAP.SERVICE (MapTiler Reverse Geocoding)
  // =========================================================

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