import { Injectable } from '@angular/core';
import { Track, Data } from '../../globald';
import * as egm96 from 'egm96-universal';

const DEG_TO_RAD = Math.PI / 180;
const EARTH_RADIUS_KM = 6371;

@Injectable({
  providedIn: 'root'
})
export class GeoMathService {

  // ==========================================================================
  // 1. ESTADO INTERNO Y CACHÉ
  // ==========================================================================

  /** Velocidad media total calculada para el track actual. */
  public averageSpeed: number = 0;
  /** Velocidad media en movimiento calculada para el track actual. */
  public averageMotionSpeed: number = 0;
  /** Última altitud estable utilizada para el cálculo de desniveles. */
  public lastStableAlt: number = 0;

  /** Parámetro de ruido del proceso para el filtro de Kalman. */
  private k_q = 0.1; 
  /** Parámetro de ruido de la medición para el filtro de Kalman. */
  private k_r = 1.5; 
  /** Estimación de la covarianza del error para el filtro de Kalman. */
  private k_p = 1.0; 
  /** Valor estimado actual (velocidad filtrada) para el filtro de Kalman. */
  private k_v = 0.0; 

  constructor() {}

  // ==========================================================================
  // 0. CORRECCIÓN DE ALTITUD (GEOIDE)
  // ==========================================================================

  /**
   * Convierte altitud elipsoidal (WGS84) a ortométrica (MSL) usando EGM96.
   * @returns Altitud corregida en metros (2 decimales).
   */
  public getCorrectedAltitude(lat: number, lon: number, rawAltitude: number): number {
    // Convierte directamente del elipsoide al geoide (MSL)
    const correctedAlt = egm96.ellipsoidToEgm96(lat, lon, rawAltitude);
    return parseFloat(correctedAlt.toFixed(2));
  }

  // ==========================================================================
  // 1. FILTRADO Y SUAVIZADO (Kalman & Altitud)
  // ==========================================================================

  /**
   * Aplica un filtro de Kalman simple para suavizar una serie de mediciones.
   * @param measurement La nueva medición a filtrar.
   * @returns El valor filtrado.
   */
  private applyKalman(measurement: number): number {
    this.k_p = this.k_p + this.k_q;
    const k_gain = this.k_p / (this.k_p + this.k_r);
    this.k_v = this.k_v + k_gain * (measurement - this.k_v);
    this.k_p = (1 - k_gain) * this.k_p;
    return this.k_v;
  }

  /**
   * Procesa los puntos de un track aplicando filtrado de Kalman para la velocidad,
   * corrección de altitud con el geoide y cálculo de desniveles.
   * @param track El objeto `Track` a procesar.
   * @param initial El índice del punto desde el cual iniciar el procesamiento (0 para un track nuevo).
   * @returns Una promesa que resuelve con el objeto `Track` actualizado.
   */
  async filterSpeedAndAltitude(track: Track, initial: number): Promise<Track> {
    const feature = track.features[0];
    if (!feature || !feature.geometry || !feature.geometry.properties) return track;

    // Obtenemos las coordenadas para sacar Lat/Lng reales
    const coords = feature.geometry.coordinates;
    const data = feature.geometry.properties.data;
    const props = feature.properties;
    const num = data.length;
    
    const MOVING_THRESHOLD = 0.8; 
    const ALT_SMOOTHING = 0.15;   
    const VERTICAL_THRESHOLD = 3.0; 

    // --- 1. PROCESAMIENTO DEL PUNTO INICIAL ---
    if (initial === 0 && num > 0) {
      this.k_p = 1.0; 
      this.k_v = 0;
      props.inMotion = 0;
      props.totalElevationGain = 0;
      props.totalElevationLoss = 0;
      props.totalTime = 0;

      const firstPoint = data[0];

      // Verificamos si la corrección ya la hizo el SO (isMSL) o LocationManager (geoidApplied)
      if (firstPoint.geoidApplied === false || firstPoint.isMSL === false) {
        const lon = coords[0][0];
        const lat = coords[0][1];
        firstPoint.altitude = this.getCorrectedAltitude(lat, lon, firstPoint.altitude);
      }
      // Lo marcamos siempre como true para que si se repasa el array, no se vuelva a calcular
      firstPoint.geoidApplied = true;

      firstPoint.compAltitude = firstPoint.altitude;
      firstPoint.compSpeed = 0;
      this.lastStableAlt = firstPoint.altitude; 
    }

    const startIndex = initial === 0 ? 1 : initial + 1;

    // --- 2. BUCLE DE PROCESAMIENTO DE PUNTOS ---
    for (let i = startIndex; i < num; i++) {
      const prev = data[i - 1];
      const curr = data[i];

      // A) Cálculo de Velocidad y Tiempo
      const distDelta = curr.distance - prev.distance;
      const timeDelta = curr.time - prev.time;
      const rawSpeed = timeDelta > 0 ? (3600000 * distDelta) / timeDelta : 0;
      
      curr.compSpeed = this.applyKalman(rawSpeed);
      props.totalTime = curr.time - data[0].time;
      
      if (curr.compSpeed > MOVING_THRESHOLD) {
        props.inMotion += timeDelta;
      }

      // B) Corrección del Geoide
      // Solo aplicamos la matemática si no viene corregido nativamente ni se procesó en foreground
      if (!curr.geoidApplied && !curr.isMSL) {
        const lon = coords[i][0];
        const lat = coords[i][1];
        console.log(`[GeoMath] Punto ${i} -> Corrigiendo altitud. Original: ${curr.altitude}, geoidApplied: ${curr.geoidApplied}`);
        curr.altitude = this.getCorrectedAltitude(lat, lon, curr.altitude);
      }
      curr.geoidApplied = true;

      // C) Suavizado de Altitud
      curr.compAltitude = prev.compAltitude + ALT_SMOOTHING * (curr.altitude - prev.compAltitude);
      
      if (i < 5) {
         this.lastStableAlt = curr.compAltitude;
         props.totalElevationGain = 0;
         props.totalElevationLoss = 0;
      }

      // D) Cálculo de Desniveles
      const verticalDiff = curr.compAltitude - this.lastStableAlt;

      if (Math.abs(verticalDiff) >= VERTICAL_THRESHOLD) {
        if (verticalDiff > 0) {
          props.totalElevationGain += verticalDiff;
        } else {
          props.totalElevationLoss += Math.abs(verticalDiff);
        }
        this.lastStableAlt = curr.compAltitude;
      }
    }

    // --- 3. ACTUALIZACIÓN DE PROPIEDADES FINALES ---
    const lastPoint = data[num - 1];
    props.currentSpeed = lastPoint.compSpeed;
    props.currentAltitude = lastPoint.compAltitude;

    const hoursTotal = props.totalTime / 3600000;
    const hoursInMotion = props.inMotion / 3600000;
    
    this.averageSpeed = hoursTotal > 0 ? (props.totalDistance / hoursTotal) : 0;
    this.averageMotionSpeed = hoursInMotion > 0 ? (props.totalDistance / hoursInMotion) : 0;

    return track;
  }

  // ==========================================================================
  // 2. MATEMÁTICAS GEOMÉTRICAS BÁSICAS (Distancias y BBox)
  // ==========================================================================

  /**
   * Calcula la distancia Haversine entre dos puntos geográficos en kilómetros.
   * @param lon1 Longitud del primer punto.
   * @param lat1 Latitud del primer punto.
   * @param lon2 Longitud del segundo punto.
   * @param lat2 Latitud del segundo punto.
   * @returns La distancia entre los dos puntos en kilómetros.
   */

  computeDistance(lon1: number, lat1: number, lon2: number, lat2: number): number {
    const dLat = (lat2 - lat1) * DEG_TO_RAD;
    const dLon = (lon2 - lon1) * DEG_TO_RAD;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * DEG_TO_RAD) * Math.cos(lat2 * DEG_TO_RAD) * Math.sin(dLon / 2) ** 2;
    return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  /**
   * Alias para `computeDistance`, útil para mantener la compatibilidad o por preferencia.
   * @param lon1 Longitud del primer punto.
   * @param lat1 Latitud del primer punto.
   * @param lon2 Longitud del segundo punto.
   * @param lat2 Latitud del segundo punto.
   * @returns La distancia entre los dos puntos en kilómetros.
   */
  quickDistance(lon1: number, lat1: number, lon2: number, lat2: number): number {
    return this.computeDistance(lon1, lat1, lon2, lat2);
  }

  /**
   * Actualiza un Bounding Box (bbox) con una nueva coordenada.
   * @param bbox El array del Bounding Box en formato [minLon, minLat, maxLon, maxLat].
   * @param coord La coordenada a incluir en formato [lon, lat].
   */
  private updateBBox(bbox: [number, number, number, number], coord: number[]): void {
    bbox[0] = Math.min(bbox[0], coord[0]); // Min Lon
    bbox[1] = Math.min(bbox[1], coord[1]); // Min Lat
    bbox[2] = Math.max(bbox[2], coord[0]); // Max Lon
    bbox[3] = Math.max(bbox[3], coord[1]); // Max Lat
  }

  // ==========================================================================
  // 3. CÁLCULO DE DISTANCIAS ACUMULADAS (Las que faltaban)
  // ==========================================================================

  /**
   * Calcula las distancias acumuladas para cada punto de un track y actualiza su Bounding Box.
   * @param track El objeto `Track` a procesar.
   * @param startIndex El índice del punto desde el cual iniciar el cálculo de distancias.
   * @returns Una promesa que resuelve con el objeto `Track` actualizado.
   */
  public async accumulatedDistances(track: Track, startIndex: number): Promise<Track> {
    const feature = track.features[0];
    const coords = feature.geometry.coordinates;
    const data = feature.geometry.properties.data;
    const num = coords.length;

    if (num < 2) return track;

    for (let i = Math.max(1, startIndex); i < num; i++) {
      const prev = coords[i - 1];
      const curr = coords[i];
      
      const segmentDist = this.computeDistance(prev[0], prev[1], curr[0], curr[1]);
      data[i].distance = data[i - 1].distance + segmentDist;
      
      if (feature.bbox) {
        this.updateBBox(feature.bbox, curr);
      }
    }

    feature.properties.totalDistance = data[num - 1].distance;
    feature.properties.totalNumber = num;
    return track;
  }

  /**
   * Calcula las distancias acumuladas entre una serie de coordenadas.
   * @param coords Un array de coordenadas en formato `[lon, lat]`.
   * @returns Un array de números representando la distancia acumulada en kilómetros para cada punto.
   */
  computeCumulativeDistances(coords: [number, number][]): number[] {
    if (coords.length === 0) return [];
    const dists = [0];
    for (let i = 1; i < coords.length; i++) {
      const d = this.computeDistance(coords[i-1][0], coords[i-1][1], coords[i][0], coords[i][1]);
      dists.push(dists[i-1] + d);
    }
    return dists;
  }

  // ==========================================================================
  // 5. UTILIDADES DE INTERPOLACIÓN (Rutas externas / Simulación)
  // ==========================================================================

  /**
   * Crea un array de objetos `Data` a partir de arrays de distancias, altitudes y tiempos,
   * asignando una velocidad constante.
   * @param distances Array de distancias.
   * @param altitudes Array de altitudes.
   * @param times Array de tiempos.
   * @param speed Velocidad constante a asignar.
   * @returns Un array de objetos `Data`.
   */
  fillProperties(distances: number[], altitudes: number[], times: number[], speed: number): Data[] {
    return distances.map((d, i) => ({ 
      altitude: altitudes[i], 
      speed, 
      time: times[i], 
      compSpeed: speed, 
      compAltitude: altitudes[i], 
      distance: d 
    }));
  }

  /**
   * Genera un array de marcas de tiempo interpoladas basándose en la duración total
   * y la distancia de un track.
   * @param data Objeto de respuesta que contiene la duración total (ej. de OpenRouteService).
   * @param date La fecha de inicio del track.
   * @param distances Array de distancias acumuladas.
   * @returns Un array de marcas de tiempo en milisegundos.
   */
  createTimes(data: any, date: Date, distances: number[]): number[] {
    const summary = data.response?.features?.[0]?.properties?.summary;
    if (!summary) return distances.map(() => date.getTime());

    const startTime = date.getTime() - (summary.duration * 1000);
    const totalDist = summary.distance / 1000;
    
    return distances.map(d => Math.round(startTime + (d / totalDist) * (summary.duration * 1000)));
  }

  /**
   * Ajusta las coordenadas y propiedades de un track interpolando puntos
   * si la distancia entre dos puntos consecutivos excede un `maxDistance`.
   * @param coordinates Array de coordenadas `[lon, lat]`.
   * @param properties Array de objetos `Data` asociados a las coordenadas.
   * @param maxDistance La distancia máxima permitida entre puntos antes de interpolar.
   * @returns Un objeto con los nuevos arrays de coordenadas y propiedades interpoladas.
   */
  adjustCoordinatesAndProperties(coordinates: [number, number][], properties: Data[], maxDistance: number) {
    const newCoordinates: [number, number][] = [];
    const newProperties: Data[] = [];

    for (let i = 0; i < coordinates.length - 1; i++) {
      newCoordinates.push(coordinates[i]);
      newProperties.push({ ...properties[i] });

      const dist = properties[i + 1].distance - properties[i].distance;
      
      if (dist > maxDistance) {
        const steps = Math.ceil(dist / maxDistance) - 1;
        
        for (let j = 1; j <= steps; j++) {
          const f = j / (steps + 1);
          
          const lng = coordinates[i][0] + f * (coordinates[i + 1][0] - coordinates[i][0]);
          const lat = coordinates[i][1] + f * (coordinates[i + 1][1] - coordinates[i][1]);
          newCoordinates.push([lng, lat]);

          const interp = (a: number, b: number) => a + f * (b - a);
          
          newProperties.push({
            altitude: interp(properties[i].altitude, properties[i + 1].altitude),
            speed: interp(properties[i].speed, properties[i + 1].speed),
            time: interp(properties[i].time, properties[i + 1].time),
            compSpeed: interp(properties[i].compSpeed, properties[i + 1].compSpeed),
            compAltitude: interp(properties[i].compAltitude, properties[i + 1].compAltitude),
            distance: interp(properties[i].distance, properties[i + 1].distance)
          });
        }
      }
    }
    
    if (coordinates.length > 0) {
      newCoordinates.push(coordinates[coordinates.length - 1]);
      newProperties.push({ ...properties[properties.length - 1] });
    }

    return { newCoordinates, newProperties };
  }

  /**
   * Filtro Híbrido GPS: Detecta picos midiendo la relación espacial (triangulación)
   * Y verificando que el salto ocurrió a una velocidad físicamente irreal.
   */
  public removeGpsSpikesHybrid(coordinates: number[][], maxValidSpeedMps: number = 15): number[][] {
    if (coordinates.length < 3) return coordinates;

    const cleaned = [coordinates[0]];

    for (let i = 1; i < coordinates.length - 1; i++) {
      const prev = cleaned[cleaned.length - 1]; 
      const curr = coordinates[i];
      const next = coordinates[i + 1];

      // 1. Cálculos de Distancia (Geometría)
      // Usamos TU función computeDistance y multiplicamos por 1000 para trabajar en metros
      const distIn = this.computeDistance(prev[0], prev[1], curr[0], curr[1]) * 1000; 
      const distOut = this.computeDistance(curr[0], curr[1], next[0], next[1]) * 1000; 
      const distBase = this.computeDistance(prev[0], prev[1], next[0], next[1]) * 1000; 

      // 2. Cálculos de Tiempo y Velocidad (Física)
      // Asumimos que el timestamp en milisegundos está en el índice 3: [lng, lat, alt, time]
      const timeInSecs = (curr[3] - prev[3]) / 1000;
      const timeOutSecs = (next[3] - curr[3]) / 1000;

      const speedIn = timeInSecs > 0 ? distIn / timeInSecs : 0;
      const speedOut = timeOutSecs > 0 ? distOut / timeOutSecs : 0;

      // DEFINICIÓN FINAL DE UN PICO (SPIKE):
      
      // Condición A: Efecto Boomerang (La base es menos de un tercio de la ida + vuelta)
      const isBoomerangEffect = distBase < (distIn + distOut) / 3; 

      // Condición B: Velocidad imposible (La ida O la vuelta superan el límite humano razonable)
      const isImpossibleSpeed = speedIn > maxValidSpeedMps || speedOut > maxValidSpeedMps;

      // Condición C: Salto mínimo (evitamos filtrar micro-movimientos de 20 metros estando parados)
      const isSignificantDistance = distIn > 20;

      if (isBoomerangEffect && isImpossibleSpeed && isSignificantDistance) {
        // OUTLIER CONFIRMADO: Es un pico GPS.
        const midLng = (prev[0] + next[0]) / 2;
        const midLat = (prev[1] + next[1]) / 2;
        const midAlt = (prev[2] + next[2]) / 2;
        const midTime = prev[3] + ((next[3] - prev[3]) / 2); 

        // Reemplazamos por el punto medio
        cleaned.push([midLng, midLat, midAlt, midTime]);
        console.log(`Pico híbrido descartado. Velocidad: ${speedIn.toFixed(2)}m/s, Distancia: ${distIn.toFixed(0)}m`);
      } else {
        // PUNTO VÁLIDO: Puede ser un zig-zag lento o una ruta recta rápida.
        cleaned.push(curr);
      }
    }

    // Asegurarnos de meter el último punto
    cleaned.push(coordinates[coordinates.length - 1]);
    return cleaned;
  }


}