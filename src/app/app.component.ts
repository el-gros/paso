import { Component, NgZone, ChangeDetectorRef, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AlertController, IonicModule, Platform, LoadingController } from '@ionic/angular';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

// --- CAPACITOR IMPORTS ---
import { App, URLOpenListenerEvent } from '@capacitor/app';
import { ScreenOrientation } from '@capacitor/screen-orientation';
import { Capacitor, PluginListenerHandle } from '@capacitor/core';

// --- SERVICES ---
import { FunctionsService } from './services/functions.service';
import { GeoMathService } from './services/geo-math.service';
import { LocationManagerService } from './services/location-manager.service';
import { ReferenceService } from './services/reference.service';
import { MapService } from './services/map.service';
import { FileParserService } from './services/file-parser.service';
import { LanguageService } from './services/language.service';
import { BackupService } from './services/backup.service';
import { MbTilesService } from './services/mbtiles.service';
import { ServerService } from './services/server.service';

// --- INTERFACES & UTILS ---
import { ParsedPoint, Track, TrackDefinition, Waypoint, Data } from 'src/globald';
import JSZip from "jszip";
import { useGeographic } from 'ol/proj';

useGeographic();

interface ParseResult {
  waypoints: Waypoint[];
  trackPoints: ParsedPoint[];
  trk: Element | null;
}

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
  private appUrlListener?: PluginListenerHandle;

  constructor(
    private platform: Platform,
    private zone: NgZone,
    public fs: FunctionsService,
    public location: LocationManagerService,
    private reference: ReferenceService,
    private translate: TranslateService,
    private mapService: MapService,
    private language: LanguageService,
    private geoMath: GeoMathService,
    private fileParser: FileParserService,
    private backupService: BackupService,
    private loadingCtrl: LoadingController,
    private alertCtrl: AlertController,
    private mbTilesService: MbTilesService,
    private server: ServerService
  ) {
    this.initializeApp();
  }

  // 1. INITIALIZE APP
  async initializeApp() {
    await this.platform.ready();
    await this.fs.init();
    await this.language.initLanguage();
    await this.initPhysicalOfflineMaps();
    this.lockToPortrait();
    this.setupFileListener();
  }

  ngOnDestroy() {
    if (this.appUrlListener) this.appUrlListener.remove();
  }

  async lockToPortrait() {
    if (this.platform.is('capacitor')) {
      try {
        await ScreenOrientation.lock({ orientation: 'portrait' });
      } catch (err) {
        console.warn('Orientation lock not supported');
      }
    }
  }

  // 2. SETUP FILE LISTENER
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

  // 3. MAIN PROCESSOR
  async processUrl(data: URLOpenListenerEvent): Promise<Track | null> {
    console.log('🔔 [DEBUG] processUrl llamado:', data.url);

    if (!data?.url) return null;

    try {
      const normalizedPath = decodeURIComponent(data.url);
      const webPath = Capacitor.convertFileSrc(normalizedPath);

      // Descargamos el archivo a memoria
      const response = await fetch(webPath);
      const fileBlob = await response.blob(); 
      const urlLower = normalizedPath.toLowerCase();

      // --- A. DETECCIÓN .PASO (BACKUP) ---
      if (urlLower.endsWith('.paso')) {
        console.log('📂 Detectado archivo de respaldo .paso');
        // Extraemos todo como texto (Base64) de forma segura
        const textContent = await fileBlob.text();
        await this.handlePasoImport(textContent);
        return null;
      }

      // --- B. DETECCIÓN MAPAS (KMZ, GPX, KML) ---
      let result: ParseResult | null = null;

      if (urlLower.endsWith('.kmz')) {
        console.log('📦 Procesando KMZ...');
        // Transformamos el Blob binario del KMZ a Base64 para que tu parseKmz lo entienda
        const base64Kmz = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
          reader.readAsDataURL(fileBlob);
        });
        result = await this.parseKmz(base64Kmz);
        
      } else {
        // GPX, KML o si es un backup sin extensión
        const textContent = await fileBlob.text();

        if (textContent.includes('<gpx')) {
          console.log('📍 Procesando GPX...');
          result = await this.fileParser.parseGpxXml(textContent);
        } else if (textContent.includes('<kml')) {
          console.log('🗺️ Procesando KML...');
          result = await this.processKmlDocument(textContent);
        } else if (textContent.startsWith('UEsDB')) {
          // Backup oculto (sin extensión pero su interior empieza por UEsDB en base64)
          console.log('📂 Detectado archivo de respaldo enmascarado');
          await this.handlePasoImport(textContent);
          return null;
        } else {
          throw new Error('UNSUPPORTED_TYPE');
        }
      }

      return result ? await this.finalizeTrack(result) : null;

    } catch (error) {
      console.error('❌ Error en processUrl:', error);
      if (this.showImportError) this.showImportError(error);
      return null;
    }
  }

  // 4. KML SPECIALIST (Resuelve errores 2345, 193, 211)
  private async processKmlDocument(xmlString: string): Promise<ParseResult> {
    const doc: Document = new DOMParser().parseFromString(xmlString, 'application/xml');
    const root = doc.documentElement;

    if (!root) throw new Error('UNSUPPORTED_TYPE');

    // Enviamos el Document completo para evitar error de propiedades faltantes
    return await this.fileParser.parseKmlXml(doc);
  }

  // 5. BACKUP HANDLER (.PASO) - Versión Definitiva con Fotos
async handlePasoImport(fileData: Blob | string) {
    let loading: HTMLIonLoadingElement | null = null;

    try {
      // 1. Mostramos la alerta de carga bloqueante
      loading = await this.loadingCtrl.create({ 
        message: this.translate.instant('SETTINGS.BACKUP_RESTORING'),
        spinner: 'crescent'
      });
      await loading.present();

      // 2. Usamos el BackupService para procesar el ZIP
      const backupData = await this.backupService.importPasoFile(fileData); 

      if (!backupData) {
        throw new Error('IMPORT_FAILED');
      }

      // 3. Restaurar la Colección (Índice de rutas)
      if (backupData.collection) {
        console.log('📚 Restaurando colección...');
        this.fs.collection = backupData.collection;
        await this.fs.storeSet('collection', this.fs.collection);
      }

      // 4. Restaurar Tracks individuales
      const keys = Object.keys(backupData);
      console.log('✅ Elementos a restaurar:', keys.length);

      for (const key of keys) {
        if (key !== 'collection' && key !== 'settings') {
          console.log(`💾 Restaurando track: ${key}`);
          await this.fs.storeSet(key, backupData[key]);
        }
      }

      // 5. Éxito: Cerramos el loading, avisamos (toast) y recargamos
      if (loading) await loading.dismiss();
      this.fs.displayToast(this.translate.instant('BACKUP.RESTORE_SUCCESS'), 'success');
      
      setTimeout(() => {
        // location.replace reinicia la app pero forzándola a ir a la ruta principal
        window.location.replace('/'); 
      }, 1500);

    } catch (error: any) {
      console.error('[AppComponent] Error en restauración:', error);
      
      // Asegurarnos de cerrar el loading también si hay error
      if (loading) await loading.dismiss();
      
      // ❌ Alerta bloqueante de error en lugar de Toast
      const alert = await this.alertCtrl.create({
        header: this.translate.instant('SETTINGS.BACKUP_ERROR_TITLE'), // O el título que prefieras
        message: this.translate.instant('SETTINGS.RESTORE_ERROR_DESC'),
        buttons: ['OK'],
        cssClass: 'glass-island-alert'
      });
      await alert.present();
    }
  }

  // 6. TRACK FINALIZER
  private async finalizeTrack(result: ParseResult): Promise<Track | null> {
    const { waypoints, trackPoints, trk } = result;
    if (!trackPoints?.length || !trk) {
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
  }

  // 7. KMZ PARSER
  async parseKmz(base64Data: string): Promise<ParseResult> {
    try {
      const zip = await JSZip.loadAsync(base64Data, { base64: true });
      const kmlFile = Object.keys(zip.files).find(name => name.toLowerCase().endsWith('.kml'));
      
      if (!kmlFile) throw new Error('No KML in KMZ');
      
      const xmlContent = await zip.files[kmlFile].async('string');
      const xmlDoc = new DOMParser().parseFromString(xmlContent, 'application/xml');
      
      return await this.fileParser.parseKmlXml(xmlDoc);
    } catch (error) {
      console.error('KMZ Error:', error);
      return { waypoints: [], trackPoints: [], trk: null };
    }
  }

  // 8. HELPERS
  private safeAtob(b64: string): string {
    try { return atob(b64); } catch (e) { return ''; }
  }

  private showImportError(error: any): void {
    console.error('❌ Error:', error);
    const translationKey = (error instanceof Error && error.message === 'UNSUPPORTED_TYPE') 
      ? 'MAP.ERROR_UNSUPPORTED' 
      : 'SETTINGS.RESTORE_ERROR_DESC';
    this.fs.displayToast(this.translate.instant(translationKey), 'error');
  }

  // 9. STATS & SAVE
  async computeTrackStats(trackPoints: ParsedPoint[], waypoints: Waypoint[], trk: Element): Promise<Track> {
    const name = this.fs.sanitize(trk.querySelector('name')?.textContent || 'Imported Track');
    const desc = this.fs.sanitize(trk.querySelector('cmt, description')?.textContent || '');

    let distance = 0;
    let lonMin = Infinity, latMin = Infinity, lonMax = -Infinity, latMax = -Infinity;
    const coords: [number, number][] = [];
    
    const pointData: Data[] = trackPoints.map((p, i) => {
      if (p.lon < lonMin) lonMin = p.lon;
      if (p.lat < latMin) latMin = p.lat;
      if (p.lon > lonMax) lonMax = p.lon;
      if (p.lat > latMax) latMax = p.lat;
      
      coords.push([p.lon, p.lat]);
      if (i > 0) {
        distance += this.geoMath.quickDistance(trackPoints[i-1].lon, trackPoints[i-1].lat, p.lon, p.lat);
      }
      return {
        altitude: p.ele ?? 0, speed: 0, time: p.time || 0,
        compSpeed: 0, compAltitude: p.ele ?? 0, distance: distance
      };
    });

    const track: Track = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: {
          name,
          place: '', // <--- 🛠️ AÑADE ESTA LÍNEA PARA ARREGLAR EL ERROR 2741
          description: desc,
          date: new Date(pointData[pointData.length - 1]?.time || Date.now()),
          totalDistance: distance,
          totalElevationGain: 0,
          totalElevationLoss: 0,
          totalTime: 0,
          inMotion: 0,
          totalNumber: pointData.length,
          currentAltitude: undefined,
          currentSpeed: undefined      
        },
        geometry: { type: 'LineString', coordinates: coords, properties: { data: pointData } },
        bbox: [lonMin, latMin, lonMax, latMax],
        waypoints: waypoints
      }]
    };

    if (pointData.length > 1) await this.geoMath.filterSpeedAndAltitude(track, 0);
    return track;
  }

  async saveTrack(track: Track) {
    if (!track?.features?.[0]) return;
    const props = track.features[0].properties;
    const trackDate = props.date instanceof Date ? props.date : new Date(props.date || Date.now());
    const dateKey = trackDate.toISOString();

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
      this.fs.displayToast(this.translate.instant('MAP.SAVED'), 'success');
    } catch (e) {
      console.error("Error saving track", e);
    }
  }

  // --- INICIALIZADOR DE MAPAS OFFLINE ---
  private async initPhysicalOfflineMaps() {
    try {
      // 1. Inicializamos el plugin nativo de SQLite
      await this.mbTilesService.initializePlugin();

      // 2. Buscamos qué archivos hay físicamente en la carpeta Data de la app
      const filesInDataDirectory = await this.server.listFilesInDataDirectory();

      // 3. Filtramos solo los que sean bases de datos .mbtiles
      const downloadedMaps = filesInDataDirectory.filter(file => file.endsWith('.mbtiles'));

      if (downloadedMaps.length === 0) {
        console.log('🗺️ No hay mapas offline descargados en el dispositivo.');
        return;
      }

      console.log(`🗺️ Preparando ${downloadedMaps.length} mapa(s) offline...`);

      // 4. Los abrimos todos de golpe para que el MbTilesService los guarde en su Map<string, SQLiteDBConnection>
      for (const fileName of downloadedMaps) {
        // Ejecutamos el open de tu servicio, el cual ya se encarga de guardar la conexión en this.dbs
        const success = await this.mbTilesService.open(fileName);
        if (success) {
          console.log(`✅ Mapa offline listo y en caché: ${fileName}`);
        } else {
          console.warn(`⚠️ Error al pre-cargar el mapa offline: ${fileName}`);
        }
      }
      
    } catch (error) {
      console.error('❌ Error crítico inicializando los mapas offline físicos:', error);
    }
  }
  
}