import { Injectable } from '@angular/core';
import { LoadingController, AlertController } from '@ionic/angular';
import { TranslateService } from '@ngx-translate/core';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import JSZip from 'jszip';

import { FunctionsService } from './functions.service';
import { FileParserService } from './file-parser.service';
import { GeoMathService } from './geo-math.service';
import { BackupService } from './backup.service';
import { ReferenceService } from './reference.service';
import { LocationManagerService } from './location-manager.service';
import { MapService } from './map.service';
import { Track, TrackDefinition } from '../../globald';

@Injectable({
  providedIn: 'root'
})
export class TrackImportService {

  constructor(
    private fs: FunctionsService,
    private fileParser: FileParserService,
    private geoMath: GeoMathService,
    private backupService: BackupService,
    private reference: ReferenceService,
    private location: LocationManagerService,
    private mapService: MapService,
    private translate: TranslateService,
    private loadingCtrl: LoadingController,
    private alertCtrl: AlertController
  ) {}

  // ==========================================================================
  // 1. ORQUESTADOR DE IMPORTACIÓN (API PÚBLICA)
  // ==========================================================================

  /**
   * Punto de entrada principal para procesar una URL externa (AppUrlOpen).
   * Identifica el tipo de archivo y delega al parser correspondiente.
   */
  async processImportUrl(url: string): Promise<Track | null> {
    try {
      const normalizedPath = decodeURIComponent(url);
      const webPath = Capacitor.convertFileSrc(normalizedPath);
      
      const response = await fetch(webPath);
      const fileBlob = await response.blob();
      const urlLower = normalizedPath.toLowerCase();

      // A. Manejo de Backups Propios (.paso)
      if (urlLower.endsWith('.paso') || (await this.isMaskedBackup(fileBlob))) {
        const textContent = await fileBlob.text();
        await this.handlePasoImport(textContent);
        return null;
      }

      // B. Manejo de formatos de intercambio (GPX, KML, KMZ)
      let result = null;
      if (urlLower.endsWith('.kmz')) {
        result = await this.parseKmz(fileBlob);
      } else {
        const textContent = await fileBlob.text();
        if (textContent.includes('<gpx')) {
          result = await this.fileParser.parseGpxXml(textContent);
        } else if (textContent.includes('<kml')) {
          const doc = new DOMParser().parseFromString(textContent, 'application/xml');
          result = await this.fileParser.parseKmlXml(doc);
        } else {
          throw new Error('UNSUPPORTED_TYPE');
        }
      }

      return result ? await this.finalizeImport(result) : null;

    } catch (error) {
      this.showImportError(error);
      return null;
    }
  }

  // ==========================================================================
  // 2. PARSERS ESPECÍFICOS
  // ==========================================================================

  /** Descomprime un archivo KMZ, extrae el KML y procesa las imágenes adjuntas */
  private async parseKmz(fileBlob: Blob): Promise<any> {
    const zip = await JSZip.loadAsync(fileBlob);
    const kmlFile = Object.keys(zip.files).find(name => name.toLowerCase().endsWith('.kml'));
    if (!kmlFile) throw new Error('No KML in KMZ');

    // Extraer fotos del KMZ
    const photoMap = new Map();
    const imageFiles = Object.keys(zip.files).filter(name => name.toLowerCase().match(/\.(jpg|jpeg|png|gif)$/));
    
    for (const imgPath of imageFiles) {
      const imgData = await zip.files[imgPath].async('base64');
      const fileName = imgPath.split('/').pop() || `img_${Date.now()}.jpg`;
      const savedFile = await Filesystem.writeFile({
        path: `pasoapp_photos/${fileName}`,
        data: imgData,
        directory: Directory.Data,
        recursive: true
      });
      photoMap.set(imgPath, savedFile.uri);
    }

    const xmlContent = await zip.files[kmlFile].async('string');
    const xmlDoc = new DOMParser().parseFromString(xmlContent, 'application/xml');
    return await this.fileParser.parseKmlXml(xmlDoc, photoMap);
  }

  // ==========================================================================
  // 3. POST-PROCESAMIENTO Y ESTADÍSTICAS
  // ==========================================================================

  private async finalizeImport(result: any): Promise<Track | null> {
    const { waypoints, trackPoints, trk } = result;
    if (!trackPoints?.length || !trk) {
      this.fs.displayToast('MAP.NO_TRACK_FOUND', 'warning');
      return null;
    }

    const track = await this.computeTrackStats(trackPoints, waypoints, trk);
    await this.saveTrackToCollection(track);
    
    // Lo establecemos como la ruta de referencia actual en el mapa
    this.reference.archivedTrack = track;
    await this.location.sendReferenceToPlugin();
    this.reference.foundRoute = false;
    
    this.fs.displayToast('MAP.IMPORTED_TRACK', 'success');
    return track;
  }

  /**
   * Convierte los puntos planos del parser en una estructura Track con telemetría.
   * Calcula distancias acumuladas y límites geográficos (bbox).
   */
  private async computeTrackStats(trackPoints: any[], waypoints: any[], trk: Element): Promise<Track> {
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
        distance += this.geoMath.quickDistance(trackPoints[i - 1].lon, trackPoints[i - 1].lat, p.lon, p.lat);
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
          name, place: '', description: desc,
          date: new Date(pointData[pointData.length - 1]?.time || Date.now()),
          totalDistance: distance, totalElevationGain: 0, totalElevationLoss: 0,
          totalTime: 0, inMotion: 0, totalNumber: pointData.length
        },
        geometry: { type: 'LineString', coordinates: coords, properties: { data: pointData } },
        bbox: [lonMin, latMin, lonMax, latMax],
        waypoints: waypoints
      }]
    };

    if (pointData.length > 1) await this.geoMath.filterSpeedAndAltitude(track, 0);
    return track;
  }

  // ==========================================================================
  // 4. PERSISTENCIA
  // ==========================================================================

  private async saveTrackToCollection(track: Track): Promise<void> {
    const props = track.features[0].properties;
    const trackDate = props.date instanceof Date ? props.date : new Date(props.date || Date.now());
    const dateKey = trackDate.toISOString();

    await this.fs.storeSet(dateKey, track);
    const trackDef: TrackDefinition = {
      name: props.name || 'Imported Track',
      date: trackDate,
      place: track.features[0].geometry.coordinates[0] as any,
      description: props.description || '',
      isChecked: true,
      photos: []
    };

    // Sincronizamos las fotos de los waypoints con el índice de la colección
    if (track.features[0].waypoints && track.features[0].waypoints.length > 0) {
      track.features[0].waypoints.forEach(wp => {
        if (wp.photos && wp.photos.length > 0) {
          trackDef.photos?.push(...wp.photos);
        }
      });
    }

    this.fs.collection.unshift(trackDef);
    await this.fs.storeSet('collection', this.fs.collection);
  }

  // ==========================================================================
  // 5. IMPORTACIÓN DE BACKUPS (.PASO)
  // ==========================================================================

  /** Procesa un backup completo, restaurando colección y todos los tracks asociados */
  private async handlePasoImport(fileData: string) {
    let loading = await this.loadingCtrl.create({
      message: this.translate.instant('SETTINGS.BACKUP_RESTORING'),
      spinner: 'crescent'
    });
    await loading.present();

    try {
      const backupData = await this.backupService.importPasoFile(fileData);
      if (!backupData) throw new Error('IMPORT_FAILED');

      if (backupData.collection) {
        this.fs.collection = backupData.collection;
        await this.fs.storeSet('collection', this.fs.collection);
      }

      for (const key of Object.keys(backupData)) {
        if (key !== 'collection' && key !== 'settings') {
          await this.fs.storeSet(key, backupData[key]);
        }
      }

      await loading.dismiss();
      this.fs.displayToast('BACKUP.RESTORE_SUCCESS', 'success');
      setTimeout(() => window.location.replace('/'), 1500);
    } catch (error) {
      if (loading) await loading.dismiss();
      const alert = await this.alertCtrl.create({
        header: this.translate.instant('SETTINGS.BACKUP_ERROR_TITLE'),
        message: this.translate.instant('SETTINGS.RESTORE_ERROR_DESC'),
        buttons: ['OK']
      });
      await alert.present();
    }
  }

  // ==========================================================================
  // 6. HELPERS PRIVADOS
  // ==========================================================================

  private showImportError(error: any) {
    const key = error?.message === 'UNSUPPORTED_TYPE' ? 'MAP.ERROR_UNSUPPORTED' : 'SETTINGS.RESTORE_ERROR_DESC';
    this.fs.displayToast(this.translate.instant(key), 'error');
  }

  private async isMaskedBackup(blob: Blob): Promise<boolean> {
    const text = await blob.slice(0, 10).text();
    return text.startsWith('UEsDB'); // Cabecera ZIP en Base64/Binary
  }
}
