import { Component, NgZone, EnvironmentInjector, inject, ChangeDetectorRef } from '@angular/core';
import { ScreenOrientation } from '@capacitor/screen-orientation';
import { FunctionsService } from './services/functions.service';
import { GeographyService } from './services/geography.service';
import { IonicModule, IonicRouteStrategy, Platform } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LocationManagerService } from './services/location-manager.service';
import { App } from '@capacitor/app';
import { ReferenceService } from './services/reference.service';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { MapService } from './services/map.service';
import { TrackingControlService } from './services/trackingControl.service';
import { PresentService } from './services/present.service';
import { ParsedPoint, Track, TrackDefinition, Waypoint } from 'src/globald';
import JSZip from "jszip";

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
export class AppComponent {

  // 1. INITIALIZE APP
  // 2. LOCK PORTRAIT
  // 3. INITIALIZE STORAGE
  // 4. SETUP STATE LISTENER
  // 5. SETUP FILE LISTENER
  // 6. PROCESS URL
  // 7. MORNING TASK
  // 8. PARSE KMZ FILES
  // 9. COMPUTE TRACK STATISTICS
  // 10. CALCULATE ELEVATION GAIN & LOSS
  // 11. SAVE TRACK

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
    private trackingControlService: TrackingControlService,
    private present: PresentService,
  ) {
    this.initializeApp();
  }

  // 1. INITIALIZE APP /////////////////////////////
  async initializeApp() {
    await this.platform.ready();
    // 1. Configuraciones de hardware/sistema
    this.lockToPortrait();
    await this.initStorage();
    // 2. Listeners globales
    this.setupAppStateListeners();
    this.setupFileListener();
  }

  // 2. LOCK PORTRAIT ///////////////////////////////
  async lockToPortrait() {
    try {
      await ScreenOrientation.lock({ orientation: 'portrait' });
      console.log('Screen orientation locked to portrait');
    } catch (err) {
      console.error('Error locking orientation:', err);
    }
  }

  // 3. INITIALIZE STORAGE ///////////////////////////
  private async initStorage() {
    try {
      await this.fs.init();
      console.log('Storage initialized');
    } catch (err) {
      console.error('Failed to initialize storage:', err);
    }
  }

  // 4. SETUP STATE LISTENER
  private setupAppStateListeners() {
    App.addListener('appStateChange', ({ isActive }) => {
      this.zone.run(async () => {
        this.location.foreground = isActive;
        if (isActive) {
          console.log('⬆️ App Active');
          // Resume heavy UI tasks if needed
          if (this.present.currentTrack) await this.morningTask();
        } else {
          console.log('⬇️ App Background');
          // Do NOT stop the tracking service if you want background recording!
          // Only stop UI-intensive map refreshers here.
        }
      });
    });
  }

  // 5. SETUP FILE LISTENER ///////////////
  private setupFileListener() {
    App.addListener('appUrlOpen', (data: any) => {
      this.zone.run(async () => {
        const track = await this.processUrl(data);
        if (track) {
          // 1. Push the track into the service
          this.mapService.pendingTrack$.next(track);
          // 2. Navigate immediately. No more setTimeout!
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
      console.log('Processing URL:', data.url);
      // 1. Normalize Path (handles special characters and spaces)
      const normalizedPath = decodeURIComponent(data.url);
      // 2. Initial Extension Guess
      let ext = normalizedPath.split('.').pop()?.toLowerCase() || '';
      // 3. File Type Probing (Detecting content:// types)
      try {
        const probe = await Filesystem.readFile({ path: normalizedPath });
        let sample = '';
        if (typeof probe.data === 'string') {
          // Only decode the first 200 chars of base64 to check headers
          sample = atob(probe.data.substring(0, 200));
        } else if (probe.data instanceof Blob) {
          sample = (await probe.data.text()).substring(0, 100);
        }
        // Refine extension based on file signature
        if (sample.includes('<gpx')) {
          ext = 'gpx';
        } else if (sample.includes('<kml')) {
          ext = 'kml';
        } else if (typeof probe.data === 'string' && probe.data.startsWith('UEsDB')) {
          ext = 'kmz';
        }
      } catch (probeErr: unknown) {
        console.warn('Probe failed, falling back to extension:', probeErr);
      }
      // 4. Data Parsing Setup
      let waypoints: Waypoint[] = [];
      let trackPoints: ParsedPoint[] = [];
      let trk: Element | null = null;
      // 5. Processing Branches
      if (ext === 'gpx') {
        const fileContent = await Filesystem.readFile({
          path: normalizedPath,
          encoding: Encoding.UTF8,
        });
        const parsed = await this.mapService.parseGpxXml(fileContent.data as string);
        waypoints = parsed.waypoints;
        trackPoints = parsed.trackPoints;
        trk = parsed.trk;
      } else if (ext === 'kmz' || ext === 'kml') {
        const fileContent = await Filesystem.readFile({
          path: normalizedPath,
        });
        // KMZ parser handles both binary zip (KMZ) and raw XML (KML) usually
        const parsed = await this.parseKmz(fileContent.data as string);
        waypoints = parsed.waypoints;
        trackPoints = parsed.trackPoints;
        trk = parsed.trk;
      } else {
        throw new Error('UNSUPPORTED_TYPE');
      }
      // 6. Validation
      if (!trackPoints.length || !trk) {
        this.fs.displayToast(this.translate.instant('MAP.NO_TRACK'));
        return;
      }
      // 7. Stats and Persistence
      const track = await this.computeTrackStats(trackPoints, waypoints, trk);
      await this.saveTrack(track);
      this.reference.archivedTrack = track;   
      await this.location.sendReferenceToPlugin()
      this.fs.displayToast(this.translate.instant('MAP.IMPORTED'));
      return track;
    } catch (error: unknown) {
      console.error('Import failed:', error);
      // Type-safe error message extraction
      const errMsg = error instanceof Error ? error.message : '';
      const translationKey = errMsg === 'UNSUPPORTED_TYPE' 
        ? 'MAP.UNSUPPORTED_FILE' 
        : 'MAP.NOT_IMPORTED';
      this.fs.displayToast(this.translate.instant(translationKey));
      return null;
    }
  }

  // 7. MORNING TASK ////////////////////////////////////////
  async morningTask() {
    if (!this.present.currentTrack) return;
    // Procesamos el "atracón" de datos fuera de Angular para no bloquear la UI
    this.zone.runOutsideAngular(async () => {
      try {
        let track = this.present.currentTrack!;
        const num = track.features[0].geometry.coordinates.length;
        // 1. Dibujamos el track completo de golpe
        await this.present.displayCurrentTrack(track);
        // 2. Procesamos datos acumulados
        track = await this.present.accumulatedDistances(track);
        track = await this.fs.filterSpeedAndAltitude(track, this.present.filtered+1);
        this.present.filtered = num - 1;
        // UI Update: Jump back into Angular Zone
        this.zone.run(() => {
          this.cd.detectChanges();
          console.log("UI Updated after data processing");
        });
        await this.geography.setMapView(track);
      } catch (error) {
        console.error('Error during morningTask:', error);
      }
    });
  }

  // 8. PARSE KMZ FILES //////////////////////////////////////////////
  async parseKmz(base64Data: string) {
    try {
      // Faster, memory-efficient way to convert base64 to Uint8Array
      const byteCharacters = atob(base64Data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const zip = await JSZip.loadAsync(byteArray);
      const kmlFile = Object.keys(zip.files).find(name => name.toLowerCase().endsWith('.kml'));
      if (!kmlFile) throw new Error('No KML found');
      const kmlText = await zip.files[kmlFile].async('string');
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(kmlText, 'application/xml');
      return this.mapService.parseKmlXml(xmlDoc);
    } catch (error) {
      console.error('KMZ Error:', error);
      return { waypoints: [], trackPoints: [], trk: null };
    }
  }

  // 9. COMPUTE TRACK STATISTICS
  async computeTrackStats(trackPoints: ParsedPoint[], waypoints: Waypoint[], trk: Element) {
    if (!trackPoints || trackPoints.length === 0) throw new Error("Empty track points");
    const name = this.fs.sanitize(trk.getElementsByTagName('name')[0]?.textContent || 'No Name') || 'No Name';
    const desc = this.fs.sanitize(trk.getElementsByTagName('cmt')[0]?.textContent || '') || '';
    const track: Track = {
        type: 'FeatureCollection',
        features: [{
            type: 'Feature',
            properties: {
                name, place: '', date: undefined, description: desc,
                totalDistance: 0, totalElevationGain: 0, totalElevationLoss: 0,
                totalTime: 0, inMotion: 0, totalNumber: trackPoints.length,
                currentAltitude: undefined, currentSpeed: undefined
            },
            bbox: undefined,
            geometry: {
                type: 'LineString',
                coordinates: [],
                properties: { data: [] }
            },
            waypoints
        }]
    };
    let distance = 0;
    let lonMin = Infinity, latMin = Infinity, lonMax = -Infinity, latMax = -Infinity;
    const pointData: any[] = [];
    const coords: [number, number][] = [];
    for (let k = 0; k < trackPoints.length; k++) {
        const p = trackPoints[k] as any;
        if (isNaN(p.lat) || isNaN(p.lon)) continue;
        if (p.lon < lonMin) lonMin = p.lon;
        if (p.lat < latMin) latMin = p.lat;
        if (p.lon > lonMax) lonMax = p.lon;
        if (p.lat > latMax) latMax = p.lat;
        coords.push([p.lon, p.lat]);
        if (k > 0) {
            distance += this.fs.quickDistance(trackPoints[k-1].lon, trackPoints[k-1].lat, p.lon, p.lat);
        }
        let alt = p.ele ?? 0;
        if (alt === 0 && pointData.length > 0) {
            alt = pointData[pointData.length - 1].altitude;
        }
        pointData.push({
            altitude: alt,
            speed: 0,
            time: p.time || 0,
            compSpeed: 0,
            compAltitude: alt, 
            distance: distance,
        });
    }
    track.features[0].geometry.coordinates = coords;
    track.features[0].geometry.properties.data = pointData;
    track.features[0].bbox = [lonMin, latMin, lonMax, latMax];
    track.features[0].properties.totalDistance = distance;
    const num = pointData.length;
    const hasTime = num > 1 && pointData[0].time !== 0;
    // 2. POST-PROCESADO
    try {
        // Solo calculamos velocidad si hay tiempo
        if (hasTime) {
            await this.fs.computeCompSpeed(pointData, 0);
        } else {
            pointData.forEach(p => { p.compSpeed = 0; p.speed = 0; });
        }
        // Calculamos los totales de desnivel siempre usando la altitud original (no filtrada)
        this.calculateElevationGains(track);
    } catch (e) {
        console.error("Post-processing failed", e);
    }
    // 3. Finalización
    track.features[0].properties.totalTime = hasTime 
        ? pointData[num - 1].time - pointData[0].time
        : 0;
    track.features[0].properties.date = new Date(pointData[num - 1]?.time || Date.now());
    console.log(track)
    return track;
  }

  // 10. CALCULATE ELEVATION GAIN & LOSS /////////////////////////////
  private calculateElevationGains(track: Track) {
    const data = track.features[0].geometry.properties.data;
    if (data.length < 2) return;
    let gain = 0;
    let loss = 0;
    const threshold = 2.5; // Minimum meters to count as real movement
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
    console.log('START SAVING TRACK')
    // 1. Verificación de seguridad
    if (!track?.features?.[0]) return;
    // 2. Extraer o generar la fecha (debe ser un objeto Date para JSON.stringify)
    let trackDate = track.features[0].properties.date;
    if (!(trackDate instanceof Date)) {
      trackDate = trackDate ? new Date(trackDate) : new Date();
    }
    // 3. Generar la clave EXACTAMENTE igual que en saveFile
    const dateKey = trackDate.toISOString();
    // 4. Evitar duplicados
    const existing = await this.fs.storeGet(dateKey);
    if (existing) {
      console.log('El track ya existe en el storage');
      return
    }
    try {
      // 5. Guardar el track completo
      await this.fs.storeSet(dateKey, track);
      // 6. Actualizar la colección con la misma estructura que saveFile
      const trackDef: TrackDefinition = {
        name: track.features[0].properties.name || 'Imported Track',
        date: trackDate,
        place: track.features[0].geometry.coordinates[0],
        description: track.features[0].properties.description || '',
        isChecked: true // Lo marcamos como checked ya que se acaba de importar/abrir
      };
      this.fs.collection.unshift(trackDef);
      await this.fs.storeSet('collection', this.fs.collection);
      // 7. Feedback (Opcional, similar a saveFile)
      this.fs.displayToast(this.translate.instant('MAP.SAVED'));
    } catch (e) {
      console.error("Error al importar el track al storage", e);
    }
  }

}
          