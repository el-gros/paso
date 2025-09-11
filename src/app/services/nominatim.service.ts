/**
* Service for performing forward and reverse geocoding using the Nominatim API.
* Provides methods to search for locations by query string and to retrieve address details from latitude and longitude.
* Uses HTTP GET requests and handles errors for both geocoding operations.
*/
import { HttpClient, HttpParams, HttpHeaders } from '@angular/common/http';
import { map, Observable, of, throwError } from 'rxjs';
import { Injectable } from '@angular/core';
import { catchError } from 'rxjs/operators';
import { global } from 'src/environments/environment.prod';

/* export interface SearchResult {
  lat: number;
  lon: number;
  displayName: string;
  type?: string;
} */

@Injectable({
  providedIn: 'root',
})

export class NominatimService {
  // Base URLs
  private readonly baseUrl = 'https://nominatim.openstreetmap.org';

  constructor(private http: HttpClient) {}

  // 1. REVERSE GEOCODE

reverseGeocode(lat: number, lon: number): Observable<any | null> {
  if (
    typeof lat !== 'number' ||
    typeof lon !== 'number' ||
    isNaN(lat) || isNaN(lon) ||
    lat < -90 || lat > 90 ||
    lon < -180 || lon > 180
  ) {
    return throwError(() => new Error('Latitude and longitude must be valid numbers within their respective ranges.'));
  }

  // --- helpers ---
  const buildNominatimShortName = (addr: any): string => {
    if (!addr) return '(no name)';

    // 1. POIs
    if (addr.tourism) return addr.tourism;
    if (addr.amenity) return addr.amenity;
    if (addr.shop) return addr.shop;
    if (addr.building) return addr.building;

    // 2. Street + number + city
    if (addr.road) {
      let s = addr.road;
      if (addr.house_number) s += ` ${addr.house_number}`;
      if (addr.city || addr.town || addr.village) {
        s += `, ${addr.city ?? addr.town ?? addr.village}`;
      }
      return s;
    }

    // 3. Settlements
    if (addr.city) return addr.city;
    if (addr.town) return addr.town;
    if (addr.village) return addr.village;

    // 4. Country fallback
    return addr.country ?? '(no name)';
  };

  const buildMapTilerShortName = (f: any): string => {
    if (!f) return '(no name)';
    const main = f.text ?? '(no name)';
    const city = f.context?.find((c: any) =>
      c.id.startsWith('place') || c.id.startsWith('locality')
    )?.text;
    return city ? `${main}, ${city}` : main;
  };

  // --- build request ---
  let url: string;
  let options: any = {};

  if (global.geocoding === 'mapTiler') {
    url = `https://api.maptiler.com/geocoding/${lon},${lat}.json?key=${global.mapTilerKey}`;
    options = { observe: 'body' as const, responseType: 'json' as const };
  } else {
    url = `https://nominatim.openstreetmap.org/reverse`;
    options = {
      params: new HttpParams()
        .set('lat', lat.toString())
        .set('lon', lon.toString())
        .set('format', 'json')
        .set('addressdetails', '1')
        .set('polygon_geojson', '1'),
      headers: new HttpHeaders().set('User-Agent', 'YourAppName/1.0 (you@example.com)'),
      observe: 'body' as const,
      responseType: 'json' as const
    };
  }

  // --- normalize ---
  return this.http.get<any>(url, options).pipe(
    map((response: any) => {
      if (global.geocoding === 'mapTiler') {
        const f = response?.features?.[0];
        if (!f) return null;

        const [lon, lat] = f.geometry.coordinates;

        const bbox = f.bbox
          ? [f.bbox[1], f.bbox[3], f.bbox[0], f.bbox[2]] // [south, north, west, east]
          : [lat, lat, lon, lon];

        return {
          lat,
          lon,
          name: f.text ?? '(no name)',
          display_name: f.place_name ?? f.text ?? '(no name)',
          short_name: buildMapTilerShortName(f),
          type: f.place_type?.[0] ?? 'unknown',
          place_id: f.id ?? null,
          boundingbox: bbox,
          geojson: f.geometry
        };
      } else {
        return {
          lat: parseFloat(response.lat),
          lon: parseFloat(response.lon),
          name: response.display_name ?? '(no name)',
          display_name: response.display_name ?? '(no name)',
          short_name: buildNominatimShortName(response.address),
          type: response.type ?? 'unknown',
          place_id: response.place_id,
          boundingbox: response.boundingbox?.map((n: string) => parseFloat(n)) ?? [],
          geojson: response.geojson ?? null
        };
      }
    }),
    catchError(error => {
      console.error('Reverse geocoding error:', error);
      return of(null);
    })
  );
}

}
