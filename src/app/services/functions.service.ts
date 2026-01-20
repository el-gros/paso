import DOMPurify from 'dompurify';
import { Track, Location, Data, Waypoint, Bounds, PartialSpeed, TrackDefinition } from 'src/globald';
import { Inject, Injectable } from '@angular/core';
import { Storage } from '@ionic/storage-angular';
import { ToastController, AlertController } from '@ionic/angular';
import { Router } from '@angular/router';
import { ModalController } from '@ionic/angular';
import { WptModalComponent } from '../wpt-modal/wpt-modal.component';
import { register } from 'swiper/element';
register();

const DEG_TO_RAD = Math.PI / 180;
const EARTH_RADIUS_KM = 6371;

@Injectable({
  providedIn: 'root'
})

export class FunctionsService {
  private _storage: Storage | null = null;
  refreshCollectionUI?: () => void;

  // Variables to share across components
  key: string | undefined = undefined;
  buildTrackImage: boolean = false;
  selectedAltitude: string = 'GPS'; // Default altitude method
  lag: number = 8;
  geocoding: string = 'maptiler';
  collection: TrackDefinition []= [];
  properties: (keyof Data)[] = ['compAltitude', 'compSpeed'];
   // Re-draw tracks?
  reDraw: boolean = false;
  alert: string = 'on';
  // Averages
  averageSpeed: number = 0;
  averageMotionSpeed: number = 0;
  
  constructor(
    private storage: Storage,
    private toastController: ToastController,
    private alertController: AlertController,
    @Inject(Router) private router: Router,
    private modalController: ModalController,
  ) {
  }

  /* FUNCTIONS
    1. computeDistance
    2. formatMillisecondsToUTC

    4. fillGeojson
    5. storeSet
    6. storeGet
    7. storeRem
    8. check
    9. displayToast
    10. uncheckAll
    11. computeCumulativeDistances
    12. retrieveTrack
    13. showAlert
    14. computeElevationGainAndLoss
    15. fillProperties
    16. computeMinMaxProperty
    17. createTimes

    19. editWaypoint
    20. gotoPage

    23. adjustCoordinatesAndProperties
    24. sanitize
  */


  async init() {
    this._storage = await this.storage.create();
  }

  // 1. COMPUTES DISTANCES /////////////////////////////////////
  computeDistance(lon1: number, lat1: number, lon2: number, lat2: number): number {
    // differences in latitude and longitude in radians
    const dLat = (lat2 - lat1) * DEG_TO_RAD;
    const dLon = (lon2 - lon1) * DEG_TO_RAD;
    // Haversine formula
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * DEG_TO_RAD) * Math.cos(lat2 * DEG_TO_RAD) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    // angular distance in radians
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    // distance in km
    return EARTH_RADIUS_KM * c;
  }

  // 2. FORMAT MILISECONDS TO HH:MM:SS
  formatMillisecondsToUTC(milliseconds: number): string {
    const padZero = (num: number) => num.toString().padStart(2, '0');
    // convert ms to hours, minutes and seconds
    const seconds = Math.floor(milliseconds / 1000);
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;
    // format
    return `${padZero(hours)}:${padZero(minutes)}:${padZero(remainingSeconds)}`;
  }

  async filterSpeedAndAltitude(track: any, initial: number): Promise<typeof data> {
    let data = track.features[0].geometry.properties.data;
    const num = data.length;

    for (let i = initial; i < num; i++) {
      // 1. CÁLCULO DE VELOCIDAD COMPENSADA (Basada en distancias acumuladas)
      const start = Math.max(i - this.lag, 0);
      const distDelta = data[i].distance - data[start].distance;
      const timeDelta = data[i].time - data[start].time;
      
      data[i].compSpeed = timeDelta > 0 ? (3600000 * distDelta) / timeDelta : 0;
      track.features[0].properties.totalTime = data[i].time - data[0].time;

      // tiempo en movimiento
      if (data[i].compSpeed > 1) {
        const motionTime = (data[i].time - data[i - 1].time); // in msec 
        track.features[0].properties.inMotion += motionTime 
      }
      // Compute average speed
      this.averageMotionSpeed = track.features[0].properties.inMotion > 0 ? (3600000 * data[i].distance) / track.features[0].properties.inMotion : 0;
      this.averageSpeed = track.features[0].properties.totalTime > 0 ? (3600000 * data[i].distance) / track.features[0].properties.totalTime : 0;

      // 2. CÁLCULO DE ALTITUD COMPENSADA (Filtro de Media Móvil)
     
      let sum = 0;
      let n = 0;
      for (let j = start; j <= i; j++) {
        sum += data[j].altitude; // <--- CORREGIDO: Usamos el índice j
        n++;
      } 
      
      if (n > 0) {
        data[i].compAltitude = sum / n;
      } else {
        data[i].compAltitude = data[i].altitude;
      }
      // Elevation gain and loss
      const diff = data[i].compAltitude - data[i-1].compAltitude;
      if (diff > 0) track.features[0].properties.totalElevationGain += diff;
      else track.features[0].properties.totalElevationLoss -= diff;
    }
    track.features[0].properties.currentSpeed = data[num-1].compSpeed;
    track.features[0].properties.currentAltitude = data[num-1].compAltitude;
    
    return track;
  }
 
  async computeCompSpeed(data: any[], initial: number): Promise<any[]> {
      const num = data.length;
      for (let i = initial; i < num; i++) {
          const startSpeed = Math.max(i - this.lag, 0);
          const distDelta = data[i].distance - data[startSpeed].distance;
          const timeDelta = data[i].time - data[startSpeed].time;
          
          // Calculamos velocidad suavizada por el lag
          data[i].compSpeed = timeDelta > 0 ? (3600000 * distDelta) / timeDelta : 0;
      }
      //const timeDist = data[num-1].time - data[0].time
      //this.averageSpeed = timeDist > 0 ? (3600000 * data[num-1].distance) / timeDist : 0;
      return data;
  }

  // 5. STORAGE SET ///////////////////
  async storeSet(key: string, object: any ): Promise<void> {
    return this._storage?.set(key, object)
  }

  // 6. STORAGE GET /////////////////////
  async storeGet(key: string ) {
    return this._storage?.get(key);
  }

  // 7. STORAGE REMOVE //////////////////////////
  async storeRem(key: string): Promise<void> {
    return this._storage?.remove(key);
  }

  // 8. CHECK IN STORAGE //////////////////////////
  async check<T>(defaultValue: T, key: string): Promise<T> {
    try {
      const result = await this.storeGet(key);
      if (result !== null && result !== undefined) {
        return result as T;
      }
    } catch (error) {
      console.warn('Storage check failed:', error);
    }
    return defaultValue;
  }

  // 9. DISPLAY TOAST //////////////////////////////
  async displayToast(message: string) {
    const toast = await this.toastController.create({
      message,
      duration: 3000, // 3 seconds
      position: 'bottom', // or 'top', 'middle'
      color: 'dark', // optional: e.g., 'primary', 'success', 'danger', etc.
      cssClass: 'toast', // Add your custom class here
    });
    await toast.present();
  }

  // 11. COMPUTE CUUMULATIVE DISTANCES
  async computeCumulativeDistances(
    rawCoordinates: [number, number][]
  ): Promise<number[]> {
    const distances: number[] = [0];
    for (let i = 1; i < rawCoordinates.length; i++) {
      const [lon1, lat1] = rawCoordinates[i - 1];
      const [lon2, lat2] = rawCoordinates[i];
      const segmentDistance = this.computeDistance(lon1, lat1, lon2, lat2);
      const cumulativeDistance = distances[i - 1] + segmentDistance;
      distances.push(cumulativeDistance);
    }
    return distances;
  }

  // 12. RETRIEVE ARCHIVED TRACK //////////////////////////
  async retrieveTrack() {
    var track: Track | undefined;
    // Retrieve track
    if (this.key) track = await this.storeGet(this.key);
    // Return the retrieved track
    return track;
  }

  // 13. SHOW ALERT ///////////////////////////////////
  async showAlert(cssClass: string, header: string, message: string,
    inputs: any, buttons: any, action: string
  ) {
    const alert = await this.alertController.create({
      cssClass: cssClass,
      header: header,
      message: message,
      inputs: inputs,
      buttons: buttons
    });
    return await alert.present();
  }

  // 14. COMPUTE ELEVATION GAIN & LOSS ///////////////////////
  async computeElevationGainAndLoss(altitudes: number[]): Promise<{ gain: number; loss: number; }> {
    let gain = 0;
    let loss = 0;
    for (let i = 1; i < altitudes.length; i++) {
      const diff = altitudes[i] - altitudes[i - 1];
      if (diff > 0) {
        gain += diff;
      } else if (diff < 0) {
        loss -= diff; // Subtracting a negative to get positive loss
      }
    }
    return { gain, loss };
  }

  // 15. FILL PROPERTIES ///////////////////////////////////////
  async fillProperties(distances: number[] | undefined, altitudes: number[] | undefined, times: number[], speed: number): Promise<Data[] > {
    if (!distances || !altitudes || distances.length !== altitudes.length) {
      return [];
    }
    const result: Data[] = distances.map((distance, i) => ({
      altitude: altitudes[i],
      speed: speed,
      time: times[i],
      compSpeed: speed,
      compAltitude: altitudes[i],
      distance: distance,
    }));
    return result;
  }

  // 16. COMPUTE MAXIMUM AND MINIMUM OF A PROPERTY /////
  async computeMinMaxProperty(data: Data[], propertyName: keyof Data): Promise<Bounds> {
    if (data.length === 0) {
      throw new Error('Data array is empty.');
    }

    // Inicializamos con el primer valor
    let min = data[0][propertyName] as number;
    let max = data[0][propertyName] as number;

    // Recorremos una sola vez (O(n)) sin duplicar el array en memoria
    for (let i = 1; i < data.length; i++) {
      const val = data[i][propertyName] as number;

      // Validación rápida de seguridad
      if (!Number.isFinite(val)) continue; 

      if (val < min) min = val;
      if (val > max) max = val;
    }

    return { min, max };
  }

  // 17. CREATE TIMES /////////////////////////////////////////
  async createTimes(data: any, date: Date, distances: number[]): Promise<number[]> {
    const totalDistance = data.response.features[0].properties.summary.distance / 1000; // in Km
    const totalDuration = data.response.features[0].properties.summary.duration * 1000; // in ms
    const endTime = date.getTime(); // in ms
    const startTime = endTime - totalDuration;
    return distances.map(d => {
      const ratio = d / totalDistance;
      const timeOffset = ratio * totalDuration;
      return Math.round(startTime + timeOffset); // in ms
    });
  }

  // 19. EDIT WAYPOINT DETAILS //////////////////////////////
  async editWaypoint(waypoint: Waypoint, showAltitude: boolean, edit: boolean) {
    // Extract selected track details
    const wptEdit = {
      name: this.sanitize((waypoint.name || '')
        .replace("<![CDATA[", "")
        .replace("]]>", "")
        .replace(/\n/g, '<br>')),
      altitude: waypoint.altitude,
      comment: this.sanitize((waypoint.comment || '')
        .replace("<![CDATA[", "")
        .replace("]]>", "")
        .replace(/\n/g, '<br>')),
    };
    // Open the modal for editing
    const modal = await this.modalController.create({
      component: WptModalComponent,
      componentProps: { wptEdit, edit, showAltitude },
      cssClass: ['modal-class','yellow-class'] ,
      backdropDismiss: true, // Allow dismissal by tapping the backdrop
    });
    await modal.present();
    // Handle the modal's dismissal
    const { data } = await modal.onDidDismiss();
    if (data) {
      return data
    }
  }

  // 20. GO TO PAGE ... //////////////////////////////
  async gotoPage(option: string) {
    this.router.navigate([option]);
  }

  // 23. ADJUST COORDINATES AND PROPERTIES //////////////////////////
  async adjustCoordinatesAndProperties(
    coordinates: [number, number][],
    properties: Data[],
    maxDistance: number
  ): Promise<{
    newCoordinates: [number, number][];
    newProperties: Data[];
  }> {
    if (
      coordinates.length !== properties.length ||
      coordinates.length <= 1
    ) {
      throw new Error('Input arrays must be of equal length and contain more than one element.');
    }
    // Estimate the maximum possible size for preallocation
    let estimatedSize = coordinates.length;
    for (let i = 0; i < coordinates.length - 1; i++) {
      const distance = properties[i + 1].distance - properties[i].distance;
      if (distance > maxDistance) {
        estimatedSize += Math.ceil(distance / maxDistance) - 1;
      }
    }
    const newCoordinates: [number, number][] = new Array(estimatedSize);
    const newProperties: Data[] = new Array(estimatedSize);
    let idx = 0;
    for (let i = 0; i < coordinates.length - 1; i++) {
      const [lon1, lat1] = coordinates[i];
      const [lon2, lat2] = coordinates[i + 1];
      const prop1 = properties[i];
      const prop2 = properties[i + 1];
      newCoordinates[idx] = [lon1, lat1];
      newProperties[idx] = { ...prop1 };
      idx++;
      const distance = prop2.distance - prop1.distance;
      if (distance > maxDistance) {
        const numIntermediatePoints = Math.ceil(distance / maxDistance) - 1;
        for (let j = 1; j <= numIntermediatePoints; j++) {
          const fraction = j / (numIntermediatePoints + 1);
          const interpolatedLon = lon1 + fraction * (lon2 - lon1);
          const interpolatedLat = lat1 + fraction * (lat2 - lat1);
          newCoordinates[idx] = [interpolatedLon, interpolatedLat];
          const interp = (a: number, b: number) => a + fraction * (b - a);
          newProperties[idx] = {
            altitude: interp(prop1.altitude, prop2.altitude),
            speed: interp(prop1.speed, prop2.speed),
            time: interp(prop1.time, prop2.time),
            compSpeed: interp(prop1.compSpeed, prop2.compSpeed),
            compAltitude: interp(prop1.compAltitude, prop2.compAltitude),
            distance: interp(prop1.distance, prop2.distance),
          };
          idx++;
        }
      }
    }
    newCoordinates[idx] = coordinates[coordinates.length - 1];
    newProperties[idx] = { ...properties[properties.length - 1] };
    // Trim arrays to actual used size
    return {
      newCoordinates: newCoordinates.slice(0, idx + 1),
      newProperties: newProperties.slice(0, idx + 1)
    };
  }

  // 24. SANITIZE INPUT /////////////////////////////////////////
  sanitize(input: string): string {
    return DOMPurify.sanitize(input, { ALLOWED_TAGS: [], ALLOWED_ATTR: [], FORBID_TAGS: ['style', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'svg', 'math'], FORBID_ATTR: ['style', 'onerror', 'onclick', 'onload', 'onmouseover', 'onfocus', 'oninput', 'onchange'] }).trim();
  }


  async computePartialSpeeds(track: any): Promise<PartialSpeed[]> {
    function formatDuration(sec: number): string {
      const h = Math.floor(sec / 3600);
      const m = Math.floor((sec % 3600) / 60);
      const s = Math.floor(sec % 60);
      return [h, m, s].map((v) => v.toString().padStart(2, "0")).join(":");
    }

    const data: Data[] = track?.features?.[0]?.geometry?.properties?.data || [];
    if (!data.length) return [];

    const results: PartialSpeed[] = [];
    let kmIndex = 1;                 // next whole-km boundary (in km)
    let startDist = data[0].distance; // km
    let startTime = data[0].time;     // ms

    for (let i = 1; i < data.length; i++) {
      const prev = data[i - 1];
      const curr = data[i];

      // skip if no distance progress in this segment
      if (curr.distance <= prev.distance) continue;

      while (curr.distance >= kmIndex) {
        const targetDist = kmIndex; // in km
        const denom = (curr.distance - prev.distance);
        if (denom <= 0) break; // safety

        const ratio = (targetDist - prev.distance) / denom;
        const interpTime = prev.time + ratio * (curr.time - prev.time); // ms

        const distKm = targetDist - startDist; // km covered since last boundary
        const durMs = interpTime - startTime;   // ms
        const durS = durMs / 1000;              // seconds

        if (durS > 0 && distKm > 0) {
          // speed in km/h
          const speedKmh = (distKm * 3600) / durS;
          const label = `${kmIndex - 1}-${kmIndex} km`;
          results.push([label, formatDuration(Math.round(durS)), Number(speedKmh.toFixed(2))]);
        }

        startDist = targetDist;
        startTime = interpTime;
        kmIndex++;
      }
    }

    // last fractional segment (no trailing 'km' in label)
    const last = data[data.length - 1];
    if (last.distance > startDist) {
      const distKm = last.distance - startDist;
      const durMs = last.time - startTime;
      const durS = durMs / 1000;
      if (durS > 0 && distKm > 0) {
        const speedKmh = (distKm * 3600) / durS;
        const label = `${kmIndex - 1}-end`; // no ' km'
        results.push([label, formatDuration(Math.round(durS)), Number(speedKmh.toFixed(2))]);
      }
    }

    return results;
  }

  quickDistance(lon1: number, lat1: number, lon2: number, lat2: number): number {
    if (lat1 === lat2 && lon1 === lon2) return 0;

    const R = 6371; // Earth radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

}



