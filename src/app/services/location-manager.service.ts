import { Injectable, NgZone } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { ReferenceService } from '../services/reference.service';
import { SupabaseService } from './supabase.service';
import { Location, Track } from 'src/globald';
import { firstValueFrom, filter, timeout } from 'rxjs';
import MyService from 'src/plugins/MyServicePlugin';
import { FunctionsService } from '../services/functions.service';

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

  // ----------------------------------------------------------------------------
  // 1) PUBLIC API → components/services subscribe here
  // ----------------------------------------------------------------------------
  private latestLocationSubject = new BehaviorSubject<Location | null>(null);
  latestLocation$ = this.latestLocationSubject.asObservable();

  //public lastAccepted: Location | null = null;

  constructor(
    private reference: ReferenceService,
    private supabase: SupabaseService,
    private fs: FunctionsService,
  ) { }

 
  // ----------------------------------------------------------------------------
  // 2) RAW + SAMPLING → (merged from the 3 services)
  // ----------------------------------------------------------------------------
  processRawLocation(raw: Location) {
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

  async fillGeojson(track: Track | undefined, location: Location) {
    if (!track) return undefined;
    // Add minimal data
    track.features[0].geometry.properties.data.push({
      altitude: location.altitude,
      speed: location.speed,
      time: location.time,
      compSpeed: location.speed,  // Initial value; further processing can adjust it
      compAltitude: location.altitude, // Initial value; further processing can adjust it
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
    return track
  }
  
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

  async sendReferenceToPlugin() {
    let coordinates: number[][];
    if (this.state != 'tracking' || this.fs.alert != 'on' || !this.reference.archivedTrack) coordinates = []
    else coordinates = this.reference.archivedTrack.features[0].geometry.coordinates
    try {
        await MyService.setReferenceTrack({ coordinates: coordinates });
        console.log("📍 Track de referencia sincronizado con el servicio nativo");
    } catch (e) {
        console.error("❌ Error sincronizando track con nativo:", e);
    }
  }


}

    
