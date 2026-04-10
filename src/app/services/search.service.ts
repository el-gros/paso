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

  private readonly NOMINATIM_BASE_URL = 'https://nominatim.openstreetmap.org/search';
  private readonly NOMINATIM_LOOKUP_URL = 'https://nominatim.openstreetmap.org/lookup';
  private readonly ORS_BASE_URL = 'https://api.openrouteservice.org/v2/directions';
  private readonly OVERPASS_API_URL = 'https://overpass-api.de/api/interpreter';

  // Mapping for service IDs to Overpass tags
  private readonly serviceTagMap: { [key: string]: string[] } = {
    'pharmacy': ['amenity=pharmacy'],
    'hospital': ['amenity=hospital', 'amenity=clinic', 'amenity=doctors'],
    'atm': ['amenity=atm', 'amenity=bank', 'amenity=bureau_de_change'],
    'accommodation': ['tourism=hotel', 'tourism=guest_house', 'tourism=hostel', 'tourism=motel', 'tourism=camp_site', 'tourism=alpine_hut'],
    'ev_charging': ['amenity=charging_station'],
    'parking': ['amenity=parking'],
    'transport': ['amenity=bus_station', 'railway=station', 'public_transport=station', 'highway=bus_stop', 'amenity=taxi'],
    'supermarket': ['shop=supermarket', 'shop=convenience', 'shop=bakery'],
    'food': ['amenity=restaurant', 'amenity=cafe', 'amenity=fast_food'],
  };

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

    // Intentamos Nominatim primero (OSM) y luego Mapbox como fallback
    const providersOrder: ('nominatim')[] = ['nominatim'];

    // Intentamos buscar iterando por la lista de proveedores hasta obtener éxito
    for (const provider of providersOrder) {
      try {
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
  
  /**
   * Realiza una búsqueda de servicios específicos en OpenStreetMap usando Overpass API.
   * @param serviceIds Categorías seleccionadas (ej: ['pharmacy', 'bus_stop'])
   * @param bbox Área de búsqueda en formato [minLat, minLon, maxLat, maxLon]
   */
  async searchServices(serviceIds: string[], bbox: number[]): Promise<any[]> {
    if (!serviceIds?.length || !bbox || bbox.length < 4) return [];

    // 1. Extraemos las coordenadas (vienen reordenadas desde el componente)
    const south = bbox[0];
    const west  = bbox[1];
    const north = bbox[2];
    const east  = bbox[3];

    // 2. Construimos los filtros de la Query
    let filters = '';
    serviceIds.forEach(id => {
      const tags = this.serviceTagMap[id] || [];
      tags.forEach(tag => {
        // 🚀 CAMBIO 1: Sustituimos 'node' por 'nwr' (Node, Way, Relation)
        filters += `nwr[${tag}](${south},${west},${north},${east});`;
      });
    });

    // 🚀 CAMBIO 2: Cambiamos 'out body;' por 'out center;' para que nos dé el centro de los edificios
    const query = `[out:json][timeout:15];(${filters});out center;`;
    
    // 3. Lista de servidores (Endpoints) para redundancia
    const endpoints = [
      'https://overpass-api.de/api/interpreter',
      'https://lz4.overpass-api.de/api/interpreter',
      'https://overpass.kumi.systems/api/interpreter',
      'https://overpass.nchc.org.tw/api/interpreter'
    ];

    // 4. Bucle de ejecución SECUENCIAL
    for (const baseUrl of endpoints) {
      try {
        console.log(`📡 [SearchService] Intentando servidor: ${baseUrl}`);
        
        const response = await CapacitorHttp.get({
          url: `${baseUrl}?data=${encodeURIComponent(query)}`,
          connectTimeout: 15000,
          readTimeout: 15000
        });

        // Si el servidor responde correctamente (200 OK)
        if (response.status === 200) {
          const data = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
          
          if (!data.elements || data.elements.length === 0) {
            console.log(`ℹ️ [SearchService] Sin resultados en ${baseUrl}.`);
            return []; // Si responde 200 pero vacío, es que realmente no hay nada
          }

          console.log(`✅ [SearchService] ¡Éxito en ${baseUrl}! Encontrados ${data.elements.length} resultados.`);

          // Mapeamos los resultados al formato de nuestra App
          return data.elements.map((e: any) => {
            // Identificamos el serviceId original para el color del pin
            const matchedId = serviceIds.find(id => 
              (this.serviceTagMap[id] || []).some(t => {
                const [k, v] = t.split('=');
                return e.tags?.[k] === v;
              })
            );

            // 🚀 CAMBIO 3: Overpass guarda las coordenadas de los 'ways' en e.center, y las de los 'nodes' en e.
            const lat = e.center ? e.center.lat : e.lat;
            const lon = e.center ? e.center.lon : e.lon;

            return {
              lat: lat,
              lon: lon,
              name: e.tags?.name || this.translate.instant(`SERVICES.${(e.tags?.amenity || e.tags?.tourism || 'POI').toUpperCase()}`),
              serviceId: matchedId,
              type: matchedId
            };
          });
        }

        console.warn(`⚠️ [SearchService] Servidor ${baseUrl} ocupado (Status ${response.status}). Reintentando con el siguiente...`);

      } catch (err) {
        console.error(`❌ [SearchService] Error de conexión con ${baseUrl}`);
      }
    }

    console.error('🛑 [SearchService] Todos los servidores de Overpass han fallado.');
    return [];
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
          name: f.text || '(no name)',
          display_name: f.place_name || f.text || '(no name)',
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

  /**
   * Calcula la distancia real entre dos coordenadas usando la fórmula de Haversine.
   */
  public calculateHaversineDistance(p1: { lat: number, lng: number }, p2: { lat: number, lng: number }): number {
    const R = 6371e3; 
    const dLat = (p2.lat - p1.lat) * Math.PI / 180;
    const dLon = (p2.lng - p1.lng) * Math.PI / 180;
    
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(p1.lat * Math.PI / 180) * Math.cos(p2.lat * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * Proyecta un punto sobre un segmento de línea definido por A y B.
   */
  public findNearestPointOnSegment(P: { lat: number, lng: number }, A: { lat: number, lng: number }, B: { lat: number, lng: number }) {
    const dx = B.lng - A.lng;
    const dy = B.lat - A.lat;
    if (dx === 0 && dy === 0) return A;
    let t = ((P.lng - A.lng) * dx + (P.lat - A.lat) * dy) / (dx * dx + dy * dy);
    t = Math.max(0, Math.min(1, t));
    return { lat: A.lat + t * dy, lng: A.lng + t * dx };
  }
}