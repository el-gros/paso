import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { registerPlugin } from '@capacitor/core';
import { TranslateService } from '@ngx-translate/core';
import { Location } from 'src/globald';
import { ForegroundService } from '@capawesome-team/capacitor-android-foreground-service';
import { FunctionsService } from './functions.service';
const BackgroundGeolocation: any = registerPlugin("BackgroundGeolocation");

@Injectable({
  providedIn: 'root'
})
export class LocationManagerService {

  threshold: number = 30;
  altitudeThreshold: number = 20;

  // ----------------------------------------------------------------------------
  // 1) PUBLIC API → components/services subscribe here
  // ----------------------------------------------------------------------------
  private latestLocationSubject = new BehaviorSubject<Location | null>(null);
  latestLocation$ = this.latestLocationSubject.asObservable();

  private lastAccepted: Location | null = null;
  private watcherId: string | null = null;

  constructor(
    private translate: TranslateService,
    public fs: FunctionsService,
  ) {}

  // ----------------------------------------------------------------------------
  // 2) RAW + SAMPLING → (merged from the 3 services)
  // ----------------------------------------------------------------------------
  private processRawLocation(raw: Location) {
    // First point
    if (!this.lastAccepted) {
      this.lastAccepted = raw;
      this.publish(raw);
      return;
    }

    let accept = false;

    // Accept if 3 seconds passed
    if (raw.time - this.lastAccepted.time >= 3000) {
      accept = true;
    }

    // Accept if moved ≥ 15 m
    if (!accept) {
      const dist = this.distance(
        this.lastAccepted.latitude, this.lastAccepted.longitude,
        raw.latitude, raw.longitude
      );
      if (dist >= 15) accept = true;
    }

    if (!accept) return;

    this.lastAccepted = raw;
    this.publish(raw);
  }

  async publish(loc: Location) {
    this.latestLocationSubject.next(loc);
    console.log('[LocationManager] new accepted location:', loc);
  }

  private distance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI/180;
    const dLon = (lon2 - lon1) * Math.PI/180;
    const a =
      Math.sin(dLat/2)**2 +
      Math.cos(lat1*Math.PI/180) *
      Math.cos(lat2*Math.PI/180) *
      Math.sin(dLon/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  }

  // ----------------------------------------------------------------------------
  // 3) PERMISSIONS + FOREGROUND SERVICE + BACKGROUND WATCHER
  // ----------------------------------------------------------------------------
  private async ensurePermissions() {
    // Background geolocation permissions
    const bgPerm = await BackgroundGeolocation.checkPermissions();
    const needsBackground = bgPerm && 'background' in bgPerm;
    if (
      !bgPerm ||
      bgPerm.location !== 'granted' ||
      (needsBackground && bgPerm.background !== 'granted')
    ) {
      const req = await BackgroundGeolocation.requestPermissions();
      if (
        req.location !== 'granted' ||
        (needsBackground && req.background !== 'granted')
      ) {
        throw new Error('Location/background permission denied');
      }
    }
  }

  // ----------------------------------------------------------------------------
  // 4) START TRACKING
  // ----------------------------------------------------------------------------
  async start() {
    try {
      await this.ensurePermissions();
      await ForegroundService.startForegroundService({
        id: 4321,
        title: this.translate.instant('MAP.NOTICE'),
        body: '',
        smallIcon: 'splash.png',
      });
      await this.fs.startBeepInterval();
      this.watcherId = await BackgroundGeolocation.addWatcher(
        {
          backgroundMessage: 'Tracking…',
          backgroundTitle: 'Tracking in background',
          requestPermissions: false,
          stale: false,
          distanceFilter: 1,
        },
        async (location: any, error: any) => {
          if (!location || error) return;
          const success = await this.checkLocation(location);
          if (!success) return;
          this.processRawLocation(location);
        }
      );
      console.log('[LocationManager] Watcher started:', this.watcherId);
    } catch (err) {
      console.error('[LocationManager] Start error:', err);
    }
  }

  // ----------------------------------------------------------------------------
  // 5) STOP TRACKING
  // ----------------------------------------------------------------------------
  async stop() {
    try {
      if (this.watcherId) {
        await BackgroundGeolocation.removeWatcher({ id: this.watcherId });
        console.log('[LocationManager] Watcher removed:', this.watcherId);
      }
      this.watcherId = null;
      await ForegroundService.stopForegroundService();
      await this.fs.stopBeepInterval();
      console.log('[LocationManager] Foreground service stopped');
    } catch (err) {
      console.error('[LocationManager] Stop error:', err);
    }
  }

    async checkLocation(location: Location) {
      // excessive uncertainty / no altitude or time measured
      if (location.accuracy > this.threshold ||
        !location.altitude || location.altitude == 0 ||
        location.altitudeAccuracy > this.altitudeThreshold ||
        !location.time) return false
      else return true;  
    }

}
