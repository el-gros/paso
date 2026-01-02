import { Injectable, NgZone } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { GeographyService } from '../services/geography.service';
import { ReferenceService } from '../services/reference.service';
import { PresentService } from '../services/present.service';
import { StylerService } from './styler.service';
import { SupabaseService } from './supabase.service';
import { Location, Track } from 'src/globald';
import { AudioService } from './audio.service'
import { firstValueFrom, filter, timeout } from 'rxjs';
import { Feature } from 'ol';
import { Point } from 'ol/geom';
import MyService from 'src/plugins/MyServicePlugin';

@Injectable({
  providedIn: 'root'
})
export class LocationManagerService {

  threshold: number = 60;
  altitudeThreshold: number = 40;
  state: string = 'inactive';
  currentPoint: number = 0;
  averagedSpeed: number = 0;
  stopped: number = 0;
  threshDist: number = 0.0000002;
  isSharing = false;
  shareToken: string | null = null;
  deviceId: string | null = null;
  foreground: boolean = true;
  private lastAlertStatus: boolean = false;

  // ----------------------------------------------------------------------------
  // 1) PUBLIC API → components/services subscribe here
  // ----------------------------------------------------------------------------
  private latestLocationSubject = new BehaviorSubject<Location | null>(null);
  latestLocation$ = this.latestLocationSubject.asObservable();

  //public lastAccepted: Location | null = null;

  constructor(
    private audio: AudioService,
    private geography: GeographyService,
    private present: PresentService,
    private reference: ReferenceService,
    private styler: StylerService,
    private supabase: SupabaseService,
    private ngZone: NgZone
  ) { }

 
  // ----------------------------------------------------------------------------
  // 2) RAW + SAMPLING → (merged from the 3 services)
  // ----------------------------------------------------------------------------
  private processRawLocation(raw: Location) {
    if (raw.accuracy > this.threshold ||
      !raw.altitude || raw.altitude == 0 ||
      raw.altitudeAccuracy > this.altitudeThreshold ||
      !raw.time) return false
    this.latestLocationSubject.next(raw);
    console.log('[LocationManager] new accepted location:', raw);
    return true;
  }

  async getCurrentPosition(): Promise<[number, number] | null> {
    // 1) Intentamos obtener el valor actual del Subject directamente
    const last = this.latestLocationSubject.value;
    
    if (last) {
      return [last.longitude, last.latitude];
    }

    // 2) Si no hay nada, esperamos al siguiente con un margen un poco mayor (ej. 2s)
    try {
      const nextLoc = await firstValueFrom(
        this.latestLocation$.pipe(
          filter(v => !!v),
          timeout(2000) // 1s a veces es poco para un arranque en frío
        )
      );
      return [nextLoc.longitude, nextLoc.latitude];
    } catch (err) {
      return null;
    }
  }

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

  async updateTrack(location: Location): Promise<boolean> {
    if (!this.geography.map || !this.geography.currentLayer) return false;
    // If no current track exists → initialize it (first point)
    if (!this.present.currentTrack) {
      var features = [new Feature(), new Feature(), new Feature()]
      this.present.currentTrack = {
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          properties: {
            name: '',
            place: '',
            date: undefined,
            description: '',
            totalDistance: 0,
            totalElevationGain: 0,
            totalElevationLoss: 0,
            totalTime: '00:00:00',
            totalNumber: 1,
            currentAltitude: undefined,
            currentSpeed: undefined
          },
          bbox: [location.longitude, location.latitude, location.longitude, location.latitude],
          geometry: {
            type: 'LineString',
            coordinates: [[location.longitude, location.latitude]],
            properties: {
              data: [{
                altitude: location.altitude,
                speed: location.speed,
                time: location.time,
                compSpeed: 0,
                distance: 0
              }]
            }
          },
          waypoints: []
        }]
      };
      this.stopped = 0;
      this.averagedSpeed = 0;
      // Create markers (start, green, blue)
      features[1].setGeometry(new Point([location.longitude, location.latitude]));
      features[1].setStyle(this.styler.createPinStyle('green'));
      // Register track
      this.geography.currentLayer.getSource()?.clear();
      this.geography.currentLayer.getSource()?.addFeatures(features);
      return true;
    }
    // Otherwise, we are adding a new point (subsequent update)
    const num = this.present.currentTrack.features[0].geometry.coordinates.length;
    const prevData = this.present.currentTrack.features[0].geometry.properties.data[num - 1];
    const previousTime = prevData?.time || 0;
    const previousAltitude = prevData?.altitude || 0;
    // Wrong order
    if (previousTime > location.time) return false;
    // Avoid unrealistic altitude jumps (if GPS still running)
    if (location.time - previousTime < 60000 && Math.abs(location.altitude - previousAltitude) > 50) {
      location.altitude = previousAltitude + 10 * Math.sign(location.altitude - previousAltitude);
    }
    // Convert m/s to km/h
    location.speed = location.speed * 3.6;
    // Add point to geojson
    await this.fillGeojson(this.present.currentTrack, location);
    return true;
  }

  /*
  async checkWhetherOnRoute(location: Location) {
    // Return early if essential conditions are not met
    if (!this.reference.archivedTrack) return;
    // Store previous color for comparison
    const previousStatus = this.audio.status;
    // Determine the current route color based on `onRoute` function
    this.audio.status = await this.onRoute(location) || 'black';
    // If audio alerts are off, return
    //if (this.audio.audioAlert == 'off') return;
    // Beep for off-route transition
    if (previousStatus === 'green' && this.audio.status === 'red') {
      this.audio.playDoubleBeep(1800, .3, 1, .12);
    }
    // Beep for on-route transition
    else if (previousStatus === 'red' && this.audio.status === 'green') {
      this.audio.playBeep(1800, .4, 1);
    }
  }
 
  async onRoute(location: Location): Promise<'black' | 'red' | 'green'> {
    if (!this.reference.archivedTrack) return 'black';
    const archivedCoords = this.reference.archivedTrack.features[0].geometry.coordinates;
    const numArchived = archivedCoords.length;
    if (numArchived === 0) return 'black';
    const point = [location.longitude, location.latitude];
    const [lon1, lat1] = point;
    // 1. Latitude Compensation (Vital for accuracy)
    const cosLat = Math.cos(lat1 * Math.PI / 180);
    // 2. Dynamic Threshold (Hysteresis)
    // If we are currently GREEN, allow a 10% 'grace' distance before turning RED
    const currentThreshold = (this.audio.status === 'green') 
      ? this.threshDist * 1.21  // 10% more distance = ~21% more distSq
      : this.threshDist;
    // 3. Fast Distance Helper
    const getDistSq = (p2: number[]) => {
      const dLon = (lon1 - p2[0]) * cosLat;
      const dLat = lat1 - p2[1];
      return dLon * dLon + dLat * dLat;
    };
    // 4. Search Window Strategy
    // Look at the current point and 200 points forward/backward first.
    const windowSize = 200;
    const start = Math.max(0, this.currentPoint - windowSize);
    const end = Math.min(numArchived - 1, this.currentPoint + windowSize);
    // Look forward from last known point (highest probability)
    for (let i = this.currentPoint; i <= end; i++) {
      if (getDistSq(archivedCoords[i]) < currentThreshold) {
        this.currentPoint = i;
        return 'green';
      }
    }
    // Look backward within window
    for (let i = this.currentPoint - 1; i >= start; i--) {
      if (getDistSq(archivedCoords[i]) < currentThreshold) {
        this.currentPoint = i;
        return 'green';
      }
    }
    // 5. Global "Recovery" Search
    // If not found in the window, search the rest with a 'skip' to save CPU.
    // This helps if the user took a shortcut or skipped a loop in the track.
    const skip = 5;
    for (let i = 0; i < numArchived; i += skip) {
      if (getDistSq(archivedCoords[i]) < currentThreshold) {
        this.currentPoint = i;
        return 'green';
      }
    }
    return 'red';
  } */ 

    async shareLocationIfActive(location: Location ) {
    if (!this.isSharing || !this.shareToken) return;
    try {
      await this.supabase.supabase
        .from('public_locations')
        .insert([{
          share_token: this.shareToken,
          owner_user_id: this.deviceId,
          lat: location.latitude,
          lon: location.longitude,
          updated_at: new Date().toISOString()
        }]);
        console.log('location updated at supabase: ', location)
    } catch (err) {
      console.error('Share failed', err);
    }
  }

  async startPaso() {
    await MyService.startService();
    MyService.addListener('location', (location: any) => {
      // Force execution inside the Angular Zone
      this.ngZone.run(async () => {
        console.log('📍 Location Received', location);
        if (!location) return;
        const success = this.processRawLocation(location);
        if (!success) return;
        if (this.state === 'tracking') {
          await this.updateTrack(location);
          //if (this.reference.archivedTrack && this.audio.alert === 'on') await this.checkWhetherOnRoute(location);
          //else this.audio.status = 'black';
        }
        if (this.isSharing) {
          await this.shareLocationIfActive(location);
        }
      });
    });
  }

  async syncNativeAlert() {
    const track = this.reference.archivedTrack;
    const isAudioOn = this.audio.alert === 'on';
    // Si no hay track o el audio está apagado, mandamos array vacío
    if (!track || !isAudioOn) {
      await MyService.setReferenceTrack({ coordinates: [] });
      return;
    }
    // Aquí ya sabemos que el track existe
    const coords = track.features[0].geometry.coordinates;
    await MyService.setReferenceTrack({ coordinates: coords });
  }

  async sendReferenceToPlugin() {
    let coordinates: number[][];
    if (this.state != 'tracking' || this.audio.alert != 'on' || !this.reference.archivedTrack) coordinates = []
    else coordinates = this.reference.archivedTrack.features[0].geometry.coordinates
    try {
        await MyService.setReferenceTrack({
          coordinates: coordinates
        });
        console.log("📍 Track de referencia sincronizado con el servicio nativo");
    } catch (e) {
        console.error("❌ Error sincronizando track con nativo:", e);
    }
  }


}

    
