import { Injectable } from '@angular/core';
import { ElevationService } from './elevation.service';
import { SearchService } from './search.service';
 
@Injectable({
  providedIn: 'root'
})
export class SnapToTrailService {

  // ==========================================================================
  // 1. ESTADO Y CONFIGURACIÓN
  // ==========================================================================

  /** Umbral de distancia (metros) para considerar que un punto debe "pegarse" al sendero */
  private readonly CONFIDENCE_THRESHOLD_METERS = 10; 
  
  private loadedTrails: any[] = [];

  constructor(
    private elevationService: ElevationService,
    private searchService: SearchService
  ) {}

  // ==========================================================================
  // 2. ORQUESTADOR PRINCIPAL (Public API)
  // ==========================================================================

  /**
   * Ajusta la ruta del usuario a senderos conocidos y enriquece los datos con altitudes precisas.
   * @param track Objeto Track a procesar.
   * @param trails Opcional: segmentos de senderos externos.
   */
  async prepareTrackWithTrails(track: any, trails?: any[]): Promise<any> {
    const segments = trails || this.loadedTrails;
    if (!segments || segments.length === 0) {
      throw new Error('[SnapService] No hay senderos cargados. Imposible aplicar Snap/DEM.');
    }

    const feature = track.features[0];
    const data = feature.geometry.properties.data;
    const coords = feature.geometry.coordinates;

    // --- FASE 1: AJUSTE GEOMÉTRICO HORIZONTAL (SNAP X, Y) ---
    for (let i = 0; i < data.length; i++) {
      const currentPoint = { lat: coords[i][1], lng: coords[i][0] };
      const snappedResult = this.findNearestSnap(currentPoint, segments);

      // Si está cerca del sendero, corregimos su lat/lng
      if (snappedResult.distance <= this.CONFIDENCE_THRESHOLD_METERS) {
        coords[i][0] = snappedResult.point.lng;
        coords[i][1] = snappedResult.point.lat;
        data[i].isSnapped = true;
      } else {
        data[i].isSnapped = false;
      }
    }

    // --- FASE 2: MUESTREO DE ALTITUD PARA TODOS LOS PUNTOS (Z) ---
    // Tomamos toda la ruta (hayan hecho snap o no) y sacamos una muestra segura para la API
    let targetOriginalPositions: number[] = [];
    let targetPoints: {lat: number, lng: number}[] = [];

    const step = data.length > 150 ? Math.ceil(data.length / 120) : 1;
    
    for (let k = 0; k < data.length; k++) {
      if (k === 0 || k === data.length - 1 || k % step === 0) {
        targetPoints.push({ lat: coords[k][1], lng: coords[k][0] });
        targetOriginalPositions.push(k);
      }
    }

    // --- FASE 3: PEDIR ALTITUD A LA API ---
    const apiAltitudes = await this.elevationService.getBulkAltitude(targetPoints);
    if (!apiAltitudes || apiAltitudes.length !== targetPoints.length) {
      throw new Error('[SnapService] La API falló o devolvió datos incompletos.');
    }

    // --- FASE 4: INTERPOLAR PARA RELLENAR TODOS LOS HUECOS ---
    const finalAltitudes: number[] = new Array(data.length);
    for (let m = 0; m < targetOriginalPositions.length; m++) {
      const origPos = targetOriginalPositions[m];
      finalAltitudes[origPos] = apiAltitudes[m];

      if (m < targetOriginalPositions.length - 1) {
        const nextOrigPos = targetOriginalPositions[m + 1];
        const altA = apiAltitudes[m];
        const altB = apiAltitudes[m + 1];
        const stepsCount = nextOrigPos - origPos;

        for (let s = 1; s < stepsCount; s++) {
          const factor = s / stepsCount;
          finalAltitudes[origPos + s] = altA + (altB - altA) * factor;
        }
      }
    }

    // --- FASE 5: SUAVIZADO Y ASIGNACIÓN TOTAL ---
    const finalSmooth = this.smoothElevationsGaussian(finalAltitudes, 7);
    
    // Ahora TODOS los puntos de la ruta reciben su nueva altitud, sin dejar vacíos
    for (let i = 0; i < data.length; i++) {
      data[i].altitude = finalSmooth[i]; 
      data[i].isMSL = true;
      coords[i][2] = finalSmooth[i]; 
    }

    return track;
  }
    
  // ==========================================================================
  // 3. LÓGICA DE PROCESAMIENTO (Helpers)
  // ==========================================================================

  /**
   * Aplica un filtro de media móvil a un array numérico para suavizar picos.
   */
  private smoothElevations(data: number[], windowSize: number = 5): number[] {
    const smoothed = [];
    const halfWindow = Math.floor(windowSize / 2);

    for (let i = 0; i < data.length; i++) {
      let sum = 0;
      let count = 0;

      // Calculamos la media de la ventana alrededor del punto 'i'
      for (let j = Math.max(0, i - halfWindow); j <= Math.min(data.length - 1, i + halfWindow); j++) {
        sum += data[j];
        count++;
      }
      smoothed.push(sum / count);
    }
    return smoothed;
  }

  /**
   * Aplica un filtro gaussiano para suavizar picos.
   */
  private smoothElevationsGaussian(data: number[], windowSize: number = 7): number[] {
    if (data.length === 0) return [];

    // 1. Crear el Kernel Gaussiano (los pesos)
    // Ajustamos 'sigma' en base al tamaño de la ventana.
    const sigma = windowSize / 3; 
    const kernel: number[] = [];
    const halfWindow = Math.floor(windowSize / 2);
    let sumKernel = 0;

    for (let i = -halfWindow; i <= halfWindow; i++) {
      // Fórmula de la campana de Gauss
      const weight = Math.exp(-(i * i) / (2 * sigma * sigma));
      kernel.push(weight);
      sumKernel += weight;
    }

    // Normalizar para que la suma de todos los pesos sea 1
    const normalizedKernel = kernel.map(w => w / sumKernel);

    // 2. Aplicar el filtro a los datos
    const smoothed = [];
    
    for (let i = 0; i < data.length; i++) {
      let sum = 0;
      
      for (let j = -halfWindow; j <= halfWindow; j++) {
        const idx = i + j;
        
        // Manejo de bordes: si nos salimos del array, replicamos el valor más cercano
        // Esto evita que las altitudes caigan a 0 al principio o al final de la ruta
        const clampedIdx = Math.max(0, Math.min(data.length - 1, idx));
        
        sum += data[clampedIdx] * normalizedKernel[j + halfWindow];
      }
      smoothed.push(sum);
    }
    
    return smoothed;
  }

  // ==========================================================================
  // 4. HELPERS GEOMÉTRICOS
  // ==========================================================================

  /**
   * Busca el punto de "snap" (atracción) más cercano entre el usuario y los senderos.
   * @param userPoint Coordenadas del usuario.
   * @param trailSegments Lista de coordenadas que forman el sendero.
   */
  private findNearestSnap(userPoint: any, trailData: any[]) {
    let bestSnap = { point: userPoint, distance: Infinity };

    if (!trailData || trailData.length === 0) {
      return bestSnap;
    }

    // CASO 1: Es un array de puntos simples {lat, lng} (Ej: trailReference)
    if (trailData[0].lat !== undefined && trailData[0].lng !== undefined) {
      for (let i = 0; i < trailData.length - 1; i++) {
        const pointA = trailData[i];
        const pointB = trailData[i + 1];
        const closestOnSegment = this.searchService.findNearestPointOnSegment(userPoint, pointA, pointB);
        const dist = this.calculateHaversineDistance(userPoint, closestOnSegment);

        if (dist < bestSnap.distance) {
          bestSnap = { point: closestOnSegment, distance: dist };
        }
      }
      return bestSnap;
    }

    // CASO 2: Es un array de objetos GeoJSON (Ej: loadedTrails)
    for (const feature of trailData) {
      // Si el objeto no tiene la estructura GeoJSON, saltamos al siguiente
      if (!feature || !feature.geometry) continue;

      const lines = feature.geometry.type === 'MultiLineString' 
        ? feature.geometry.coordinates 
        : [feature.geometry.coordinates];

      for (const line of lines) {
        for (let i = 0; i < line.length - 1; i++) {
          const pointA = { lat: line[i][1], lng: line[i][0] };
          const pointB = { lat: line[i+1][1], lng: line[i+1][0] };

          const closestOnSegment = this.searchService.findNearestPointOnSegment(userPoint, pointA, pointB);
          const dist = this.calculateHaversineDistance(userPoint, closestOnSegment);

          if (dist < bestSnap.distance) {
            bestSnap = { point: closestOnSegment, distance: dist };
          }
        }
      }
    }
    
    return bestSnap;
  }

  public calculateHaversineDistance(p1: any, p2: any): number {
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
   * Algoritmo de Douglas-Peucker simplificado para reducir puntos de ruta
   */
  private simplifyDouglasPeucker(points: {lat: number, lng: number}[], tolerance: number): {lat: number, lng: number}[] {
    if (points.length <= 2) return points;

    let maxDist = 0;
    let index = 0;
    const end = points.length - 1;

    for (let i = 1; i < end; i++) {
      const dist = this.perpendicularDistance(points[i], points[0], points[end]);
      if (dist > maxDist) {
        index = i;
        maxDist = dist;
      }
    }

    if (maxDist > tolerance) {
      const recResults1 = this.simplifyDouglasPeucker(points.slice(0, index + 1), tolerance);
      const recResults2 = this.simplifyDouglasPeucker(points.slice(index), tolerance);
      return recResults1.slice(0, recResults1.length - 1).concat(recResults2);
    } else {
      return [points[0], points[end]];
    }
  }

  private perpendicularDistance(p: any, p1: any, p2: any): number {
    let x = p.lng, y = p.lat;
    let x1 = p1.lng, y1 = p1.lat;
    let x2 = p2.lng, y2 = p2.lat;

    const numerator = Math.abs((y2 - y1) * x - (x2 - x1) * y + x2 * y1 - y2 * x1);
    const denominator = Math.sqrt(Math.pow(y2 - y1, 2) + Math.pow(x2 - x1, 2));
    return denominator === 0 ? 0 : numerator / denominator;
  }

}