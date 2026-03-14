import { Injectable } from '@angular/core';
import { Track, Data, Bounds, PartialSpeed } from 'src/globald';
import { GeoidService } from './geoid.service';

const DEG_TO_RAD = Math.PI / 180;
const EARTH_RADIUS_KM = 6371;

@Injectable({
  providedIn: 'root'
})
export class GeoMathService {

  // --- ESTADÍSTICAS VOLÁTILES ---
  public averageSpeed: number = 0;
  public averageMotionSpeed: number = 0;
  public lastStableAlt: number = 0;

  // --- ESTADO DEL FILTRO DE KALMAN ---
  private k_q = 0.1; 
  private k_r = 1.5; 
  private k_p = 1.0; 
  private k_v = 0.0; 

  constructor(
        private geoidService: GeoidService
  ) {}

  // ==========================================================================
  // 1. FILTRADO Y SUAVIZADO (Kalman & Altitud)
  // ==========================================================================

  private applyKalman(measurement: number): number {
    this.k_p = this.k_p + this.k_q;
    const k_gain = this.k_p / (this.k_p + this.k_r);
    this.k_v = this.k_v + k_gain * (measurement - this.k_v);
    this.k_p = (1 - k_gain) * this.k_p;
    return this.k_v;
  }

  /**
   * Filtra velocidad y altitud, aplica corrección del geoide y calcula desniveles.
   * @param track El objeto Track a procesar
   * @param initial Índice desde el cual empezar el filtrado
   */
  /**
   * Filtra velocidad y altitud, aplica corrección del geoide y calcula desniveles.
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
      console.log(`[GeoMath] Punto CERO -> Alt original: ${firstPoint.altitude}, geoidApplied: ${firstPoint.geoidApplied}, isMSL: ${firstPoint.isMSL}`);

      // Verificamos si la corrección ya la hizo el SO (isMSL) o LocationManager (geoidApplied)
      if (firstPoint.geoidApplied === false || firstPoint.isMSL === false) {
        const lon = coords[0][0];
        const lat = coords[0][1];
        firstPoint.altitude = this.geoidService.getCorrectedAltitude(lat, lon, firstPoint.altitude);
        console.log(`[GeoMath] Punto CERO -> Se ha aplicado corrección. Nueva Alt: ${firstPoint.altitude}`);
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
        curr.altitude = this.geoidService.getCorrectedAltitude(lat, lon, curr.altitude);
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

  computeDistance(lon1: number, lat1: number, lon2: number, lat2: number): number {
    const dLat = (lat2 - lat1) * DEG_TO_RAD;
    const dLon = (lon2 - lon1) * DEG_TO_RAD;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * DEG_TO_RAD) * Math.cos(lat2 * DEG_TO_RAD) * Math.sin(dLon / 2) ** 2;
    return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  quickDistance(lon1: number, lat1: number, lon2: number, lat2: number): number {
    return this.computeDistance(lon1, lat1, lon2, lat2);
  }

  private updateBBox(bbox: [number, number, number, number], coord: number[]): void {
    bbox[0] = Math.min(bbox[0], coord[0]); // Min Lon
    bbox[1] = Math.min(bbox[1], coord[1]); // Min Lat
    bbox[2] = Math.max(bbox[2], coord[0]); // Max Lon
    bbox[3] = Math.max(bbox[3], coord[1]); // Max Lat
  }

  // ==========================================================================
  // 3. CÁLCULO DE DISTANCIAS ACUMULADAS (Las que faltaban)
  // ==========================================================================

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
  // 4. GENERACIÓN DE ESTADÍSTICAS Y PARCIALES
  // ==========================================================================

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

  computeMinMaxProperty(data: Data[], propertyName: keyof Data): Bounds {
    let min = Infinity, max = -Infinity;
    data.forEach(d => {
      const val = d[propertyName] as number;
      if (Number.isFinite(val)) { 
        min = Math.min(min, val); 
        max = Math.max(max, val); 
      }
    });
    return { min: min === Infinity ? 0 : min, max: max === -Infinity ? 0 : max };
  }

  // ==========================================================================
  // 5. UTILIDADES DE INTERPOLACIÓN (Rutas externas / Simulación)
  // ==========================================================================

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

  createTimes(data: any, date: Date, distances: number[]): number[] {
    const summary = data.response?.features?.[0]?.properties?.summary;
    if (!summary) return distances.map(() => date.getTime());

    const startTime = date.getTime() - (summary.duration * 1000);
    const totalDist = summary.distance / 1000;
    
    return distances.map(d => Math.round(startTime + (d / totalDist) * (summary.duration * 1000)));
  }

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


}