/**
 * Injectable service providing utility functions for geospatial calculations, data formatting, persistent storage, UI interactions, and editing of tracks and waypoints.
 *
 * Integrates with Ionic controllers, modals, and organization-specific data models. Includes methods for distance computation, time formatting, speed filtering, GeoJSON manipulation, storage management, toast and alert display, navigation, editing modals, map pin styling, and input sanitization.
 */

import DOMPurify from 'dompurify';
import { global } from 'src/environments/environment';
import { Track, Location, Data, Waypoint, Bounds } from 'src/globald';
import { Injectable } from '@angular/core';
import { Storage } from '@ionic/storage-angular';
import { ToastController, AlertController } from '@ionic/angular';
import { Router } from '@angular/router';
import { ModalController } from '@ionic/angular';
import { EditModalComponent } from '../edit-modal/edit-modal.component';
import { WptModalComponent } from '../wpt-modal/wpt-modal.component';

@Injectable({
  providedIn: 'root'
})

export class FunctionsService {

  // Optional UI refresh callback, can be set by the consumer of this service
  refreshCollectionUI?: () => void;

  constructor(
    private storage: Storage,
    private toastController: ToastController,
    private alertController: AlertController,
    private router: Router,
    private modalController: ModalController,
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
    9. displayToast
    10. uncheckAll

    12. retrieveTrack
    13. showAlert
    16. computeMinMaxProperty

    18. editTrack
    19. editWaypoint
    20. gotoPage

    23. adjustCoordinatesAndProperties
    24. sanitize
  */

  // 1. COMPUTES DISTANCES /////////////////////////////////////
  computeDistance(lon1: number, lat1: number, lon2: number, lat2: number): number {
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
        const start = Math.max(i - global.lag, 0);
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
    // Update bbox
    const bbox = track.features[0].bbox || [Infinity, Infinity, -Infinity, -Infinity];
    track.features[0].bbox = [
      Math.min(bbox[0], location.longitude),
      Math.min(bbox[1], location.latitude),
      Math.max(bbox[2], location.longitude),
      Math.max(bbox[3], location.latitude)
    ];
  }

  // 5. STORAGE SET ///////////////////
  async storeSet(key: string, object: any ): Promise<void> {
    await this.storage.set(key, object)
  }

  // 6. STORAGE GET /////////////////////
  async storeGet(key: string ) {
    return await this.storage.get(key);
  }

  // 7. STORAGE REMOVE //////////////////////////
  async storeRem(key: string): Promise<void> {
    await this.storage.remove(key);
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

  // 10. UNCHECK ALL ///////////////////////////////////////////
  async uncheckAll() {
    for (const item of global.collection) {
      if ('isChecked' in item) {
        item.isChecked = false;
      }
    }
    await this.storeSet('collection', global.collection);
  }

  // 12. RETRIEVE ARCHIVED TRACK //////////////////////////
  async retrieveTrack() {
    var track: Track | undefined;
    // Retrieve track
    if (global.key != "null") track = await this.storeGet(global.key);
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

  // 16. COMPUTE MAXIMUM AND MINIMUM OF A PROPERTY /////
  async computeMinMaxProperty(data: Data[], propertyName: keyof Data): Promise<Bounds> {
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

  // 18. EDIT TRACK DETAILS //////////////////////////////
  async editTrack(selectedIndex: number, backgroundColor: string, edit: boolean) {
    // Extract selected track details
    const selectedTrack = global.collection[selectedIndex];
    const modalEdit = {
      name: this.sanitize(selectedTrack.name || ''),
      place: this.sanitize(selectedTrack.place || ''),
      description: this.sanitize((selectedTrack.description || '')
        .replace("<![CDATA[", "")
        .replace("]]>", "")
        .replace(/\n/g, '<br>')),
    };
    // Select cssClass
    let cssClass: string[] = []
    if (backgroundColor == '#ffbbbb') cssClass = ['modal-class','red-class']
    else cssClass = ['modal-class','yellow-class']
    // Open the modal for editing
    const modal = await this.modalController.create({
      component: EditModalComponent,
      componentProps: { modalEdit, edit },
      cssClass: cssClass,
      backdropDismiss: true, // Allow dismissal by tapping the backdrop
    });
    await modal.present();
    // Handle the modal's dismissal
    const { data } = await modal.onDidDismiss();
    if (data) {
      let { action, name, place, description } = data;
      if (action === 'ok') {
        // Sanitize all returned user inputs before saving or displaying
        name = this.sanitize(name);
        place = this.sanitize(place);
        description = this.sanitize(description);
        if (!name) name = 'No name'
        Object.assign(selectedTrack, {
          name,
          place,
          description
        });
        await this.storeSet('collection', global.collection);
        const track = await this.storeGet(global.key);
        if (track) {
          Object.assign(track.features[0].properties, {
            name,
            place,
            description
          });
          await this.storeSet(global.key, track);
        }
        this.refreshCollectionUI?.();
      }
    }
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
  private sanitize(input: string): string {
    return DOMPurify.sanitize(input, { ALLOWED_TAGS: [], ALLOWED_ATTR: [], FORBID_TAGS: ['style', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'svg', 'math'], FORBID_ATTR: ['style', 'onerror', 'onclick', 'onload', 'onmouseover', 'onfocus', 'oninput', 'onchange'] }).trim();
  }

  // COMPUTE CYUMULATIVE DISTANCES
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

  async fillProperties(distances: number[] | undefined, altitudes: number[] | undefined, times: number[], speed: number): Promise<Data[] > {
    if (!distances || !altitudes || distances.length !== altitudes.length) {
      return [];
    }
    const result: Data[] = distances.map((distance, i) => ({
      altitude: altitudes[i],
      speed: speed,
      time: times[i],
      compSpeed: speed,
      distance: distance,
    }));
    return result;
  }

}



