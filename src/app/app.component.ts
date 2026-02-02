import { Component, NgZone, ChangeDetectorRef, OnDestroy } from '@angular/core';
import { ScreenOrientation } from '@capacitor/screen-orientation';
import { FunctionsService } from './services/functions.service';
import { GeographyService } from './services/geography.service';
import { IonicModule, Platform } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LocationManagerService } from './services/location-manager.service';
import { App } from '@capacitor/app';
import { ReferenceService } from './services/reference.service';
import { AppStateService } from './services/appState.service';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { Filesystem, Encoding } from '@capacitor/filesystem';
import { MapService } from './services/map.service';
import { PresentService } from './services/present.service';
import { ParsedPoint, Track, TrackDefinition, Waypoint } from 'src/globald';
import JSZip from "jszip";
import { PluginListenerHandle } from '@capacitor/core';
import { LanguageService } from './services/language.service';

@Component({
  selector: 'app-root',
  standalone: true,
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  imports: [
    IonicModule,
    CommonModule,
    FormsModule,
    TranslateModule
  ],
})
export class AppComponent implements OnDestroy {
  // Guardamos los handles de los listeners para poder destruirlos
  private appStateListener?: PluginListenerHandle;
  private appUrlListener?: PluginListenerHandle;

  constructor(
    private platform: Platform,
    private zone: NgZone,
    private cd: ChangeDetectorRef,
    public fs: FunctionsService,
    public location: LocationManagerService,
    private reference: ReferenceService,
    private translate: TranslateService,
    private geography: GeographyService,
    private mapService: MapService,
    private present: PresentService,
    private appState: AppStateService,
    private language: LanguageService,
  ) {
    this.initializeApp();
  }

  // 1. INITIALIZE APP /////////////////////////////
  async initializeApp() {
    await this.platform.ready();
    await this.initStorage();
    await this.language.determineLanguage();
    this.lockToPortrait();
    this.setupAppStateListeners();
    this.setupFileListener();
  }

  // Limpieza de recursos al destruir el componente
  ngOnDestroy() {
    if (this.appStateListener) this.appStateListener.remove();
    if (this.appUrlListener) this.appUrlListener.remove();
  }

  // 2. LOCK PORTRAIT ///////////////////////////////
  async lockToPortrait() {
    try {
      await ScreenOrientation.lock({ orientation: 'portrait' });
    } catch (err) {
      console.warn('Orientation lock not supported on this platform');
    }
  }

  // 3. INITIALIZE STORAGE ///////////////////////////
  private async initStorage() {
    try {
      await this.fs.init();
    } catch (err) {
      console.error('Failed to initialize storage:', err);
    }
  }

  // 4. SETUP STATE LISTENER //////////////////////////
  private setupAppStateListeners() {
    // Ahora es mucho más descriptivo y reactivo
    this.appState.onEnterForeground().subscribe(async () => {
      this.location.foreground = true;
      if (this.present.currentTrack) {
        await this.morningTask();
      }
    });

    this.appState.onEnterBackground().subscribe(() => {
      this.location.foreground = false;
    });
  }

  // 5. SETUP FILE LISTENER ///////////////////////////
  private async setupFileListener() {
    this.appUrlListener = await App.addListener('appUrlOpen', (data: any) => {
      this.zone.run(async () => {
        const track = await this.processUrl(data);
        if (track) {
          this.mapService.pendingTrack$.next(track);
          this.fs.gotoPage('tab1');
        }
      });
    });
  }

  // 6. PROCESS URL /////////////////////////////////// 
  async processUrl(data: any) {
    if (!data?.url) {
      this.fs.displayToast(this.translate.instant('MAP.NO_FILE_SELECTED'));
      return null;
    }

    try {
      const normalizedPath = decodeURIComponent(data.url);
      let ext = normalizedPath.split('.').pop()?.toLowerCase() || '';
      
      // Probar tipo de archivo real (MIME sniffing)
      const probe = await Filesystem.readFile({ path: normalizedPath });
      if (typeof probe.data === 'string') {
        const sample = atob(probe.data.substring(0, 100));
        if (sample.includes('<gpx')) ext = 'gpx';
        else if (sample.includes('<kml')) ext = 'kml';
        else if (probe.data.startsWith('UEsDB')) ext = 'kmz';
      }

      let waypoints: Waypoint[] = [];
      let trackPoints: ParsedPoint[] = [];
      let trk: Element | null = null;

      if (ext === 'gpx') {
        const fileContent = await Filesystem.readFile({
          path: normalizedPath,
          encoding: Encoding.UTF8,
        });
        const parsed = await this.mapService.parseGpxXml(fileContent.data as string);
        ({ waypoints, trackPoints, trk } = parsed);
      } else if (ext === 'kmz' || ext === 'kml') {
        const fileContent = await Filesystem.readFile({ path: normalizedPath });
        const parsed = await this.parseKmz(fileContent.data as string);
        ({ waypoints, trackPoints, trk } = parsed);
      } else {
        throw new Error('UNSUPPORTED_TYPE');
      }

      if (!trackPoints.length || !trk) {
        this.fs.displayToast(this.translate.instant('MAP.NO_TRACK_FOUND'));
        return null;
      }

      const track = await this.computeTrackStats(trackPoints, waypoints, trk);
      await this.saveTrack(track);
      
      this.reference.archivedTrack = track;   
      await this.location.sendReferenceToPlugin();
      this.fs.displayToast(this.translate.instant('MAP.IMPORTED_TRACK'));
      
      return track;
    } catch (error: any) {
      console.error('Import failed:', error);
      const translationKey = error.message === 'UNSUPPORTED_TYPE' 
        ? 'MAP.ERROR_UNSUPPORTED' 
        : 'MAP.ERROR_IMPORT';
      this.fs.displayToast(this.translate.instant(translationKey));
      return null;
    }
  }

  // 7. MORNING TASK ////////////////////////////////////////
  async morningTask() {
    if (!this.present.currentTrack) return;
    
    this.zone.runOutsideAngular(async () => {
      try {
        let track = this.present.currentTrack!;
        const num = track.features[0].geometry.coordinates.length;
        
        await this.present.displayCurrentTrack(track);
        track = await this.present.accumulatedDistances(track);
        track = await this.fs.filterSpeedAndAltitude(track, this.present.filtered + 1);
        this.present.filtered = Math.max(0, num - 1);
        
        this.zone.run(() => {
          this.cd.detectChanges();
          this.geography.setMapView(track);
        });
      } catch (error) {
        console.error('Error during morningTask:', error);
      }
    });
  }

  // 8. PARSE KMZ/KML (Optimizado en memoria) //////////////////////////
  async parseKmz(base64Data: string) {
    try {
      // Uso de Uint8Array directo para evitar bucles for innecesarios
      const byteArray = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
      
      // Si no es un ZIP (es un KML plano en base64)
      if (!base64Data.startsWith('UEsDB')) {
        const kmlText = new TextDecoder().decode(byteArray);
        return this.mapService.parseKmlXml(new DOMParser().parseFromString(kmlText, 'application/xml'));
      }

      const zip = await JSZip.loadAsync(byteArray);
      const kmlFileName = Object.keys(zip.files).find(name => name.toLowerCase().endsWith('.kml'));
      
      if (!kmlFileName) throw new Error('No KML found in KMZ');
      
      const kmlText = await zip.files[kmlFileName].async('string');
      const xmlDoc = new DOMParser().parseFromString(kmlText, 'application/xml');
      return this.mapService.parseKmlXml(xmlDoc);
    } catch (error) {
      console.error('KMZ Parsing Error:', error);
      return { waypoints: [], trackPoints: [], trk: null };
    }
  }

  // 9. COMPUTE TRACK STATISTICS (Refactorizado) //////////////////////
  async computeTrackStats(trackPoints: ParsedPoint[], waypoints: Waypoint[], trk: Element) {
    const name = this.fs.sanitize(trk.querySelector('name')?.textContent || 'Imported Track');
    const desc = this.fs.sanitize(trk.querySelector('cmt, description')?.textContent || '');

    let distance = 0;
    let lonMin = Infinity, latMin = Infinity, lonMax = -Infinity, latMax = -Infinity;
    
    const coords: [number, number][] = [];
    const pointData = trackPoints.map((p, i) => {
      if (p.lon < lonMin) lonMin = p.lon;
      if (p.lat < latMin) latMin = p.lat;
      if (p.lon > lonMax) lonMax = p.lon;
      if (p.lat > latMax) latMax = p.lat;
      
      coords.push([p.lon, p.lat]);
      
      if (i > 0) {
        distance += this.fs.quickDistance(trackPoints[i-1].lon, trackPoints[i-1].lat, p.lon, p.lat);
      }

      return {
        altitude: p.ele ?? 0,
        speed: 0,
        time: p.time || 0,
        compSpeed: 0,
        compAltitude: p.ele ?? 0,
        distance: distance
      };
    });

    const track: Track = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: {
          name: name,
          place: '', 
          date: new Date(pointData[pointData.length - 1]?.time || Date.now()),
          description: desc,
          totalDistance: distance,
          totalElevationGain: 0,
          totalElevationLoss: 0,
          totalTime: 0,
          inMotion: 0, 
          totalNumber: pointData.length,
          currentAltitude: undefined, 
          currentSpeed: undefined      
        },
        geometry: {
          type: 'LineString',
          coordinates: coords,
          properties: { data: pointData }
        },
        bbox: [lonMin, latMin, lonMax, latMax],
        waypoints
      }]
    };

    // --- BLOQUE ACTUALIZADO: Post-procesado inteligente ---
    if (pointData.length > 1) {
      // Esta función ahora se encarga de TODO (Kalman, Desnivel, Movimiento)
      await this.fs.filterSpeedAndAltitude(track, 0);
    }

    return track;
  }

  // 10. CALCULATE ELEVATION GAIN & LOSS /////////////////////////////
  private calculateElevationGains(track: Track) {
    const data = track.features[0].geometry.properties.data;
    if (data.length < 2) return;

    let gain = 0, loss = 0;
    const threshold = 2.5; 
    let lastSteadyAlt = data[0].compAltitude;

    for (let i = 1; i < data.length; i++) {
      const currentAlt = data[i].compAltitude;
      const diff = currentAlt - lastSteadyAlt;
      if (Math.abs(diff) >= threshold) {
        if (diff > 0) gain += diff;
        else loss += Math.abs(diff);
        lastSteadyAlt = currentAlt;
      }
    }
    track.features[0].properties.totalElevationGain = gain;
    track.features[0].properties.totalElevationLoss = loss;
  }

  // 11. SAVE TRACK //////////////////////////////////////////////////
  async saveTrack(track: any) {
    if (!track?.features?.[0]) return;

    const props = track.features[0].properties;
    const trackDate = props.date instanceof Date ? props.date : new Date(props.date || Date.now());
    const dateKey = trackDate.toISOString();

    const existing = await this.fs.storeGet(dateKey);
    if (existing) return;

    try {
      await this.fs.storeSet(dateKey, track);
      
      const trackDef: TrackDefinition = {
        name: props.name || 'Imported Track',
        date: trackDate,
        place: track.features[0].geometry.coordinates[0],
        description: props.description || '',
        isChecked: true
      };

      this.fs.collection.unshift(trackDef);
      await this.fs.storeSet('collection', this.fs.collection);
      this.fs.displayToast(this.translate.instant('MAP.SAVED'));
    } catch (e) {
      console.error("Error saving track to storage", e);
    }
  }
}