import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class ElevationService {
  
  // Endpoint de la API pública y gratuita
  private readonly API_URL = 'https://api.open-elevation.com/api/v1/lookup';

  /**
   * Obtiene la altitud de múltiples coordenadas en una sola llamada HTTP.
   * @param points Array de objetos con {lat, lng}
   * @returns Array de altitudes (números) en el mismo orden que se enviaron.
   */
  async getBulkAltitude(points: {lat: number, lng: number}[]): Promise<number[]> {
    if (!points || points.length === 0) return [];

    // Open-Elevation requiere este formato exacto en el JSON
    const payload = {
      locations: points.map(p => ({ latitude: p.lat, longitude: p.lng }))
    };

    try {
      console.log(`[ElevationService] Solicitando altitud para ${points.length} puntos...`);
      
      const response = await fetch(this.API_URL, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        console.warn('[Elevation API] Fallo en la respuesta:', response.status);
        return [];
      }

      const data = await response.json();

      if (data && data.results) {
        // Extraemos solo los números de altitud y los devolvemos
        return data.results.map((res: any) => res.elevation);
      }
      return [];

    } catch (error) {
      console.error('[Elevation API] Error de red o parseo:', error);
      return [];
    }
  }
}