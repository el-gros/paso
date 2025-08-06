/**
* Service for performing forward and reverse geocoding using the Nominatim API.
* Provides methods to search for locations by query string and to retrieve address details from latitude and longitude.
* Uses HTTP GET requests and handles errors for both geocoding operations.
*/
import { HttpClient, HttpParams, HttpHeaders } from '@angular/common/http';
import { Observable, of, throwError } from 'rxjs';
import { Injectable } from '@angular/core';
import { catchError } from 'rxjs/operators';
import { NominatimReverseResult, NominatimSearchResult } from '../../globald';


@Injectable({
  providedIn: 'root',
})

export class NominatimService {
  private readonly baseUrl = 'https://nominatim.openstreetmap.org';

  constructor(private http: HttpClient) {}

  // 1. SEARCH
  // 2. REVERSE GEOCODE

  // 1. SEARCH ///////////////////////////////////
  search(query: string): Observable<NominatimSearchResult[]> {
    if (!query || !query.trim()) {
      return throwError(() => new Error('Query parameter must not be empty.'));
    }
    const url = `${this.baseUrl}/search`;
    const params = new HttpParams()
      .set('q', query)
      .set('format', 'json')
      .set('addressdetails', '1');
    const headers = new HttpHeaders()
      .set('User-Agent', 'YourAppName/1.0 (your@email.com)');
    return this.http.get<NominatimSearchResult[]>(url, { params, headers }).pipe(
      catchError(error => {
        // Handle error appropriately, e.g., log or return a fallback value
        return of([]);
      })
    );
  }

  // 2. REVERSE GEOCODE //////////////////////////
  reverseGeocode(lat: number, lon: number): Observable<NominatimReverseResult | null> {
    if (
      typeof lat !== 'number' ||
      typeof lon !== 'number' ||
      isNaN(lat) ||
      isNaN(lon) ||
      lat < -90 ||
      lat > 90 ||
      lon < -180 ||
      lon > 180
    ) {
      return throwError(() => new Error('Latitude and longitude must be valid numbers within their respective ranges.'));
    }
    const url = `${this.baseUrl}/reverse`;
    const params = new HttpParams()
      .set('lat', lat.toString())
      .set('lon', lon.toString())
      .set('format', 'json')
      .set('addressdetails', '1');
    const headers = new HttpHeaders()
      .set('User-Agent', 'YourAppName/1.0 (your@email.com)');
    return this.http.get<NominatimReverseResult>(url, { params, headers }).pipe(
      catchError(error => {
        // Handle error appropriately, e.g., log or return a fallback value
        return of(null);
      })
    );
  }
}
