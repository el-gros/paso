import { Injectable, NgZone } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { GeographyService } from '../services/geography.service';
import { ReferenceService } from '../services/reference.service';
import { PresentService } from '../services/present.service';
import { StylerService } from './styler.service';
import { SupabaseService } from './supabase.service';
import { Location, Track } from 'src/globald';
import { firstValueFrom, filter, timeout } from 'rxjs';
import { Feature } from 'ol';
import { Point } from 'ol/geom';
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
  private lastAlertStatus: boolean = false;

  // ----------------------------------------------------------------------------
  // 1) PUBLIC API → components/services subscribe here
  // ----------------------------------------------------------------------------
  private latestLocationSubject = new BehaviorSubject<Location | null>(null);
  latestLocation$ = this.latestLocationSubject.asObservable();

  //public lastAccepted: Location | null = null;

  constructor(
    private geography: GeographyService,
    private present: PresentService,
    private reference: ReferenceService,
    private styler: StylerService,
    private supabase: SupabaseService,
    private ngZone: NgZone,
    private fs: FunctionsService
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
    // 1. INICIALIZACIÓN (Primer punto)
    if (!this.present.currentTrack) {
      // Creamos las features con sus etiquetas 'type'
      const routeLine = new Feature();
      routeLine.set('type', 'route_line');
      const startPin = new Feature();
      startPin.set('type', 'start_pin');
      const endPin = new Feature(); // Se crea ahora, se posicionará en stopTracking
      endPin.set('type', 'end_pin');
      const features = [routeLine, startPin, endPin];
      this.present.currentTrack = {
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          properties: {
            name: '', place: '', date: undefined, description: '',
            totalDistance: 0, totalElevationGain: 0, totalElevationLoss: 0,
            totalTime: '00:00:00', totalNumber: 1,
            currentAltitude: undefined, currentSpeed: undefined
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
      // Posicionar el pin de inicio
      startPin.setGeometry(new Point([location.longitude, location.latitude]));
      startPin.setStyle(this.styler.createPinStyle('green'));
      // Registrar en el mapa
      const source = this.geography.currentLayer.getSource();
      if (source) {
        source.clear();
        source.addFeatures(features);
      }
      return true;
    }
    // 2. ACTUALIZACIÓN (Puntos sucesivos)
    const num = this.present.currentTrack.features[0].geometry.coordinates.length;
    const prevData = this.present.currentTrack.features[0].geometry.properties.data[num - 1];
    const previousTime = prevData?.time || 0;
    const previousAltitude = prevData?.altitude || 0;
    if (previousTime > location.time) return false;
    // Suavizado de altitud
    if (location.time - previousTime < 60000 && Math.abs(location.altitude - previousAltitude) > 50) {
      location.altitude = previousAltitude + 10 * Math.sign(location.altitude - previousAltitude);
    }
    location.speed = location.speed * 3.6;
    // Añadir punto al geojson y actualizar la geometría de la línea en el mapa
    await this.fillGeojson(this.present.currentTrack, location);
    return true;
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
        }
        if (this.isSharing) {
          await this.shareLocationIfActive(location);
        }
      });
    });
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

    
