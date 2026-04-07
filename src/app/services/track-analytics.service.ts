import { Injectable } from '@angular/core';
import { Track, Data, Bounds, PartialSpeed } from '../../globald';

@Injectable({
  providedIn: 'root'
})
export class TrackAnalyticsService {

  constructor() {}

  // ==========================================================================
  // 1. ESTADÍSTICAS Y ANÁLISIS DE DATOS
  // ==========================================================================

  /**
   * Calcula las velocidades parciales por kilómetro.
   * Itera sobre los datos del track para encontrar los puntos de cruce exactos de cada km.
   * @returns Array de [etiqueta, tiempo_parcial, velocidad_kmh].
   */
  computePartialSpeeds(track: Track): PartialSpeed[] {
    const data: Data[] = track?.features?.[0]?.geometry?.properties?.data || [];
    if (!data.length) return [];
    
    const results: PartialSpeed[] = [];
    let kmIndex = 1;
    let startTime = data[0].time;

    for (let i = 1; i < data.length; i++) {
      if (data[i].distance >= kmIndex && data[i].distance > data[i-1].distance) {
        const ratio = (kmIndex - data[i-1].distance) / (data[i].distance - data[i-1].distance);
        const crossingTime = data[i-1].time + ratio * (data[i].time - data[i-1].time);
        
        const durS = (crossingTime - startTime) / 1000;
        
        if (durS > 0) {
          const kmh = Number((3600 / durS).toFixed(2));
          const s = Math.floor(durS);
          const formattedTime = [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60]
            .map(v => v.toString().padStart(2, '0')).join(':');
            
          results.push([`${kmIndex-1}-${kmIndex} km`, formattedTime, kmh]);
        }
        
        startTime = crossingTime;
        kmIndex++;
      }
    }
    return results;
  }

  /**
   * Calcula los límites para el renderizado de gráficas (Canvas).
   * Busca el valor mínimo y máximo de una propiedad (altitud o velocidad) ignorando nulos.
   * @param propertyName Propiedad a analizar (ej: 'compAltitude').
   */
  computeMinMaxProperty(data: Data[], propertyName: keyof Data): Bounds {
    let min = Infinity, max = -Infinity;
    data.forEach(d => {
      const val = d[propertyName] as number;
      if (Number.isFinite(val)) { 
        min = Math.min(min, val); 
        max = Math.max(max, val); 
      }
    });
    return { 
      min: min === Infinity ? 0 : min, 
      max: max === -Infinity ? 0 : max 
    };
  }
}