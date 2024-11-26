import { global } from 'src/environments/environment';
import { Track, Location , TrackDefinition, Bounds } from 'src/globald';
import { Injectable } from '@angular/core';
import { Storage } from '@ionic/storage-angular';
import { ToastController, AlertController } from '@ionic/angular';
import { Geolocation } from '@capacitor/geolocation';
import { Router } from '@angular/router';
import { Stroke, Style } from 'ol/style';

@Injectable({
  providedIn: 'root'
})

export class FunctionsService {

  lag: number = global.lag; // 8

  constructor(
    private storage: Storage,
    private toastController: ToastController,
    private alertController: AlertController,
    private router: Router,
  ) {
  }

  /* FUNCTIONS
    1. computeDistance
    2. formatMillisecondsToUTC
    3. filterSpeed
    4. fillGeojson
    5. storeSet
    6. storeGet
    7. storeRem
    8. check
    9. computeExtremes
    10. displayToast
    11. uncheckAll
    12. getCurrentPosition
    13. retrieveTrack
    14. showAlert
    15. createReadonlyLabel
    16. goHome
    17. computeMinMaxProperty
    18. setStrokeStyle
  */

  // 1. COMPUTES DISTANCES ///////////////////////////////////// 
  async computeDistance(lon1: number, lat1: number, lon2: number, lat2: number): Promise<number> {
    // differences in latitude and longitude in radians
    const DEG_TO_RAD = Math.PI / 180;
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
    const earthRadiusKm = 6371;
    return earthRadiusKm * c;  
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

  // 3. FILTER SPEED ///////////////////////////////////////
  async filterSpeed(data: { altitude: number; speed: number; time: number; compSpeed: number; distance: number }[], initial: number): Promise<typeof data> {
    const num = data.length;
    // loop for points
    for (let i = initial; i < num; i++) {
        const start = Math.max(i - this.lag, 0);
        const distance = data[i].distance - data[start].distance;
        const time = data[i].time - data[start].time;
        // Check to avoid division by zero
        data[i].compSpeed = time > 0 ? (3600000 * distance) / time : 0;
    }
    return data;
  }

  // 4. ADD POINT TO TRACK //////////////////////////////// 
  async fillGeojson(track: Track | undefined, location: Location): Promise<void> {
    if (!track) return;
    // Add minimal data
    track.features[0].geometry.properties.data.push({
        altitude: location.altitude,
        speed: location.speed,
        time: location.time,
        compSpeed: location.speed,  // Initial value; further processing can adjust it
        distance: 0  // Placeholder, will be computed later
    });
    // Add coordinates
    track.features[0].geometry.coordinates.push([location.longitude, location.latitude]);
  }

  // 5. STORAGE SET ///////////////////
  async storeSet(key: string, object: any ) {
    await this.storage.set(key, object)
  }

  // 6. STORAGE GET /////////////////////
  async storeGet(key: string ) {
    var object: any = await this.storage.get(key);
    return object;
  }

  // 7. STORAGE REMOVE //////////////////////////
  async storeRem(key: string) {
    this.storage.remove(key);
  }

  // 8. CHECK IN STORAGE //////////////////////////
  async check(variable: any, key: string) {
    try {
      const result = await this.storeGet(key);
      if (result !== null && result !== undefined) {
        variable = result;
      } else { }
    } catch { }
    return variable
  }

  // 9. COMPUTE TRACK EXTREMES
  async computeExtremes(track: any): Promise<{ minX: number; minY: number; maxX: number; maxY: number } | undefined> {
    // initiate variables
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    // Ensure track data exists and has coordinates
    const coordinates = track?.features?.[0]?.geometry?.coordinates;
    if (!coordinates || !Array.isArray(coordinates)) return undefined;
    // Iterate over each coordinate pair in the array
    for (const [x, y] of coordinates) {
      // Update min and max values for x
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      // Update min and max values for y
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;    
    }
    // Return the computed extremes
    return { minX, minY, maxX, maxY };
  } 

  // 10. DISPLAY TOAST //////////////////////////////
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

  // 11. UNCHECK ALL ///////////////////////////////////////////
  async uncheckAll() {
    const collection: TrackDefinition[] = (await this.storeGet('collection')) ?? [];
    for (const item of collection) {
      if ('isChecked' in item) {
        item.isChecked = false;
      }
    }
    await this.storeSet('collection', collection);
  }

  // 12. GET CURRENT POSITION ////////////////////////////////// 
  async getCurrentPosition(): Promise<[number, number]> {
    try {
      const coordinates = await Geolocation.getCurrentPosition();
      return [coordinates.coords.longitude, coordinates.coords.latitude];
    } 
    catch (error) { return [1, 41.5]; } // Default coordinates 
  }

  // 13. RETRIEVE ARCHIVED TRACK //////////////////////////
  async retrieveTrack() {
    var track: Track | undefined;
    // get collection
    const collection: TrackDefinition[] = await this.storeGet('collection') ?? [];
    // Filter checked tracks and count them
    const checkedTracks = collection.filter(item => item.isChecked);
    // If more than one track is checked, uncheck all
    if (checkedTracks.length > 1) {
      collection.forEach(item => item.isChecked = false);
    }
    // If no tracks are checked, return undefined
    if (checkedTracks.length === 0) return undefined;
    // Retrieve the track associated with the checked item
    const key = checkedTracks[0].date; // Assuming `date` is the key
    track = await this.storeGet(JSON.stringify(key));
    // If track can not be retrieved
    if (!track) this.displayToast('The selected track could not be retrieved');
    // Return the retrieved track
    return track;
  }

  // 14. SHOW ALERT ///////////////////////////////////
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
    alert.present();
  }

  // 15. CREATE READ-ONDLY LABEL
  createReadonlyLabel(name: string, value: string): any {
    return {
      type: 'text',
      name: name,
      value: value,
      cssClass: 'alert-label',
      attributes: { readonly: true }
    };
  }

  // 16. GO HOME ///////////////////////////////
  goHome() {
    this.router.navigate(['tab1']);
  }

  // 17. COMPUTE MAXIMUM AND MINIMUM OF A PROPERTY /////
  async computeMinMaxProperty<T extends Record<string, number>>(data: T[], propertyName: keyof T): Promise<Bounds> {
    if (data.length === 0) {
      throw new Error('Data array is empty.');
    }
    const values = data.map(datum => datum[propertyName]);
    // Validate numeric values
    if (!values.every(Number.isFinite)) {
      throw new Error(`Property ${String(propertyName)} contains non-numeric or invalid values.`);
    }
    // Compute and return bounds
    return {
      min: Math.min(...values),
      max: Math.max(...values)
    };
  }

  // 23. SET STROKE STYLE /////////////////////////////////////////
  setStrokeStyle(color: string): Style {
    return new Style({ stroke: new Stroke({ 
      color: color, 
      width: 5 })
    });
  }

}

