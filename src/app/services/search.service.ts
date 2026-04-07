import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, throwError } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { CapacitorHttp } from '@capacitor/core';
import { TranslateService } from '@ngx-translate/core';
import { global } from '../../environments/environment';
import { LocationResult, Track } from '../../globald';
import { GeoMathService } from './geo-math.service';
import { Coordinate } from 'ol/coordinate';

@Injectable({
  providedIn: 'root'
})
export class SearchService {

  // ==========================================================================
  // 1. CONFIGURACIÓN DE PROVEEDORES Y ENDPOINTS
  // ==========================================================================

  private readonly SEARCH_PROVIDER: 'photon' | 'nominatim' | 'mapbox' = 'photon';
  private readonly MAPBOX_TOKEN = 'TU_TOKEN_DE_MAPBOX_AQUI'; // Solo necesario si usas 'mapbox'

  private readonly NOMINATIM_BASE_URL = 'https://nominatim.openstreetmap.org/search';
  private readonly NOMINATIM_LOOKUP_URL = 'https://nominatim.openstreetmap.org/lookup';
  private readonly ORS_BASE_URL = 'https://api.openrouteservice.org/v2/directions';

  constructor(
    private http: HttpClient,
    private geoMath: GeoMathService,
    private translate: TranslateService
  ) {}
  
  // ==========================================================================
  // 2. BÚSQUEDA DE LUGARES (Places API)
  // ==========================================================================

  /**
   * Busca lugares por texto con una estrategia de reintento (failover) entre proveedores.
   * @param query Texto a buscar.
   * @param limit Máximo de resultados deseados.
   */
  async searchPlaces(query: string, limit: number = 12): Promise<LocationResult[]> {
    if (!query.trim()) return [];

    // Definimos el orden de prioridad según el proveedor seleccionado por defecto
    let providersOrder: ('photon' | 'nominatim' | 'mapbox')[] = [];
    
    if (this.SEARCH_PROVIDER === 'photon') {
      providersOrder = ['photon', 'nominatim', 'mapbox'];
    } else if (this.SEARCH_PROVIDER === 'nominatim') {
      providersOrder = ['nominatim', 'photon', 'mapbox'];
    } else {
      providersOrder = ['mapbox', 'photon', 'nominatim'];
    }

    // Intentamos buscar iterando por la lista de proveedores hasta obtener éxito
    for (const provider of providersOrder) {
      try {
        // Si es mapbox y no hay token, saltamos al siguiente
        if (provider === 'mapbox' && this.MAPBOX_TOKEN === 'TU_TOKEN_DE_MAPBOX_AQUI') {
          continue;
        }

        // Ejecutamos la búsqueda real
        return await this.executeSearch(provider, query, limit);

      } catch (error) {
        // Si el servidor falla (caída, timeout, error 500), capturamos y seguimos al siguiente
        console.warn(`[SearchService] ⚠️ El proveedor '${provider}' falló. Intentando con el siguiente...`);
      }
    }

    console.error('[SearchService] ❌ Todos los proveedores de búsqueda están fuera de servicio.');
    return [];
  }

  // ==========================================================================
  // 3. ENRUTAMIENTO (Routing API)
  // ==========================================================================

  /**
   * Solicita una ruta entre dos puntos geográficos a OpenRouteService.
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
      console.error("[SearchService] Error en petición de enrutamiento:", error);
      throw error;
    }
  }

  /**
   * Procesa la respuesta de OpenRouteService y genera un objeto Track.
   * Calcula distancias acumuladas y prepara los datos para el gráfico de perfil.
   */
  processRouteResponse(geoJsonData: any, originName: string, destName: string, transport: string): Track {
    const routeFeature = geoJsonData.features[0];
    const stats = routeFeature.properties.summary;
    const routeCoordinates: Coordinate[] = routeFeature.geometry.coordinates;

    let accumulatedDistance = 0;
    const trackData = routeCoordinates.map((c, index) => {
      if (index > 0) {
        const prev = routeCoordinates[index - 1];
        accumulatedDistance += this.geoMath.quickDistance(prev[0], prev[1], c[0], c[1]);
      }
      return {
        altitude: c[2] || 0,
        speed: 0,
        time: 0,
        compAltitude: c[2] || 0,
        compSpeed: 0,
        distance: accumulatedDistance
      };
    });

    return {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: {
          name: `${originName} ➔ ${destName}`,
          place: destName,
          date: new Date(),
          description: this.translate.instant(`TRANSPORT.${transport.toUpperCase().replace('-', '_')}`),
          totalDistance: stats.distance / 1000,
          totalTime: Math.round(stats.duration * 1000),
          inMotion: Math.round(stats.duration * 1000), 
          totalElevationGain: Math.round(routeFeature.properties.ascent || 0),
          totalElevationLoss: Math.round(routeFeature.properties.descent || 0),
          totalNumber: routeCoordinates.length,
          currentSpeed: 0, 
          currentAltitude: 0
        },
        geometry: {
          type: 'LineString',
          coordinates: routeCoordinates as [number, number][],
          properties: { data: trackData }
        }
      }]
    } as Track;
  }
  
  // ==========================================================================
  // 4. GEOCODIFICACIÓN INVERSA (Reverse Geocoding)
  // ==========================================================================

  /**
   * Obtiene información detallada de un lugar dadas sus coordenadas.
   * Utiliza el API de Geocoding de MapTiler.
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

  // ==========================================================================
  // 5. MÉTODOS PRIVADOS Y HELPERS
  // ==========================================================================

  /**
   * Lógica interna que ejecuta la petición HTTP según el proveedor seleccionado.
   */
  private async executeSearch(provider: string, query: string, limit: number): Promise<LocationResult[]> {
    switch (provider) {
      
      // --------------------------------------------------
      // A. PHOTON (Híbrido - basado en Komoot)
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
      // B. MAPBOX (Requiere token)
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
      // C. NOMINATIM (OpenStreetMap)
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
   * Petición auxiliar a Nominatim para obtener la geometría detallada (Polígono).
   */
  private async fetchNominatimGeoJSON(osmType: string, osmId: number): Promise<any | null> {
    const typeMap: { [key: string]: string } = { 'N': 'N', 'W': 'W', 'R': 'R' };
    const osmTypeLetter = typeMap[osmType] || 'N'; 
    const url = `${this.NOMINATIM_LOOKUP_URL}?osm_ids=${osmTypeLetter}${osmId}&format=json&polygon_geojson=1`;

    try {
      const response = await CapacitorHttp.get({
        url, headers: { 'Accept': 'application/json', 'User-Agent': 'PasoApp/1.0' }
      });
      if (response.status !== 200) return null; 

      const data = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
      if (Array.isArray(data) && data.length > 0) return data[0];
      
      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Construye un nombre corto legible para los resultados de MapTiler.
   */
  private buildMapTilerShortName(f: any): string {
    if (!f) return '(no name)';
    const main = f.text ?? '(no name)';
    const city = f.context?.find((c: any) =>
      c.id.startsWith('place') || c.id.startsWith('locality')
    )?.text;
    return city ? `${main}, ${city}` : main;
  }
}