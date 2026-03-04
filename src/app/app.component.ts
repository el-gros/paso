import { Component, NgZone, ChangeDetectorRef, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule, Platform } from '@ionic/angular';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

// --- CAPACITOR IMPORTS ---
import { App, URLOpenListenerEvent } from '@capacitor/app';
import { Filesystem, Encoding } from '@capacitor/filesystem';
import { ScreenOrientation } from '@capacitor/screen-orientation';
import { PluginListenerHandle } from '@capacitor/core';

// --- SERVICES ---
import { FunctionsService } from './services/functions.service';
import { GeographyService } from './services/geography.service';
import { LocationManagerService } from './services/location-manager.service';
import { ReferenceService } from './services/reference.service';
import { AppStateService } from './services/appState.service';
import { MapService } from './services/map.service';
import { PresentService } from './services/present.service';
import { LanguageService } from './services/language.service';

// --- INTERFACES & UTILS ---
import { ParsedPoint, Track, TrackDefinition, Waypoint, Data } from 'src/globald';
import JSZip from "jszip";
import { useGeographic } from 'ol/proj';

useGeographic();

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
  // Guardamos los handles de los listeners para poder destruirlos correctamente
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
    if (this.platform.is('capacitor')) {
      try {
        await ScreenOrientation.lock({ orientation: 'portrait' });
      } catch (err) {
        console.warn('Orientation lock not supported on this platform/device');
      }
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
    // Usamos el servicio AppState para reaccionar a cambios de primer/segundo plano
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
    this.appUrlListener = await App.addListener('appUrlOpen', (data: URLOpenListenerEvent) => {
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
  async processUrl(data: URLOpenListenerEvent): Promise<Track | null> {
    if (!data?.url) {
      this.fs.displayToast(this.translate.instant('MAP.NO_FILE_SELECTED'), 'warning');
      return null;
    }

    try {
      const normalizedPath = decodeURIComponent(data.url);
      let ext = normalizedPath.split('.').pop()?.toLowerCase() || '';
      
      // MIME sniffing básico para detectar contenido real si la extensión falla
      const probe = await Filesystem.readFile({ path: normalizedPath });
      if (typeof probe.data === 'string') {
        // Leemos solo el inicio para detectar firmas
        const sample = atob(probe.data.substring(0, 100));
        if (sample.includes('<gpx')) ext = 'gpx';
        else if (sample.includes('<kml')) ext = 'kml';
        else if (probe.data.startsWith('UEsDB')) ext = 'kmz'; // Firma ZIP
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
        // parseKmz maneja tanto KML plano como KMZ comprimido
        const parsed = await this.parseKmz(fileContent.data as string);
        ({ waypoints, trackPoints, trk } = parsed);
        
      } else {
        throw new Error('UNSUPPORTED_TYPE');
      }

      if (!trackPoints.length || !trk) {
        this.fs.displayToast(this.translate.instant('MAP.NO_TRACK_FOUND'), 'warning');
        return null;
      }

      const track = await this.computeTrackStats(trackPoints, waypoints, trk);
      await this.saveTrack(track);
      
      this.reference.archivedTrack = track;   
      await this.location.sendReferenceToPlugin();
      this.reference.foundRoute = false;
      this.fs.displayToast(this.translate.instant('MAP.IMPORTED_TRACK'), 'success');
      
      return track;

    } catch (error: unknown) {
      console.error('Import failed:', error);
      const message = error instanceof Error ? error.message : '';
      const translationKey = message === 'UNSUPPORTED_TYPE' 
        ? 'MAP.ERROR_UNSUPPORTED' 
        : 'MAP.ERROR_IMPORT';
      this.fs.displayToast(this.translate.instant(translationKey), 'error');
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
        
        // 1. Redibujar en el mapa
        await this.present.displayCurrentTrack(track);
        
        // 2. Recalcular acumulados y filtrado
        track = await this.present.accumulatedDistances(track);
        track = await this.fs.filterSpeedAndAltitude(track, this.present.filtered + 1);
        
        // Actualizamos el índice de filtrado para la próxima vez
        this.present.filtered = Math.max(0, num - 1);
        
        // 3. Actualizar vista y UI
        this.zone.run(() => {
          this.cd.detectChanges();
          this.geography.setMapView(track);
        });
      } catch (error) {
        console.error('Error during morningTask:', error);
      }
    });
  }

  // 8. PARSE KMZ/KML (Optimizado) //////////////////////////
  async parseKmz(base64Data: string) {
    try {
      // Conversión optimizada de Base64 a Uint8Array
      const byteArray = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
      
      // A. Si NO es un ZIP (no empieza por PK..), asumimos KML plano
      if (!base64Data.startsWith('UEsDB')) {
        const kmlText = new TextDecoder('utf-8').decode(byteArray);
        return this.mapService.parseKmlXml(new DOMParser().parseFromString(kmlText, 'application/xml'));
      }

      // B. Si ES un ZIP (KMZ)
      const zip = await JSZip.loadAsync(byteArray);
      
      // Buscamos el primer archivo .kml dentro del zip
      const kmlFileName = Object.keys(zip.files).find(name => name.toLowerCase().endsWith('.kml'));
      
      if (!kmlFileName) throw new Error('No KML found in KMZ');
      
      const kmlText = await zip.files[kmlFileName].async('string');
      const xmlDoc = new DOMParser().parseFromString(kmlText, 'application/xml');
      return this.mapService.parseKmlXml(xmlDoc);

    } catch (error) {
      console.error('KMZ Parsing Error:', error);
      // Retornamos estructura vacía para que processUrl maneje el error de "NO_TRACK_FOUND"
      return { waypoints: [], trackPoints: [], trk: null };
    }
  }

  // 9. COMPUTE TRACK STATISTICS //////////////////////
  async computeTrackStats(trackPoints: ParsedPoint[], waypoints: Waypoint[], trk: Element): Promise<Track> {
    const name = this.fs.sanitize(trk.querySelector('name')?.textContent || 'Imported Track');
    const desc = this.fs.sanitize(trk.querySelector('cmt, description')?.textContent || '');

    let distance = 0;
    let lonMin = Infinity, latMin = Infinity, lonMax = -Infinity, latMax = -Infinity;
    
    const coords: [number, number][] = [];
    
    // Mapeamos a la interfaz 'Data'
    const pointData: Data[] = trackPoints.map((p, i) => {
      // Bounding Box
      if (p.lon < lonMin) lonMin = p.lon;
      if (p.lat < latMin) latMin = p.lat;
      if (p.lon > lonMax) lonMax = p.lon;
      if (p.lat > latMax) latMax = p.lat;
      
      coords.push([p.lon, p.lat]);
      
      // Distancia acumulada
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
        // Bounding Box estándar [minX, minY, maxX, maxY]
        bbox: [lonMin, latMin, lonMax, latMax],
        waypoints: waypoints
      }]
    };

    // Post-procesado para suavizar alturas y calcular velocidades
    if (pointData.length > 1) {
      await this.fs.filterSpeedAndAltitude(track, 0);
    }

    return track;
  }

  // 11. SAVE TRACK //////////////////////////////////////////////////
  async saveTrack(track: Track) {
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
        place: track.features[0].geometry.coordinates[0], // Guardamos primera coord como referencia
        description: props.description || '',
        isChecked: true
      };

      this.fs.collection.unshift(trackDef);
      await this.fs.storeSet('collection', this.fs.collection);
      
      // Usamos displayToast del servicio Functions
      this.fs.displayToast(this.translate.instant('MAP.SAVED'), 'success');
    } catch (e) {
      console.error("Error saving track to storage", e);
    }
  }
}