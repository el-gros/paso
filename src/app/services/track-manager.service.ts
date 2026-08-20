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
import { ReferenceService } from './reference.service';

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
  private reference = inject(ReferenceService);

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
  // 4. GUARDADO FINAL (Procesamiento rápido y seguro - SÓLO GPS)
  // ==========================================================================
  async processAndSaveTrack(
    name: string,
    description: string
  ) {
    const track = this.present.currentTrack;
    if (!track?.features?.[0]) throw new Error('Track vacío');

    let trackToProcess = JSON.parse(JSON.stringify(track));
    const rawCoords = trackToProcess.features[0].geometry.coordinates;

    // 1. Limpieza rápida (Matemática local)
    const cleanedCoords = this.geoMath.removeGpsSpikesHybrid(rawCoords, 15);
    trackToProcess.features[0].geometry.coordinates = cleanedCoords;

    const optimizedTrack = await this.geoMath.filterSpeedAndAltitude(trackToProcess, 0);
    const finalTrack = optimizedTrack?.features?.[0]?.geometry?.coordinates?.length > 0
        ? optimizedTrack
        : trackToProcess;

    const feature = finalTrack.features[0];
    const saveDate = new Date();
    const dateKey = saveDate.toISOString();

    feature.properties.name = name;
    feature.properties.place = feature.geometry.coordinates[0];
    feature.properties.description = description;
    feature.properties.date = saveDate;
    
    feature.properties.processingStatus = 'pending';

    // 2. Calcular estadísticas básicas y SINCRONIZAR GRÁFICO
    let gpsGain = 0, gpsLoss = 0, maxZ = -Infinity, minZ = Infinity;
    const coords = feature.geometry.coordinates;
    const data = feature.properties.data; // Referencia a los datos del gráfico

    for (let i = 0; i < coords.length; i++) {
      const z = coords[i][2] || 0;
      
      // 🔥 SINCRONIZACIÓN CLAVE: Inyectamos la Z del GPS al array del gráfico
      if (data && data[i]) {
        data[i].altitude = z;
        data[i].isMSL = false; // Indicamos que es altitud nativa GPS, no de modelo DEM
      }

      if (z > maxZ) maxZ = z;
      if (z < minZ) minZ = z;
      if (i > 0) {
        const diff = z - (coords[i - 1][2] || 0);
        if (diff > 0) gpsGain += diff;
        else if (diff < 0) gpsLoss += Math.abs(diff);
      }
    }

    feature.properties.stats = {
      elevationGain: Math.round(gpsGain),
      elevationLoss: Math.round(gpsLoss),
      maxElevation: maxZ !== -Infinity ? Math.round(maxZ) : 0,
      minElevation: minZ !== Infinity ? Math.round(minZ) : 0
    };

    // 3. Procesar Fotos
    let routePhotos: string[] = [];
    if (feature.waypoints) {
      routePhotos = feature.waypoints
        .filter((wp: any) => wp.photos?.length > 0)
        .flatMap((wp: any) => wp.photos);
    }

    // 4. GUARDADO INMEDIATO EN BASE DE DATOS
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
      stats: feature.properties.stats,
      processingStatus: 'pending' // 🔥 UI mostrará el track finalizado
    };

    this.fs.collection.unshift(newItem);
    await this.fs.storeSet('collection', this.fs.collection);
    this.fs.collection = [...this.fs.collection];

    await this.photo.confirmSessionPhotos();

    // 5. Limpieza Final de la UI
    this.location.state = 'inactive';
    this.present.currentTrack = undefined;
    this.geography.currentLayer?.getSource()?.clear();

    // 6. El proceso DEM queda anulado a petición tuya
    // this.applyDEMInBackground(dateKey).catch(err => console.error('Error DEM Background:', err));
  }

    
// ==========================================================================
  // 5. PROCESO SECUNDARIO SILENCIOSO (LIMPIO Y SIN BLOQUEOS NATIVOS)
  // ==========================================================================
  async applyDEMInBackground(dateKey: string): Promise<boolean> {
    console.log('Iniciando corrección DEM en segundo plano para:', dateKey);
    
    try {
      // 1. Recuperar el track recién guardado
      const track = await this.fs.storeGet(dateKey);
      if (!track) return false;

      // 2. Aplicar la corrección (Snap + Altitudes Open-Meteo + Suavizado)
      const updatedTrack = await this.applyDEMAndRecalculateStats(track);

// 3. Si hubo éxito ('completed'), actualizamos BD y UI silenciosamente
      const status = updatedTrack.features[0].properties.processingStatus;
      
      if (status === 'completed') {
        await this.fs.storeSet(dateKey, updatedTrack);

        const index = this.fs.collection.findIndex((t: any) => t.file === dateKey);
        if (index !== -1) {
          this.fs.collection[index].stats = updatedTrack.features[0].properties.stats;
          this.fs.collection[index].processingStatus = 'completed';
          
          await this.fs.storeSet('collection', this.fs.collection);
          this.fs.collection = [...this.fs.collection]; 
        }

        // 🔥 NUEVO: Si la ruta que acabamos de procesar es la que el usuario está viendo en pantalla, la actualizamos para que el gráfico se repinte.
        if (this.reference.archivedTrack && this.reference.archivedTrack.features[0].properties.date === updatedTrack.features[0].properties.date) {
           this.reference.archivedTrack = updatedTrack;
        }

        console.log('✨ Corrección DEM aplicada y guardada con éxito.');
        return true; 
      }
      return false;

    } catch (error) {
      console.error('Error crítico en el proceso DEM de fondo:', error);
      return false; 
    }
  }

/**
   * Aplica DEM (con timeout offline) y recalcula los desniveles del track
   */
  async applyDEMAndRecalculateStats(track: any): Promise<any> {
    if (track.features[0].properties.processingStatus === 'completed') {
      console.log('🛑 El track ya tiene DEM aplicado. Omitiendo recálculo innecesario.');
      return track;
    }
    const feature = track.features[0];
    const rawCoords = feature.geometry.coordinates;
    const trailReference = rawCoords.map((c: any) => ({ lng: c[0], lat: c[1] }));

    let snappedTrack;
    let demStatus  = 'pending';
    
    // 1. INTENTAR APLICAR DEM (Con Timeout de 90s)
    try {
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('TIMEOUT_OFFLINE')), 90000)
      );

      snappedTrack = await Promise.race([
        this.snapToTrailService.prepareTrackWithTrails(track, trailReference),
        timeoutPromise,
      ]) as any;

      if (!snappedTrack || !snappedTrack.features?.[0]?.geometry?.coordinates?.length) {
        throw new Error('El servicio DEM devolvió datos inválidos o vacíos.');
      }

      demStatus = 'completed'; 

    } catch (err) {
      console.warn('⚠️ DEM fallido o cancelado. Se guardará como PENDIENTE.', err);
      snappedTrack = track; 
      demStatus = 'pending'; 
    }

    // 2. RECALCULAR DESNIVELES OBLIGATORIOS Y SINCRONIZAR GRÁFICO
    const coordinates = snappedTrack.features[0].geometry.coordinates;
    
    // 🔥 CORRECCIÓN: Buscamos el array del gráfico en el lugar exacto de tu arquitectura
    const data = snappedTrack.features[0].geometry?.properties?.data || snappedTrack.features[0].properties?.data;
    
    let elevationGain = 0;
    let elevationLoss = 0;
    let maxElevation = -Infinity;
    let minElevation = Infinity;

    for (let i = 0; i < coordinates.length; i++) {
      const currentZ = coordinates[i][2] || 0;

      // 🔥 Ahora sí inyectamos la altitud calculada directamente a la gráfica
      if (data && data[i]) {
        data[i].altitude = currentZ;
        data[i].compAltitude = currentZ;
        data[i].isMSL = (demStatus === 'completed'); 
      }

      if (currentZ > maxElevation) maxElevation = currentZ;
      if (currentZ < minElevation) minElevation = currentZ;

      if (i > 0) {
        const previousZ = coordinates[i - 1][2] || 0;
        const diff = currentZ - previousZ;
        if (diff > 0) {
          elevationGain += diff;
        } else if (diff < 0) {
          elevationLoss += Math.abs(diff);
        }
      }
    }

    // 3. GUARDAR ESTADÍSTICAS EN LAS PROPIEDADES DEL TRACK
    snappedTrack.features[0].properties.totalElevationGain = elevationGain;
    snappedTrack.features[0].properties.totalElevationLoss = elevationLoss;
    snappedTrack.features[0].properties.processingStatus = demStatus;
    
    if (!snappedTrack.features[0].properties.stats) {
      snappedTrack.features[0].properties.stats = {};
    }
    
    const stats = snappedTrack.features[0].properties.stats;
    stats.elevationGain = Math.round(elevationGain);
    stats.elevationLoss = Math.round(elevationLoss);
    stats.maxElevation = maxElevation !== -Infinity ? Math.round(maxElevation) : 0;
    stats.minElevation = minElevation !== Infinity ? Math.round(minElevation) : 0;

    return snappedTrack;
  }
}