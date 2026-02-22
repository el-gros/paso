import { Inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { ToastController, PopoverController } from '@ionic/angular';
import { Storage } from '@ionic/storage-angular';
import { TranslateService } from '@ngx-translate/core';
import DOMPurify from 'dompurify';
import { register } from 'swiper/element/bundle';

// Interfaces personalizadas
import { Track, Data, Waypoint, Bounds, PartialSpeed, TrackDefinition, TrackFeature } from 'src/globald';

register();

const DEG_TO_RAD = Math.PI / 180;
const EARTH_RADIUS_KM = 6371;

@Injectable({
  providedIn: 'root'
})
export class FunctionsService {
  private _storage: Storage | null = null;
  
  // Callbacks y Estado
  refreshCollectionUI?: () => void;
  key: string | undefined = undefined;
  buildTrackImage: boolean = false;
  reDraw: boolean = false;
  
  // Configuración
  lag: number = 8;
  geocoding: string = 'maptiler';
  alert: string = 'on';
  
  // Datos
  collection: TrackDefinition[] = [];
  properties: (keyof Data)[] = ['compAltitude', 'compSpeed'];
  
  // Estadísticas volátiles
  averageSpeed: number = 0;
  averageMotionSpeed: number = 0;

  // Variables Kalman
  private k_q = 0.1; 
  private k_r = 1.5; 
  private k_p = 1.0; 
  private k_v = 0.0; 

  public isNavigating: boolean = false;

  constructor(
    private storage: Storage,
    private toastController: ToastController,
    @Inject(Router) private router: Router,
    private popoverController: PopoverController,
    private translate: TranslateService,
  ) {}

  async init() {
    this._storage = await this.storage.create();
  }

  // --- STORAGE ---

  async storeSet(key: string, object: any): Promise<void> { 
    await this._storage?.set(key, object); 
  }

  async storeGet<T = any>(key: string): Promise<T | null> { 
    return await this._storage?.get(key); 
  }

  async storeRem(key: string): Promise<void> { 
    await this._storage?.remove(key); 
  }

  async check<T>(defaultValue: T, key: string): Promise<T> {
    const res = await this.storeGet<T>(key);
    return (res !== null && res !== undefined) ? res : defaultValue;
  }

  async retrieveTrack(): Promise<Track | undefined> {
    if (!this.key) return undefined;
    const res = await this.storeGet<Track>(this.key);
    return res || undefined;
  }

  // --- MATH & KALMAN ---

  private applyKalman(measurement: number): number {
    this.k_p = this.k_p + this.k_q;
    const k_gain = this.k_p / (this.k_p + this.k_r);
    this.k_v = this.k_v + k_gain * (measurement - this.k_v);
    this.k_p = (1 - k_gain) * this.k_p;
    return this.k_v;
  }

  // --- PROCESAMIENTO DE TRACKS ---

  async filterSpeedAndAltitude(track: Track, initial: number): Promise<Track> {
    const feature = track.features[0];
    if (!feature || !feature.geometry || !feature.geometry.properties) return track;

    const data: Data[] = feature.geometry.properties.data;
    const props = feature.properties;
    const num = data.length;
    
    const MOVING_THRESHOLD = 0.8; // km/h
    const ALT_SMOOTHING = 0.15;   // Factor EMA
    const VERTICAL_THRESHOLD = 2.0; // metros mínimos para registrar cambio

    // Variable auxiliar para el umbral de acumulación (Histéresis)
    let lastStableAlt = (initial > 0 && data[initial - 1]) 
      ? data[initial - 1].compAltitude 
      : data[0].altitude;

    if (initial === 0) {
      this.k_p = 1.0; 
      this.k_v = 0;
      props.inMotion = 0;
      props.totalElevationGain = 0;
      props.totalElevationLoss = 0;
      props.totalTime = 0;
      data[0].compAltitude = data[0].altitude;
      data[0].compSpeed = 0;
    }

    const startIndex = initial === 0 ? 1 : initial + 1;

    for (let i = startIndex; i < num; i++) {
      const prev = data[i - 1];
      const curr = data[i];

      // --- VELOCIDAD (Kalman) ---
      const distDelta = curr.distance - prev.distance;
      const timeDelta = curr.time - prev.time;
      const rawSpeed = timeDelta > 0 ? (3600000 * distDelta) / timeDelta : 0;
      curr.compSpeed = this.applyKalman(rawSpeed);

      props.totalTime = curr.time - data[0].time;
      if (curr.compSpeed > MOVING_THRESHOLD) {
        props.inMotion += timeDelta;
      }

      // --- ALTITUD SUAVIZADA (EMA) ---
      // Esto es lo que se dibujará en el Canvas
      curr.compAltitude = prev.compAltitude + ALT_SMOOTHING * (curr.altitude - prev.compAltitude);

      // --- CÁLCULO DE DESNIVEL CON UMBRAL (Histéresis) ---
      // Solo sumamos a las estadísticas si el cambio respecto a la última cota 
      // estable supera el VERTICAL_THRESHOLD
      const verticalDiff = curr.compAltitude - lastStableAlt;

      if (Math.abs(verticalDiff) >= VERTICAL_THRESHOLD) {
        if (verticalDiff > 0) {
          props.totalElevationGain += verticalDiff;
        } else {
          props.totalElevationLoss += Math.abs(verticalDiff);
        }
        // Actualizamos la marca estable para la siguiente comparación
        lastStableAlt = curr.compAltitude;
      }
    }

    // Actualización de propiedades finales
    props.currentSpeed = data[num - 1].compSpeed;
    props.currentAltitude = data[num - 1].compAltitude;

    // --- NEW: AVERAGE SPEED CALCULATIONS ---
    // Convert ms to hours (1 hour = 3,600,000 ms)
    const hoursTotal = props.totalTime / 3600000;
    const hoursInMotion = props.inMotion / 3600000;

    // Calculate speeds, guarding against division by zero
    this.averageSpeed = hoursTotal > 0 ? (props.totalDistance / hoursTotal) : 0;
    this.averageMotionSpeed = hoursInMotion > 0 ? (props.totalDistance / hoursInMotion) : 0;

    return track;
  }

  async computeElevationGainAndLoss(altitudes: number[]): Promise<{ gain: number; loss: number; }> {
    let gain = 0, loss = 0;
    for (let i = 1; i < altitudes.length; i++) {
      const diff = altitudes[i] - altitudes[i - 1];
      if (diff > 0) gain += diff;
      else if (diff < 0) loss -= diff;
    }
    return { gain, loss };
  }

  computeDistance(lon1: number, lat1: number, lon2: number, lat2: number): number {
    const dLat = (lat2 - lat1) * DEG_TO_RAD;
    const dLon = (lon2 - lon1) * DEG_TO_RAD;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * DEG_TO_RAD) * Math.cos(lat2 * DEG_TO_RAD) * Math.sin(dLon / 2) ** 2;
    return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  // Alias para mantener compatibilidad
  quickDistance(lon1: number, lat1: number, lon2: number, lat2: number): number {
    return this.computeDistance(lon1, lat1, lon2, lat2);
  }

  async computeCumulativeDistances(coords: [number, number][]): Promise<number[]> {
    if (coords.length === 0) return [];
    const dists = [0];
    for (let i = 1; i < coords.length; i++) {
      const d = this.computeDistance(coords[i-1][0], coords[i-1][1], coords[i][0], coords[i][1]);
      dists.push(dists[i-1] + d);
    }
    return dists;
  }

  async fillProperties(distances: number[], altitudes: number[], times: number[], speed: number): Promise<Data[]> {
    return distances.map((d, i) => ({ 
      altitude: altitudes[i], 
      speed, 
      time: times[i], 
      compSpeed: speed, 
      compAltitude: altitudes[i], 
      distance: d 
    }));
  }

  async computeMinMaxProperty(data: Data[], propertyName: keyof Data): Promise<Bounds> {
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

  // Este método asume una estructura específica de respuesta API (OpenRouteService/GraphHopper)
  async createTimes(data: any, date: Date, distances: number[]): Promise<number[]> {
    // TODO: Tipar 'data' con una interfaz de respuesta de API si es posible
    const summary = data.response?.features?.[0]?.properties?.summary;
    if (!summary) return distances.map(() => date.getTime());

    const startTime = date.getTime() - (summary.duration * 1000);
    const totalDist = summary.distance / 1000;
    
    return distances.map(d => Math.round(startTime + (d / totalDist) * (summary.duration * 1000)));
  }

  async adjustCoordinatesAndProperties(coordinates: [number, number][], properties: Data[], maxDistance: number) {
    let newCoordinates: [number, number][] = [];
    let newProperties: Data[] = [];

    for (let i = 0; i < coordinates.length - 1; i++) {
      newCoordinates.push(coordinates[i]);
      newProperties.push({ ...properties[i] });

      const dist = properties[i + 1].distance - properties[i].distance;
      
      if (dist > maxDistance) {
        const steps = Math.ceil(dist / maxDistance) - 1;
        
        for (let j = 1; j <= steps; j++) {
          const f = j / (steps + 1);
          
          // Interpolación de coordenadas
          const lng = coordinates[i][0] + f * (coordinates[i + 1][0] - coordinates[i][0]);
          const lat = coordinates[i][1] + f * (coordinates[i + 1][1] - coordinates[i][1]);
          newCoordinates.push([lng, lat]);

          // Interpolación de propiedades
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
    
    // Añadir el último punto
    newCoordinates.push(coordinates[coordinates.length - 1]);
    newProperties.push({ ...properties[properties.length - 1] });

    return { newCoordinates, newProperties };
  }

  async computePartialSpeeds(track: Track): Promise<PartialSpeed[]> {
    const data: Data[] = track?.features?.[0]?.geometry?.properties?.data || [];
    if (!data.length) return [];
    
    const results: PartialSpeed[] = [];
    let kmIndex = 1;
    let startTime = data[0].time;

    for (let i = 1; i < data.length; i++) {
      // Detectar cruce de kilómetro entero
      if (data[i].distance >= kmIndex && data[i].distance > data[i-1].distance) {
        // Interpolación lineal para encontrar el tiempo exacto del cruce
        const ratio = (kmIndex - data[i-1].distance) / (data[i].distance - data[i-1].distance);
        const crossingTime = data[i-1].time + ratio * (data[i].time - data[i-1].time);
        
        const durS = (crossingTime - startTime) / 1000;
        
        if (durS > 0) {
          const kmh = Number((3600 / durS).toFixed(2));
          results.push([`${kmIndex-1}-${kmIndex} km`, this.formatMillisecondsToUTC(durS * 1000), kmh]);
        }
        
        startTime = crossingTime;
        kmIndex++;
      }
    }
    return results;
  }

  // --- UI & UTILS ---

  sanitize(input: string): string {
    const clean = (input || '').replace(/<!\[CDATA\[/g, "").replace(/\]\]>/g, "").replace(/\n/g, '<br>');
    return DOMPurify.sanitize(clean, { ALLOWED_TAGS: ['br'] }).trim();
  }

  formatMillisecondsToUTC(ms: number): string {
    const s = Math.floor(ms / 1000);
    const hours = Math.floor(s / 3600);
    const minutes = Math.floor((s % 3600) / 60);
    const seconds = s % 60;
    return [hours, minutes, seconds].map(v => v.toString().padStart(2, '0')).join(':');
  }

  formatMsec(value: number | undefined): string {
    return value ? this.formatMillisecondsToUTC(value) : '00:00:00';
  }

  async editWaypoint(waypoint: Waypoint, showAltitude: boolean, edit: boolean): Promise<{ action: string; name?: string; comment?: string } | undefined> {
    // Importamos el componente dinámicamente si es necesario, o asumimos que ya está importado arriba
    const { WptPopoverComponent } = await import('../wpt-popover.component'); 

    const popover = await this.popoverController.create({
      component: WptPopoverComponent,
      componentProps: {
        wptEdit: {
          ...waypoint,
          name: this.sanitize(waypoint.name || ''),
          comment: this.sanitize(waypoint.comment || '')
        },
        edit,
        showAltitude
      },
      cssClass: 'glass-island-wrapper',
      translucent: true,
      dismissOnSelect: false,
      backdropDismiss: true
    });

    await popover.present();
    const { data } = await popover.onDidDismiss();
    return data;
  }

  async displayToast(message: string, css: string) {
      const finalMessage = this.translate.instant(message);

      const toast = await this.toastController.create({ 
        message: finalMessage, 
        duration: 3000, 
        position: 'bottom', 
        cssClass: `toast toast-${css}`,
        buttons: [
          {
            icon: 'close-sharp',
            role: 'cancel', 
            handler: () => {
              console.log('Toast cerrado manualmente');
            }
          }
        ]
      });
      await toast.present();
  }

  async gotoPage(path: string) {
    // If we are already going somewhere, STOP.
    if (this.isNavigating) return;

    // Lock navigation
    this.isNavigating = true;

    // Navigate
    this.router.navigate([path]);

    // Unlock after 1 second (enough time for the page transition to start)
    setTimeout(() => {
      this.isNavigating = false;
    }, 1000);
  }
}