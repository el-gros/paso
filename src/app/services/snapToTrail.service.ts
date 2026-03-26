import { Injectable } from '@angular/core';
import { ElevationService } from './elevation.service';

@Injectable({
  providedIn: 'root'
})
export class SnapToTrailService {
  private readonly CONFIDENCE_THRESHOLD_METERS = 10;
  private loadedTrails: any[] = [];

  constructor(private elevationService: ElevationService) {}

  async prepareTrackWithTrails(track: any, trails?: any[]): Promise<any> {
    const segments = trails || this.loadedTrails;

    if (!segments || segments.length === 0) {
      console.warn('[SnapService] No hay senderos cargados. Saltando ajuste.');
      return track;
    }

    const feature = track.features[0];
    const data = feature.geometry.properties.data;
    const coords = feature.geometry.coordinates;

    const pointsToFetch: {lat: number, lng: number}[] = [];
    const snappedIndices: number[] = []; 

    // --- FASE 1: AJUSTE GEOMÉTRICO (SNAP) ---
    for (let i = 0; i < data.length; i++) {
      const currentPoint = { lat: coords[i][1], lng: coords[i][0] };
      const snappedResult = this.findNearestSnap(currentPoint, segments);

      if (snappedResult.distance <= this.CONFIDENCE_THRESHOLD_METERS) {
        // Corrección Horizontal
        coords[i][0] = snappedResult.point.lng;
        coords[i][1] = snappedResult.point.lat;
        data[i].isSnapped = true;

        pointsToFetch.push({ lat: coords[i][1], lng: coords[i][0] });
        snappedIndices.push(i);
      } else {
        data[i].isSnapped = false;
      }
    }

    // --- FASE 2: INYECCIÓN DE ALTITUD (API) + SUAVIZADO ---
    if (pointsToFetch.length > 0) {
      const apiAltitudes = await this.elevationService.getBulkAltitude(pointsToFetch);

      if (apiAltitudes.length === pointsToFetch.length) {
 
        // Pasada 1: Rompe la estructura de "escalón" del mapa de 30m
        const pass1 = this.smoothElevations(apiAltitudes, 7); 
        
        // Pasada 2: Suaviza las aristas resultantes creando una curva natural (Gaussiana)
        const finalSmooth = this.smoothElevations(pass1, 7);
 
        for (let j = 0; j < finalSmooth.length; j++) {
          const originalIndex = snappedIndices[j];
          data[originalIndex].altitude = finalSmooth[j]; 
        }
      } else {
        console.warn('[SnapService] La API falló o devolvió datos incompletos. Se mantiene la altitud original.');
      }
    }

    return track;
  }

  // ==========================================================================
  // MÉTODOS PRIVADOS DE PROCESAMIENTO
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

  private findNearestSnap(userPoint: any, trailSegments: any[]) {
    let bestSnap = { point: userPoint, distance: Infinity };

    for (let i = 0; i < trailSegments.length - 1; i++) {
      const pointA = trailSegments[i];
      const pointB = trailSegments[i + 1];

      const closestOnSegment = this.findNearestPointOnSegment(userPoint, pointA, pointB);
      const dist = this.calculateHaversineDistance(userPoint, closestOnSegment);

      if (dist < bestSnap.distance) {
        bestSnap = { point: closestOnSegment, distance: dist };
      }
    }
    return bestSnap;
  }

  private findNearestPointOnSegment(P: any, A: any, B: any) {
    const dx = B.lng - A.lng;
    const dy = B.lat - A.lat;
    
    if (dx === 0 && dy === 0) return A;

    let t = ((P.lng - A.lng) * dx + (P.lat - A.lat) * dy) / (dx * dx + dy * dy);
    t = Math.max(0, Math.min(1, t));

    return {
      lat: A.lat + t * dy,
      lng: A.lng + t * dx
    };
  }

  private calculateHaversineDistance(p1: any, p2: any): number {
    const R = 6371e3; 
    const dLat = (p2.lat - p1.lat) * Math.PI / 180;
    const dLon = (p2.lng - p1.lng) * Math.PI / 180;
    
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(p1.lat * Math.PI / 180) * Math.cos(p2.lat * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }
}