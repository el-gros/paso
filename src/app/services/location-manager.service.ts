import { Injectable } from '@angular/core';
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
import { MyPasoPlugin } from '../../plugins/MyPasoPlugin';

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
  toForeground: boolean = false;
  toBackground: boolean = false;


  // ----------------------------------------------------------------------------
  // 1) PUBLIC API → components/services subscribe here
  // ----------------------------------------------------------------------------
  private latestLocationSubject = new BehaviorSubject<Location | null>(null);
  latestLocation$ = this.latestLocationSubject.asObservable();

  public lastAccepted: Location | null = null;
  private watcherId: string | undefined = undefined;

  constructor(
    private audio: AudioService,
    private geography: GeographyService,
    private present: PresentService,
    private reference: ReferenceService,
    private styler: StylerService,
    private supabase: SupabaseService,
  ) { }

 
  // ----------------------------------------------------------------------------
  // 2) RAW + SAMPLING → (merged from the 3 services)
  // ----------------------------------------------------------------------------
  private processRawLocation(raw: Location) {
    // First point
    if (this.lastAccepted && raw.time - this.lastAccepted.time < 10000) return false
    // excessive uncertainty / no altitude or time measured
    if (raw.accuracy > this.threshold ||
      !raw.altitude || raw.altitude == 0 ||
      raw.altitudeAccuracy > this.altitudeThreshold ||
      !raw.time) return false
    // Once passed filters
    this.lastAccepted = raw;
    this.latestLocationSubject.next(raw);
    console.log('[LocationManager] new accepted location:', raw);
    return true;
  }

/*  
async ensurePermissions(): Promise<boolean> {
    const PACKAGE_SETTINGS_URL = 'package:io.elgros.paso';

    try {
        // 1. COMPROVACIÓ INICIAL (Check current status)
        let status = await BackgroundGeolocation.checkPermissions();

        if (status.locationAndNotification === 'granted') {
            console.log('✅ Permissions already granted (Allow All the Time).');
            return true;
        }

        // 2. SOL·LICITUD DE PERMISOS (Request Permissions)
        console.log('Requesting permissions...');
        // Aquesta crida obre el diàleg "Allow while in use" / "Allow once" / "Deny"
        status = await BackgroundGeolocation.requestPermissions();

        // 3. GESTIÓ DE LA RESPOSTA
        
        if (status.locationAndNotification === 'denied') {
            // Això passa si l'usuari ha denegat la sol·licitud inicial.
            console.error('🛑 Permissions permanently denied by user or request denied. Opening settings...');
            
            // Si el permís ha estat denegat, obrim directament la configuració 
            // per permetre a l'usuari canviar-ho manualment.
            await AppLauncher.openUrl({ url: PACKAGE_SETTINGS_URL });
            
            // Retornem false i esperem que el listener de 'resume' comprovi l'estat.
            return false;
            
        } else if (status.locationAndNotification === 'granted' || status.locationAndNotification === 'limited') {
            // Això normalment vol dir que tenim "Allow while in use" o "Limited".
            // Hem d'intentar forçar la concessió de "Allow All the Time" (Background).
            
            if (status.locationAndNotification === 'granted') {
                console.log('✅ Initial permission granted ("Allow while in use").');
            } else if (status.locationAndNotification === 'limited') {
                console.warn('⚠️ Permission granted as "limited".');
            }
            
            // Pas obligatori per a la localització en segon pla (Background Location):
            console.warn('⚠️ Opening settings to allow "Allow All the Time" (Background Location).');
            await AppLauncher.openUrl({ url: PACKAGE_SETTINGS_URL }); 
            
            // Retornem false i esperem la represa (resume) per comprovar l'estat final.
            return false;
        }
        
        // Fallback per a qualsevol altre estat imprevist.
        return false; 

    } catch (err) {
        console.error('An unexpected error occurred during permission process:', err);
        return false;
    }
} */


// ----------------------------------------------------------------------------
  // 4) START TRACKING
  // ----------------------------------------------------------------------------
  /*
  async startBackgroundTracking() {
      try {
          await this.ensurePermissions();
          await this.stopBackgroundTracking();
          this.watcherId = await BackgroundGeolocation.addWatcher (
              {
                enableHighAccuracy: true, 
                timeout: 20000, 
                requestPermissions: true,
                distanceFilter: 1,
                interval: 5000, 
                minimumUpdateInterval: 5000,
              }, 
              // New location
              async (location: any, error: any) => { 
                  if (!location || error) return;
                  // Check location
                  const success: boolean = this.processRawLocation(location);
                  if (!success) return
                   // If tracking ...
                  if (this.state == 'tracking') {
                      const updated = await this.updateTrack(location);
                      if (!updated) return;    // new point..
                  }
                  // If sharing ...
                  if (this.isSharing) await this.shareLocationIfActive(location)
              }
          ); 
          console.log('[LocationManager] Watcher started:', this.watcherId);
          
      } catch (err) {
          console.error('[LocationManager] Start error:', err);
      }
  }
  */    

  // ----------------------------------------------------------------------------
  // 5) STOP TRACKING
  // ----------------------------------------------------------------------------
  /*
  async stop() {
    if (this.watcherId) {
      BackgroundGeolocation.removeWatcher({ id: this.watcherId });
      this.watcherId = undefined;
    }
    if (this.audio.beepInterval) {
      clearInterval(this.audio.beepInterval);
      this.audio.beepInterval = null;
    }
    await this.stopBackgroundTracking();
  }
*/

    async checkLocation(location: Location) {
      // excessive uncertainty / no altitude or time measured
      if (location.accuracy > this.threshold ||
        !location.altitude || location.altitude == 0 ||
        location.altitudeAccuracy > this.altitudeThreshold ||
        !location.time) return false
      else return true;  
    }

    async getCurrentPosition(): Promise<[number, number] | null> {
      // 1) If we already have a location → return it immediately
      const last = this.lastAccepted;
      if (last) {
        return [last.longitude, last.latitude];
      }
      // 2) Otherwise wait for the next location for max 1s
      try {
        const nextLoc = await firstValueFrom(
          this.latestLocation$.pipe(
            filter(v => !!v),   // only non-null values
            timeout(1000)       // give up after 1 second
          )
        );
        return [nextLoc.longitude, nextLoc.latitude];
      } catch (err) {
        // timeout OR stream error
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
    // Optional route check
    if (this.reference.archivedTrack && this.audio.alert === 'on') {
      await this.checkWhetherOnRoute();
    } else {
      this.audio.status = 'black';
    }
    return true;
  }

  async checkWhetherOnRoute() {
    // Return early if essential conditions are not met
    if (!this.present.currentTrack || !this.reference.archivedTrack) return;
    // Store previous color for comparison
    const previousStatus = this.audio.status;
    // Determine the current route color based on `onRoute` function
    this.audio.status = await this.onRoute() || 'black';
    // If audio alerts are off, return
    if (this.audio.audioAlert == 'off') return;
    // Beep for off-route transition
    if (previousStatus === 'green' && this.audio.status === 'red') {
      this.audio.playDoubleBeep(1800, .3, 1, .12);
    }
    // Beep for on-route transition
    else if (previousStatus === 'red' && this.audio.status === 'green') {
      this.audio.playBeep(1800, .4, 1);
    }
  }
 
  async onRoute() {
    // Return 'black' if conditions aren't met
    if (!this.present.currentTrack || !this.reference.archivedTrack) return 'black';
    // Define current and archived coordinates
    const currentCoordinates = this.present.currentTrack.features[0].geometry.coordinates;
    const archivedCoordinates = this.reference.archivedTrack.features[0].geometry.coordinates;
    if (currentCoordinates.length === 0 || archivedCoordinates.length === 0) return 'black';
    // Define parameters
    const bounding = (this.audio.status === 'red' ? 0.25 : 42.5) * Math.sqrt(this.threshDist);
    //const reduction = Math.max(Math.round(archivedCoordinates.length / 2000), 1);
    const reduction = 1 // no reduction
    const multiplier = 10;
    const skip = 5;
    // Get the point to check from the current track
    const point = currentCoordinates[currentCoordinates.length - 1];
    // Boundary check
    const bbox = this.reference.archivedTrack.features[0].bbox;
    if (bbox)  {
      if (point[0] < bbox[0] - bounding || point[0] > bbox[2] + bounding ||
        point[1] < bbox[1] - bounding || point[1] > bbox[3] + bounding) return 'red'
    }
    // Forward search
    for (let i = this.currentPoint; i < archivedCoordinates.length; i += reduction) {
      const point2 = archivedCoordinates[i];
      const distSq = (point[0] - point2[0]) ** 2 + (point[1] - point2[1]) ** 2;
      if (distSq < this.threshDist) {
        //this.lastN = i;
        this.currentPoint = i;
        return 'green';
      } else if (distSq > multiplier * this.threshDist) {
        i += (skip - 1) * reduction;
      }
    }
    // Reverse search
    for (let i = this.currentPoint; i >= 0; i -= reduction) {
      const point2 = archivedCoordinates[i];
      const distSq = (point[0] - point2[0]) ** 2 + (point[1] - point2[1]) ** 2;
      if (distSq < this.threshDist) {
        //this.lastN = i;
        this.currentPoint = i;
        return 'green';
      } else if (distSq > multiplier * this.threshDist) {
        i -= (skip - 1) * reduction;
      }
    }
    // No match found
    return 'red';
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

  /*
  async checkLocationPermissionStatus() {
    // You can re-run the entire ensurePermissions() or just the background part
    const bgStatus = await BackgroundGeolocation.checkPermissions();
    if ((bgStatus as any).background === 'granted') {
    //if (bgStatus.status === 'always') {
        console.log('Background permission confirmed upon resume!');
        // Proceed with starting your foreground service/location tracking
    } else {
        console.warn('Background permission still not granted after resume.');
        // Show a message to the user that they still need to grant it.
    }
  }
  */

  /*
  async stopBackgroundTracking() {
      if (this.watcherId) {
          await BackgroundGeolocation.removeWatcher({ id: this.watcherId });
          this.watcherId = undefined;
          console.log('🛑 Background Watcher Stopped.');
      }
  }
  */    

/*  async startForegroundService() {
    // 1. Create the channel (Safe to call multiple times, Android handles the check)
    await ForegroundService.createNotificationChannel({
      id: 'gps_tracking', // Must match notificationChannelId below
      name: 'Location Tracking', // Visible to the user in Settings
      description: 'Notifications for background location tracking', // Visible in Settings
      importance: 4, // 3 = LOW (Silent), 4 = HIGH (Heads-up)
    });
    // 2. Start the service using the channel you just created
    await ForegroundService.startForegroundService({
      id: 100,
      title: "Tracking location",
      body: "Tracking location",
      smallIcon: 'splash',
      silent: true,
      notificationChannelId: 'gps_tracking' // Now this ID exists!
    });    
    console.log('✅ Foreground Service started');
    this.toBackground = false;
  }

  async stopForegroundService() {
    await ForegroundService.stopForegroundService()
    console.log('Foreground Service stopped');
    this.toForeground = false;
    const permissionsGranted = await this.ensurePermissions(); 
    if (permissionsGranted) {
        console.log('✨ Permissions granted after resume. Starting background service...');
        // Aquí podeu cridar la funció per iniciar la geolocalització en segon pla (startTracking, etc.)
    } else {
        console.warn('🛑 Permissions still not granted after resume.');
    }
  } */

  async startPaso() {
    await MyPasoPlugin.startService();
    MyPasoPlugin.addListener('location', async (location: any) => {
      console.log('📍 Location', location);
      if (!location) return;
      // Check location
      const success: boolean = this.processRawLocation(location);
      if (!success) return
        // If tracking ...
      if (this.state == 'tracking') {
          const updated = await this.updateTrack(location);
          if (!updated) return;    // new point..
      }
      // If sharing ...
      if (this.isSharing) await this.shareLocationIfActive(location)
    });
  }

}

    
