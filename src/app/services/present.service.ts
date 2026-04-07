import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { Feature } from 'ol';
import { LineString, Point } from 'ol/geom';

// --- INTERNAL IMPORTS ---
import { Track } from '../../globald';
import { Location } from '../../plugins/MyServicePlugin';
import { StylerService } from './styler.service';
import { GeographyService } from './geography.service';
import { FunctionsService } from './functions.service';
import { GeoMathService } from './geo-math.service';
import { LocationManagerService } from './location-manager.service';

@Injectable({
  providedIn: 'root'
})
export class PresentService {
  
  // ==========================================================================
  // 1. ESTADO REACTIVO (Core)
  // ==========================================================================
  private readonly _currentTrack = new BehaviorSubject<Track | undefined>(undefined);
  public readonly currentTrack$ = this._currentTrack.asObservable(); 

  get currentTrack(): Track | undefined {
    return this._currentTrack.value;
  }
  set currentTrack(track: Track | undefined) {
    this._currentTrack.next(track);
  }

  // ==========================================================================
  // 2. VARIABLES Y ESTADO DE LA INTERFAZ
  // ==========================================================================
  public currentColor: string = 'orange';
  public filtered: number = 0;
  public computedDistances: number = 0;

  // UI State (Popovers y Vistas)
  public isRecordPopoverOpen: boolean = false;
  public isConfirmStopOpen: boolean = false;
  public isConfirmDeletionOpen: boolean = false;
  public mapIsReady: boolean = false;
  public hasPendingDisplay: boolean = false;
  public visibleAll: boolean = false;

  // ==========================================================================
  // 3. VARIABLES INTERNAS (Caché y Control)
  // ==========================================================================
  private hasCenteredInitial: boolean = false;
  
  // Caché de OpenLayers
  private routeLineFeature?: Feature<LineString>;
  private startPinFeature?: Feature<Point>;

  constructor(
    private stylerService: StylerService,
    private geography: GeographyService,
    public fs: FunctionsService,
    private location: LocationManagerService,
    private geoMath: GeoMathService
  ) { }

  // ==========================================================================
  // 4. CICLO DE VIDA DEL TRACK
  // ==========================================================================

  /**
   * Punto de entrada principal para procesar nuevos puntos GPS en el track activo.
   * Decide si inicializar una ruta nueva o añadir el punto a la existente.
   */
  public async updateTrack(location: Location): Promise<boolean> {
    if (!this.geography.map || !this.geography.currentLayer) return false;

    this.handleInitialAutoCenter(location);

    if (!this.currentTrack) {
      return this.initNewTrack(location);
    } else {
      return this.appendExistingTrack(this.currentTrack, location);
    }
  }

  /**
   * Tarea pesada que se ejecuta solo cuando la app está en primer plano.
   * Procesa matemáticas de filtrado y actualiza el dibujo del mapa.
   */
  public async foregroundTask(track: Track): Promise<Track | undefined> {
    if (!track) return undefined;
    
    // 🚀 Delegamos la matemática pesada al GeoMathService
    let updatedTrack = await this.geoMath.accumulatedDistances(track, this.filtered);
    updatedTrack = await this.geoMath.filterSpeedAndAltitude(updatedTrack, this.filtered);
    
    this.filtered = updatedTrack.features[0].geometry.coordinates.length - 1;
    
    await this.displayCurrentTrack(updatedTrack);
    return updatedTrack;
  }

  // ==========================================================================
  // 5. MOTOR DE RENDERIZADO (OpenLayers)
  // ==========================================================================

  /**
   * Actualiza las geometrías de OpenLayers en la capa actual.
   * Utiliza caché de features para evitar búsquedas costosas en el motor de mapas.
   */
  public async displayCurrentTrack(track: Track): Promise<void> {
    const source = this.geography.currentLayer?.getSource();
    if (!source || !track) return;

    const coords = track.features[0].geometry.coordinates;
    if (coords.length < 1) return;

    if (!this.routeLineFeature || !this.startPinFeature) {
      const features = source.getFeatures();
      this.routeLineFeature = features.find(f => f.get('type') === 'route_line') as Feature<LineString>;
      this.startPinFeature = features.find(f => f.get('type') === 'start_pin') as Feature<Point>;
    }

    if (this.routeLineFeature && coords.length >= 2) {
      this.routeLineFeature.getGeometry()?.setCoordinates(coords);
      this.routeLineFeature.setStyle(this.stylerService.setStrokeStyle(this.currentColor));
    }

    if (this.startPinFeature) {
      this.startPinFeature.getGeometry()?.setCoordinates(coords[0]);
    }

    const count = coords.length;
    if ([5, 15, 30].includes(count) || count % 100 === 0) {
      await this.geography.setMapView(track);
    }
  }

  // ==========================================================================
  // 6. MÉTODOS PRIVADOS (Helpers)
  // ==========================================================================

  /** Centra la cámara automáticamente en el primer punto válido recibido */
  private handleInitialAutoCenter(location: Location): void {
    if (!this.hasCenteredInitial && location.longitude && location.latitude) {
      this.geography.map?.getView().animate({
        center: [location.longitude, location.latitude],
        zoom: 16,
        duration: 1000
      });
      this.hasCenteredInitial = true;
    }
  }

  /** Crea la estructura GeoJSON inicial y los marcadores de mapa para una nueva ruta */
  private initNewTrack(location: Location): boolean {
    this.resetTrackingState();
    
    const initialBBox: [number, number, number, number] = [
      location.longitude, location.latitude, location.longitude, location.latitude
    ];
    
    const routeLine = new Feature({ geometry: new LineString([]) });
    routeLine.set('type', 'route_line');
    
    const startPin = new Feature({ geometry: new Point([location.longitude, location.latitude]) });
    startPin.set('type', 'start_pin');
    startPin.setStyle(this.stylerService.createPinStyle('green'));

    this.currentTrack = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        bbox: initialBBox,
        properties: { 
          name: '', place: '', date: new Date(), description: '',
          totalDistance: 0, totalElevationGain: 0, totalElevationLoss: 0,
          totalTime: 0, inMotion: 0, totalNumber: 1,
          currentAltitude: location.altitude, currentSpeed: 0
        },
        geometry: {
          type: 'LineString',
          coordinates: [[location.longitude, location.latitude]],
          properties: {
            data: [{
              altitude: location.altitude, speed: location.speed, time: location.time,
              compSpeed: 0, compAltitude: location.altitude, distance: 0
            }]
          }
        },
        waypoints: []
      }]
    };

    const source = this.geography.currentLayer?.getSource();
    if (source) {
      source.clear();
      source.addFeatures([routeLine, startPin]);
    }
    return true;
  }

  /** 
   * Inserta un punto en el GeoJSON y gestiona la lógica de suavizado de altitud 
   * si se detectan saltos bruscos.
   */
  private async appendExistingTrack(track: Track, location: Location): Promise<boolean> {
    const dataArray = track.features[0].geometry.properties.data;
    const lastData = dataArray[dataArray.length - 1];

    if (location.time <= lastData.time) return false;

    const altDiff = Math.abs(location.altitude - lastData.altitude);
    if (location.time - lastData.time < 60000 && altDiff > 50) {
      location.altitude = lastData.altitude + (5 * Math.sign(location.altitude - lastData.altitude));
    }

    location.speed = location.speed * 3.6; 

    const updatedTrack = await this.location.fillGeojson(track, location);
    
    if (this.location.foreground && updatedTrack) {
      this.currentTrack = await this.foregroundTask(updatedTrack);
    } else {
      this.currentTrack = updatedTrack;
    }
    
    return true;
  }

  private resetTrackingState(): void {
    this.filtered = 0;
    this.computedDistances = 0;
    this.hasCenteredInitial = false; 
    this.routeLineFeature = undefined;
    this.startPinFeature = undefined;
  }
}