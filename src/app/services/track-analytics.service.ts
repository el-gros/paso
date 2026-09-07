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
   * Tolerante a strings, fechas ISO, saltos de GPS y variaciones de unidades (km vs metros).
   */
  computePartialSpeeds(track: Track): PartialSpeed[] {
    const data: Data[] = (track?.features?.[0]?.geometry as any)?.properties?.data || [];
    if (!data || data.length < 2) return [];

    const results: PartialSpeed[] = [];

    // Función auxiliar para forzar el tiempo a milisegundos
    const getTimeMs = (t: any): number => {
      if (typeof t === 'number') return t;
      if (t instanceof Date) return t.getTime();
      return new Date(t).getTime();
    };

    // Buscamos el primer punto válido
    const firstIdx = data.findIndex(d => d.distance != null && d.time != null);
    if (firstIdx === -1) return [];

    // 1. DETECCIÓN AUTOMÁTICA DE UNIDADES (Metros vs Kilómetros)
    let distFactor = 1; // Por defecto asumimos kilómetros
    const lastIdx = data.length - 1;
    const totalTimeH = (getTimeMs(data[lastIdx].time) - getTimeMs(data[firstIdx].time)) / 3600000;
    const rawTotalDist = Number(data[lastIdx].distance) - Number(data[firstIdx].distance);

    if (totalTimeH > 0 && rawTotalDist > 0) {
      const apparentSpeed = rawTotalDist / totalTimeH; 
      // Si la velocidad media aparente es absurda (ej. > 1000), los datos están en metros.
      // (Si caminas 5km en 1h, la rawSpeed en metros daría 5000. Si vas en coche 100km en 1h, daría 100000)
      if (apparentSpeed > 1000) {
        distFactor = 1000;
      }
    }

    let lastValidPoint = data[firstIdx];
    
    // Forzamos que la distancia inicial sea numérica y esté normalizada a KM
    let startDistance = Number(lastValidPoint.distance) / distFactor;
    let startTime = getTimeMs(lastValidPoint.time);
    
    let kmIndex = Math.floor(startDistance) + 1;

    for (let i = firstIdx + 1; i < data.length; i++) {
      const currentPoint = data[i];
      
      if (currentPoint.distance == null || currentPoint.time == null) continue;

      // Conversión estricta y normalización de unidades
      const currentDist = Number(currentPoint.distance) / distFactor;
      const currentTimeMs = getTimeMs(currentPoint.time);
      const lastDist = Number(lastValidPoint.distance) / distFactor;
      const lastTimeMs = getTimeMs(lastValidPoint.time);

      while (currentDist >= kmIndex && currentDist > lastDist) {
        
        const ratio = (kmIndex - lastDist) / (currentDist - lastDist);
        const crossingTime = lastTimeMs + ratio * (currentTimeMs - lastTimeMs);
        
        const durS = (crossingTime - startTime) / 1000;
        const distanceCovered = kmIndex - startDistance;
        
        if (durS > 0 && distanceCovered > 0) {
          const kmh = Number(((distanceCovered * 3600) / durS).toFixed(2));
          
          const s = Math.floor(durS / distanceCovered); 
          const h = Math.floor(s / 3600);
          const m = Math.floor((s % 3600) / 60);
          const sec = s % 60;
          
          const formattedTime = h > 0 
            ? `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`
            : `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
            
          results.push([`${kmIndex-1}-${kmIndex}`, formattedTime, kmh]);
        }
        
        startTime = crossingTime;
        startDistance = kmIndex;
        kmIndex++;
      }
      
      lastValidPoint = currentPoint;
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