import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class ElevationService {
  
  private readonly API_URL = 'https://api.open-meteo.com/v1/elevation';

  // Función auxiliar de espera
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async getBulkAltitude(points: {lat: number, lng: number}[]): Promise<number[]> {
    if (!points || points.length === 0) return [];

    const CHUNK_SIZE = 100; 
    const allElevations: number[] = [];

    console.log(`[ElevationService] Solicitando altitud para ${points.length} puntos vía Open-Meteo...`);

    for (let i = 0; i < points.length; i += CHUNK_SIZE) {
      const chunk = points.slice(i, i + CHUNK_SIZE);
      
      const lats = chunk.map(p => p.lat.toFixed(6)).join(',');
      const lngs = chunk.map(p => p.lng.toFixed(6)).join(',');
      const url = `${this.API_URL}?latitude=${lats}&longitude=${lngs}`;

      let success = false;
      let retries = 3; 

      while (!success && retries > 0) {
        try {
          const response = await fetch(url);

          // Si el servidor nos dice "Te estás pasando de rápido" (429)
          if (response.status === 429) {
            console.warn(`⏳ [Elevation API] Lote ${i} saturado (429). Esperando 3 segundos...`);
            await this.delay(3000); 
            // 🔥 LA CLAVE: Lanzamos un error en lugar de usar 'continue'
            // Esto fuerza a que el bloque 'catch' de abajo tome el control y aplique el salvavidas si se acaban los intentos.
            throw new Error('RateLimit 429');
          }

          if (!response.ok) {
            throw new Error(`Error HTTP ${response.status}`);
          }

          const data = await response.json();

          if (data && data.elevation && Array.isArray(data.elevation)) {
            allElevations.push(...data.elevation);
            success = true; // Éxito, salimos del while
          } else {
            throw new Error('Respuesta del servidor sin array de elevaciones');
          }

        } catch (error) {
          retries--;
          console.error(`[Elevation API] Fallo en lote ${i}. Intentos restantes: ${retries}`);
          
          if (retries > 0) {
            await this.delay(2000); // Espera antes de volver a intentarlo
          } else {
            console.error(`❌ [Elevation API] Lote ${i} falló definitivamente. Aplicando salvavidas.`);
            
            // BUSCAMOS LA ÚLTIMA ALTITUD VÁLIDA
            const lastKnownElevation = allElevations.length > 0 
              ? allElevations[allElevations.length - 1] 
              : 0; 

            // Rellenamos el lote fallido para no romper la longitud del track
            allElevations.push(...new Array(chunk.length).fill(lastKnownElevation));
            
            success = true; // Salimos del while para continuar con el siguiente lote
          }
        }
      }

      // Retraso normal entre lotes para evitar llegar al límite (Subido a 1.5s)
      if (i + CHUNK_SIZE < points.length) {
        await this.delay(1500); 
      }
    }

    return allElevations;
  }
}