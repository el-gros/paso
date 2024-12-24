import { Injectable } from '@angular/core';
//import { CapacitorHttp } from '@capacitor/core';

@Injectable({
  providedIn: 'root',
})
export class NominatimService {
  private baseUrl = 'https://nominatim.openstreetmap.org';
  // Example of a GET request
  options = {
    url: 'https://example.com/my/api',
    headers: { 'X-Fake-Header': 'Fake-Value' },
    params: { size: 'XL' },
  };

  constructor() {
    
  }

  // Forward geocoding using Capacitor HTTP plugin
  async search(query: string): Promise<any> {
    const url = `${this.baseUrl}/search?q=${encodeURIComponent(query)}&format=json&addressdetails=1`;

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      console.log(response);
    } catch (error) {
      console.error('Error with Nominatim search (native):', error);
      throw error;
    }
  }

  // Reverse geocoding using Capacitor HTTP plugin
  async reverseGeocode(lat: number, lon: number): Promise<any> {
    console.log(lat, lon)
    const url = `${this.baseUrl}/reverse?lat=${lat}&lon=${lon}&format=json&addressdetails=1`;
    console.log(url)
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      // Extract JSON data from the response
      if (response.ok) { // Check if the response status is 200-299
        const data = await response.json(); // Parse JSON data
        return data
      } else {
        console.error('HTTP Error:', response.status, response.statusText);
        return {}
      }
    } catch (error) {
      console.error('Error with reverse geocoding (native):', error);
      throw error;
    }
  }
}
