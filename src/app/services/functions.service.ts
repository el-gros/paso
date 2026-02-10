import DOMPurify from 'dompurify';
import { Track, Data, Waypoint, Bounds, PartialSpeed, TrackDefinition } from 'src/globald';
import { Inject, Injectable } from '@angular/core';
import { Storage } from '@ionic/storage-angular';
import { ToastController, PopoverController } from '@ionic/angular';
import { Router } from '@angular/router';
import { WptPopoverComponent } from '../wpt-popover.component';
import { register } from 'swiper/element';
import { TranslateService } from '@ngx-translate/core'; // Importar
register();

const DEG_TO_RAD = Math.PI / 180;
const EARTH_RADIUS_KM = 6371;

@Injectable({
  providedIn: 'root'
})
export class FunctionsService {
  private _storage: Storage | null = null;
  refreshCollectionUI?: () => void;

  key: string | undefined = undefined;
  buildTrackImage: boolean = false;
  // selectedAltitude: string = 'GPS'; 
  lag: number = 8;
  geocoding: string = 'maptiler';
  collection: TrackDefinition[] = [];
  properties: (keyof Data)[] = ['compAltitude', 'compSpeed'];
  reDraw: boolean = false;
  alert: string = 'on';
  
  averageSpeed: number = 0;
  averageMotionSpeed: number = 0;

  private k_q = 0.1; 
  private k_r = 1.5; 
  private k_p = 1.0; 
  private k_v = 0.0; 

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

  // --- RECUPERAR TRACK ---
  async retrieveTrack() {
    if (!this.key) return undefined;
    return await this.storeGet(this.key);
  }

  private applyKalman(measurement: number): number {
    this.k_p = this.k_p + this.k_q;
    const k_gain = this.k_p / (this.k_p + this.k_r);
    this.k_v = this.k_v + k_gain * (measurement - this.k_v);
    this.k_p = (1 - k_gain) * this.k_p;
    return this.k_v;
  }

  async filterSpeedAndAltitude(track: any, initial: number): Promise<any> {
    const data: Data[] = track.features[0].geometry.properties.data;
    const props = track.features[0].properties;
    const num = data.length;
    
    // Parámetros de umbral
    const ELEVATION_THRESHOLD = 2.0; 
    const MOVING_THRESHOLD = 0.8; // km/h
    
    // Referencia para el cálculo de desnivel
    let lastSteadyAlt = (initial > 0 && data[initial - 1]) 
      ? data[initial - 1].compAltitude 
      : data[0].altitude;

    // Inicialización si empezamos de cero
    if (initial === 0) {
      this.k_p = 1.0; 
      this.k_v = 0;
      props.inMotion = 0;
      props.totalElevationGain = 0;
      props.totalElevationLoss = 0;
      props.totalTime = 0;
    }

    for (let i = initial; i < num; i++) {
      // 1. CÁLCULO DE VELOCIDAD FILTRADA
      const start = Math.max(i - this.lag, 0);
      const distDelta = data[i].distance - data[start].distance;
      const timeDelta = data[i].time - data[start].time;
      
      const rawSpeed = timeDelta > 0 ? (3600000 * distDelta) / timeDelta : 0;
      data[i].compSpeed = this.applyKalman(rawSpeed);

      // 2. CÁLCULO DE TIEMPOS
      props.totalTime = data[i].time - data[0].time;

      if (i > 0) {
        const deltaT = data[i].time - data[i - 1].time;
        // Solo sumamos el intervalo si la velocidad actual indica movimiento
        if (data[i].compSpeed > MOVING_THRESHOLD) {
          props.inMotion += deltaT;
        }
      }

      // 3. CÁLCULO DE ALTITUD FILTRADA (Media móvil)
      let sum = 0;
      let count = 0;
      for (let j = start; j <= i; j++) { 
        sum += data[j].altitude; 
        count++;
      }
      data[i].compAltitude = sum / count;

      // 4. ACUMULACIÓN DE DESNIVEL (Solo si supera el umbral para evitar ruido)
      const diff = data[i].compAltitude - lastSteadyAlt;
      if (Math.abs(diff) >= ELEVATION_THRESHOLD) {
        if (diff > 0) {
          props.totalElevationGain += diff;
        } else {
          props.totalElevationLoss += Math.abs(diff);
        }
        lastSteadyAlt = data[i].compAltitude;
      }
    }

    // 5. CÁLCULOS FINALES Y MEDIAS
    const totalDist = data[num - 1].distance;
    
    // Salvaguarda: El tiempo en movimiento no puede ser mayor al total
    if (props.inMotion > props.totalTime) {
      props.inMotion = props.totalTime;
    }

    this.averageSpeed = props.totalTime > 0 ? (3600000 * totalDist) / props.totalTime : 0;
    this.averageMotionSpeed = props.inMotion > 0 ? (3600000 * totalDist) / props.inMotion : 0;
    
    props.currentSpeed = data[num - 1].compSpeed;
    props.currentAltitude = data[num - 1].compAltitude;

    return track;
  }

  // --- CALCULAR DESNIVELES (Usado en record-popover) ---
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
    const dLat = (lat2 - lat1) * DEG_TO_RAD, dLon = (lon2 - lon1) * DEG_TO_RAD;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * DEG_TO_RAD) * Math.cos(lat2 * DEG_TO_RAD) * Math.sin(dLon / 2) ** 2;
    return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  quickDistance(lon1: number, lat1: number, lon2: number, lat2: number): number {
    return this.computeDistance(lon1, lat1, lon2, lat2);
  }

  formatMillisecondsToUTC(ms: number): string {
    const s = Math.floor(ms / 1000);
    return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map(v => v.toString().padStart(2, '0')).join(':');
  }

  async storeSet(key: string, object: any): Promise<void> { return this._storage?.set(key, object); }
  async storeGet(key: string) { return this._storage?.get(key); }
  async storeRem(key: string): Promise<void> { return this._storage?.remove(key); }

  async check<T>(defaultValue: T, key: string): Promise<T> {
    const res = await this.storeGet(key);
    return (res !== null && res !== undefined) ? res as T : defaultValue;
  }

  async displayToast(message: string, css: string) {
    const isKey: boolean = true;
    // Si isKey es true, busca la traducción; si no, muestra el texto tal cual
    const finalMessage = isKey ? this.translate.instant(message) : message;
    const toast = await this.toastController.create({ 
      message: finalMessage, 
      duration: 3000, 
      position: 'bottom', 
      cssClass: 'toast toast+' + css
    });
    await toast.present();
  }

   async computeCumulativeDistances(coords: [number, number][]): Promise<number[]> {
    const dists = [0];
    for (let i = 1; i < coords.length; i++) dists.push(dists[i-1] + this.computeDistance(coords[i-1][0], coords[i-1][1], coords[i][0], coords[i][1]));
    return dists;
  }

  async fillProperties(distances: number[], altitudes: number[], times: number[], speed: number): Promise<Data[]> {
    return distances.map((d, i) => ({ altitude: altitudes[i], speed, time: times[i], compSpeed: speed, compAltitude: altitudes[i], distance: d }));
  }

  async computeMinMaxProperty(data: Data[], propertyName: keyof Data): Promise<Bounds> {
    let min = Infinity, max = -Infinity;
    data.forEach(d => {
      const val = d[propertyName] as number;
      if (Number.isFinite(val)) { min = Math.min(min, val); max = Math.max(max, val); }
    });
    return { min: min === Infinity ? 0 : min, max: max === -Infinity ? 0 : max };
  }

  async createTimes(data: any, date: Date, distances: number[]): Promise<number[]> {
    const summary = data.response.features[0].properties.summary;
    const startTime = date.getTime() - (summary.duration * 1000);
    const totalDist = summary.distance / 1000;
    return distances.map(d => Math.round(startTime + (d / totalDist) * (summary.duration * 1000)));
  }

  async adjustCoordinatesAndProperties(coordinates: [number, number][], properties: Data[], maxDistance: number) {
    let newCoordinates: [number, number][] = [], newProperties: Data[] = [];
    for (let i = 0; i < coordinates.length - 1; i++) {
      newCoordinates.push(coordinates[i]); newProperties.push({...properties[i]});
      const dist = properties[i+1].distance - properties[i].distance;
      if (dist > maxDistance) {
        const steps = Math.ceil(dist / maxDistance) - 1;
        for (let j = 1; j <= steps; j++) {
          const f = j / (steps + 1);
          newCoordinates.push([coordinates[i][0] + f*(coordinates[i+1][0]-coordinates[i][0]), coordinates[i][1] + f*(coordinates[i+1][1]-coordinates[i][1])]);
          const interp = (a: number, b: number) => a + f*(b-a);
          newProperties.push({ altitude: interp(properties[i].altitude, properties[i+1].altitude), speed: interp(properties[i].speed, properties[i+1].speed), time: interp(properties[i].time, properties[i+1].time), compSpeed: interp(properties[i].compSpeed, properties[i+1].compSpeed), compAltitude: interp(properties[i].compAltitude, properties[i+1].compAltitude), distance: interp(properties[i].distance, properties[i+1].distance) });
        }
      }
    }
    newCoordinates.push(coordinates[coordinates.length-1]); newProperties.push({...properties[properties.length-1]});
    return { newCoordinates, newProperties };
  }

  sanitize(input: string): string {
    const clean = (input || '').replace(/<!\[CDATA\[/g, "").replace(/\]\]>/g, "").replace(/\n/g, '<br>');
    return DOMPurify.sanitize(clean, { ALLOWED_TAGS: ['br'] }).trim();
  }

  async editWaypoint(waypoint: Waypoint, showAltitude: boolean, edit: boolean) {
    const popover = await this.popoverController.create({
      component: WptPopoverComponent,
      componentProps: {
        // Pasamos una copia limpia del waypoint sanitizado
        wptEdit: {
          ...waypoint,
          name: this.sanitize(waypoint.name || ''),
          comment: this.sanitize(waypoint.comment || '')
        },
        edit,
        showAltitude
      },
      // Eliminamos las clases de modal y podemos usar una de popover si fuera necesario
      cssClass: 'floating-popover', 
      translucent: true,
      dismissOnSelect: false,
      backdropDismiss: true
    });

    await popover.present();
    
    const { data } = await popover.onDidDismiss();
    
    // Retornamos la data (que contiene { action, name, comment })
    return data;
  }

  async gotoPage(option: string) { this.router.navigate([option]); }

  async computePartialSpeeds(track: any): Promise<PartialSpeed[]> {
    const data: Data[] = track?.features?.[0]?.geometry?.properties?.data || [];
    if (!data.length) return [];
    const results: PartialSpeed[] = [];
    let kmIndex = 1, startTime = data[0].time;
    for (let i = 1; i < data.length; i++) {
      if (data[i].distance >= kmIndex && data[i].distance > data[i-1].distance) {
        const ratio = (kmIndex - data[i-1].distance) / (data[i].distance - data[i-1].distance);
        const durS = (data[i-1].time + ratio * (data[i].time - data[i-1].time) - startTime) / 1000;
        if (durS > 0) results.push([`${kmIndex-1}-${kmIndex} km`, this.formatMillisecondsToUTC(durS * 1000), Number(((3600) / durS).toFixed(2))]);
        startTime = data[i-1].time + ratio * (data[i].time - data[i-1].time); kmIndex++;
      }
    }
    return results;
  }
}