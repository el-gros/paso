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
//import MyService from 'src/plugins/MyServicePlugin';
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
  //public environmentInjector = inject(EnvironmentInjector);
  speedFiltered: number = 0;
  //private isProcessingUrl = false;

  constructor(
    private platform: Platform,
    private zone: NgZone,
    public fs: FunctionsService,
    public location: LocationManagerService,
    private reference: ReferenceService,
    private translate: TranslateService,
    private geography: GeographyService,
    private mapService: MapService,
    private trackingControlService: TrackingControlService,
    private present: PresentService,
    private cd: ChangeDetectorRef,
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
        if (isActive) {
          console.log('⬆️ App en primer plano');
          this.location.foreground = true;
          // Lógica de reinicio de tracking si el control estaba activo
          if (this.mapService.customControl?.isControlActive()) {
            this.trackingControlService.start();
          }
          if (this.present.currentTrack) {
            await this.morningTask(); // Asegúrate de que este método sea accesible
          }
        } else {
          console.log('⬇️ App en segundo plano');
          this.trackingControlService.stop();
          this.location.foreground = false;
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
          if (this.mapService.mapIsReady) {
            await this.reference.displayArchivedTrack();
          } else {
            // Mark that we have something to show as soon as the map finishes loading
            this.mapService.hasPendingDisplay = true;
          }
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
        const track = this.present.currentTrack!;
        const num = track.features[0].geometry.coordinates.length;
        // 1. Dibujamos el track completo de golpe
        await this.present.displayCurrentTrack(track);
        // 2. Procesamos datos acumulados
        const final = await this.present.filterAltitude(track, this.present.altitudeFiltered + 1, num - this.fs.lag - 1);
        if (final) this.present.altitudeFiltered = final;
        await this.present.accumulatedDistances();
        let data = track.features[0].geometry.properties.data;
        track.features[0].geometry.properties.data = await this.fs.filterSpeed(data, this.speedFiltered + 1);
        this.speedFiltered = num - 1;
        // 3. Volvemos a la zona de Angular para actualizar la interfaz
        this.zone.run(async () => {
          await this.present.htmlValues();
          this.cd.detectChanges();
          // Opcional: Re-centrar el mapa al despertar para ver dónde estamos ahora
          this.geography.setMapView(track);
        });
      } catch (error) {
        console.error('Error during morningTask:', error);
      }
    });
  }

  // 8. PARSE KMZ FILES //////////////////////////////////////////////
  async parseKmz(base64Data: string): Promise<{ waypoints: Waypoint[], trackPoints: ParsedPoint[], trk: Element | null }> {
    try {         
      // Decode Base64 → ArrayBuffer
      const binary = atob(base64Data);
      const len = binary.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      // Load KMZ as zip
      const zip = await JSZip.loadAsync(bytes);
      // Find the first .kml file in the KMZ
      const kmlFile = Object.keys(zip.files).find(name => name.toLowerCase().endsWith('.kml'));
      if (!kmlFile) {
        throw new Error('No KML file found inside KMZ.');
      }
      // Extract KML text
      const kmlText = await zip.files[kmlFile].async('string');
      if (!kmlText || !kmlText.includes('<kml')) {
        throw new Error('Invalid KML content in KMZ.');
      }
      // Convert string → XML Document
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(kmlText, 'application/xml');
      // Reuse your existing KML parser
      return this.mapService.parseKmlXml(xmlDoc);
    } catch (error) {
      console.error('parseKmz failed:', error);
      this.fs.displayToast(this.translate.instant('MAP.UNSUPPORTED_FILE'));
      return { waypoints: [], trackPoints: [], trk: null };
    }
  }

  // 9. COMPUTE TRACK STATISTICS
  async computeTrackStats(trackPoints: ParsedPoint[], waypoints: Waypoint[], trk: Element) {
    const name = this.fs.sanitize(trk.getElementsByTagName('name')[0]?.textContent || 'No Name') || 'No Name';
    const desc = this.fs.sanitize(trk.getElementsByTagName('cmt')[0]?.textContent || '') || '';
    const track: Track = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: {
          name,
          place: '',
          date: undefined,
          description: desc,
          totalDistance: 0,
          totalElevationGain: 0,
          totalElevationLoss: 0,
          totalTime: '00:00:00',
          totalNumber: trackPoints.length,
          currentAltitude: undefined,
          currentSpeed: undefined
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
      const { lat, lon, ele, time } = trackPoints[k];
      if (isNaN(lat) || isNaN(lon)) continue;
      // Update Bounds
      if (lon < lonMin) lonMin = lon;
      if (lat < latMin) latMin = lat;
      if (lon > lonMax) lonMax = lon;
      if (lat > latMax) latMax = lat;
      coords.push([lon, lat]);
      // Distance Calculation
      if (k > 0) {
        const prev = trackPoints[k - 1];
        // NO AWAIT HERE -> Instant execution
        distance += this.fs.quickDistance(prev.lon, prev.lat, lon, lat);
      }
      // Altitude Interpolation
      let alt = ele ?? 0;
      if (alt === 0 && pointData.length > 0) {
        alt = pointData[pointData.length - 1].altitude;
      }
      pointData.push({
        altitude: alt,
        speed: 0,
        time: time || 0,
        compSpeed: 0,
        distance: distance,
      });
    }
    // Finalize Feature data
    track.features[0].geometry.coordinates = coords;
    track.features[0].geometry.properties.data = pointData;
    track.features[0].bbox = [lonMin, latMin, lonMax, latMax];
    track.features[0].properties.totalDistance = distance;
    const num = pointData.length;
    if (num > 1 && pointData[0].time !== 0) {
      track.features[0].properties.totalTime = this.fs.formatMillisecondsToUTC(
        pointData[num - 1].time - pointData[0].time
      );
    }
    // Post-process filtering
    try {
      // Save current smoothing state to not corrupt live recording
      const savedAltState = this.present.altitudeFiltered;
      // Smooth altitude and calculate gains
      await this.present.filterAltitude(track, 0, num - 1);
      // Smooth speed (Pass the whole array)
      track.features[0].geometry.properties.data = await this.fs.filterSpeed(pointData, 1);
      // Restore state
      this.present.altitudeFiltered = savedAltState;
    } catch (e) {
      console.error("Post-processing failed", e);
    }
    track.features[0].properties.date = new Date(pointData[num - 1]?.time || Date.now());
    return track;
  }

  // 10. SAVE TRACK //////////////////////////////////////////////////
  async saveTrack(track: any) {
    // 1. Verificación de seguridad
    if (!track?.features?.[0]) return;
    // 2. Extraer o generar la fecha (debe ser un objeto Date para JSON.stringify)
    let trackDate = track.features[0].properties.date;
    if (!(trackDate instanceof Date)) {
      trackDate = trackDate ? new Date(trackDate) : new Date();
    }
    // 3. Generar la clave EXACTAMENTE igual que en saveFile
    const dateKey = JSON.stringify(trackDate);
    // 4. Evitar duplicados
    const existing = await this.fs.storeGet(dateKey);
    if (existing) {
      console.log('El track ya existe en el storage');
      return;
    }
    try {
      // 5. Guardar el track completo
      await this.fs.storeSet(dateKey, track);
      // 6. Actualizar la colección con la misma estructura que saveFile
      const trackDef: TrackDefinition = {
        name: track.features[0].properties.name || 'Imported Track',
        date: trackDate,
        place: track.features[0].properties.place || '',
        description: track.features[0].properties.description || '',
        isChecked: true // Lo marcamos como checked ya que se acaba de importar/abrir
      };
      this.fs.collection.push(trackDef);
      await this.fs.storeSet('collection', this.fs.collection);
      // 7. Feedback (Opcional, similar a saveFile)
      this.fs.displayToast(this.translate.instant('MAP.SAVED'));
    } catch (e) {
      console.error("Error al importar el track al storage", e);
    }
  }

}
          