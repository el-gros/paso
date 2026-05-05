import { Injectable, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';

// OpenLayers
import Point from 'ol/geom/Point';
import LineString from 'ol/geom/LineString';

// Servicios
import { FunctionsService } from './functions.service';
import { GeographyService } from './geography.service';
import { LocationManagerService } from './location-manager.service';
import { PresentService } from './present.service';
import { StylerService } from './styler.service';
import { PhotoService } from './photo.service';
import { SnapToTrailService } from './snapToTrail.service';
import { GeoMathService } from './geo-math.service';
import { SmartRouteBuilderService } from './smart-route-builder.service';

@Injectable({
  providedIn: 'root'
})
export class TrackManagerService {
  private fs = inject(FunctionsService);
  private geography = inject(GeographyService);
  private location = inject(LocationManagerService);
  private present = inject(PresentService);
  private stylerService = inject(StylerService);
  private translate = inject(TranslateService);
  private photo = inject(PhotoService);
  private snapToTrailService = inject(SnapToTrailService);
  private geoMath = inject(GeoMathService);
  private smartRouteBuilder = inject(SmartRouteBuilderService);

  // ==========================================================================
  // 1. BORRAR TRACK
  // ==========================================================================
  async deleteTrackProcess() {
    this.location.state = 'inactive';
    this.present.currentTrack = undefined;
    this.geography.currentLayer?.getSource()?.clear();
    await this.photo.discardSessionPhotos();
  }

  // ==========================================================================
  // 2. DETENER TRACK (Prepara la vista en el mapa)
  // ==========================================================================
  async stopTrackingProcess(): Promise<boolean> {
    this.location.state = 'stopped';
    const source = this.geography.currentLayer?.getSource();

    if (!source || !this.present.currentTrack || !this.geography.map) return false;

    const coordinates = this.present.currentTrack.features?.[0]?.geometry?.coordinates;
    if (!Array.isArray(coordinates) || coordinates.length === 0) {
      return false; // Track vacío
    }

    const features = source.getFeatures();
    const routeLine = features.find((f) => f.get('type') === 'route_line');
    const startPin = features.find((f) => f.get('type') === 'start_pin');
    const endPin = features.find((f) => f.get('type') === 'end_pin');

    if (routeLine) {
      routeLine.setGeometry(new LineString(coordinates));
      routeLine.setStyle(this.stylerService.setStrokeStyle(this.present.currentColor));
    }
    if (startPin) {
      startPin.setGeometry(new Point(coordinates[0]));
      startPin.setStyle(this.stylerService.createPinStyle('green'));
    }
    if (endPin) {
      endPin.setGeometry(new Point(coordinates[coordinates.length - 1]));
      endPin.setStyle(this.stylerService.createPinStyle('red'));
    }

    await this.geography.setMapView(this.present.currentTrack);
    await this.location.sendReferenceToPlugin();
    return true; // Éxito
  }

  // ==========================================================================
  // 3. GENERAR TEXTOS IA (Wikiloc style)
  // ==========================================================================
  async generateSmartTexts(): Promise<{ name: string; description: string }> {
    const track = this.present.currentTrack;
    if (!track?.features?.[0]) return { name: '', description: '' };

    try {
      const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('TIMEOUT_SMART_ROUTE')), 10000)
      );

      const autoTexts: any = await Promise.race([
        this.smartRouteBuilder.generateWikilocStyleTexts(track.features[0]),
        timeout,
      ]);

      console.log('Textos autogenerados:', autoTexts);
      return {
        name: autoTexts?.title || autoTexts?.name || '',
        description: autoTexts?.description || '',
      };
    } catch (err: any) {
      console.warn('⚠️ Fallo o timeout al autogenerar textos:', err.message || err);
      return { name: '', description: '' };
    }
  }

  // ==========================================================================
  // 4. GUARDADO FINAL (Procesamiento pesado)
  // ==========================================================================
  async processAndSaveTrack(
    name: string,
    description: string,
    onProgressUpdate?: (message: string) => void
  ) {
    const track = this.present.currentTrack;
    if (!track?.features?.[0]) throw new Error('Track vacío');

    let trackToProcess = JSON.parse(JSON.stringify(track));
    const rawCoords = trackToProcess.features[0].geometry.coordinates;

    // 1. Limpieza de picos
    const cleanedCoords = this.geoMath.removeGpsSpikesHybrid(rawCoords, 15);
    trackToProcess.features[0].geometry.coordinates = cleanedCoords;

    if (onProgressUpdate) onProgressUpdate(this.translate.instant('RECORD.APPLYING_ELEVATION'));

    // 2. Aplicar Elevación DEM
    let snappedTrack;
    try {
      const trailReference = trackToProcess.features[0].geometry.coordinates.map((c: any) => ({
        lng: c[0],
        lat: c[1],
      }));

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('TIMEOUT_OFFLINE')), 10000)
      );

      snappedTrack = await Promise.race([
        this.snapToTrailService.prepareTrackWithTrails(trackToProcess, trailReference),
        timeoutPromise,
      ]);
    } catch (err) {
      console.warn('⚠️ Sin conexión o DEM muy lento. Guardando con GPS puro + EGM96.', err);
      snappedTrack = trackToProcess;
    }

    // 3. Filtrar velocidades
    const optimizedTrack = await this.geoMath.filterSpeedAndAltitude(snappedTrack, 0);
    const finalTrack =
      optimizedTrack?.features?.[0]?.geometry?.coordinates?.length > 0
        ? optimizedTrack
        : trackToProcess;

    const feature = finalTrack.features[0];
    const saveDate = new Date();
    const dateKey = saveDate.toISOString();

    feature.properties.name = name;
    feature.properties.place = feature.geometry.coordinates[0];
    feature.properties.description = description;
    feature.properties.date = saveDate;

    // 4. Procesar Fotos
    let routePhotos: string[] = [];
    if (feature.waypoints) {
      routePhotos = feature.waypoints
        .filter((wp: any) => wp.photos?.length > 0)
        .flatMap((wp: any) => wp.photos);
    }

    // 5. Guardar en Base de Datos
    await this.fs.storeSet(dateKey, finalTrack);

    const newItem: any = {
      name,
      date: saveDate,
      place: feature.properties.place,
      description,
      isChecked: false,
      photos: routePhotos,
      file: dateKey,
      distance: feature.properties.distance || 0,
      duration: feature.properties.duration || 0,
    };

    this.fs.collection.unshift(newItem);
    await this.fs.storeSet('collection', this.fs.collection);
    this.fs.collection = [...this.fs.collection];

    await this.photo.confirmSessionPhotos();

    // 6. Limpieza Final
    this.location.state = 'inactive';
    this.present.currentTrack = undefined;
    this.geography.currentLayer?.getSource()?.clear();
  }
}