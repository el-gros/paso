import { Track, Location, Data, Waypoint, Bounds, PartialSpeed, TrackDefinition } from 'src/globald';
import { StylerService } from './styler.service'
import { GeographyService } from './geography.service';
import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { LineString, Point } from 'ol/geom';
import { FunctionsService } from '../services/functions.service';
import { Feature } from 'ol';
import { LocationManagerService } from '../services/location-manager.service';

@Injectable({
  providedIn: 'root'
})

  export class PresentService {
  
  private _currentTrack = new BehaviorSubject<Track | undefined>(undefined);
  currentTrack$ = this._currentTrack.asObservable(); // 👈 observable for others to subscribe
  currentColor: string = 'orange';
  computedDistances: number = 0;
  filtered: number = 0;
  isRecordPopoverOpen: boolean = false;
  isConfirmStopOpen = false;
  isConfirmDeletionOpen = false;

  constructor(
    private stylerService: StylerService,
    private geography: GeographyService,
    public fs: FunctionsService,
    private styler: StylerService,
    private location: LocationManagerService
  ) { }

  get currentTrack(): Track | undefined {
    return this._currentTrack.value;
  }

  set currentTrack(track: Track | undefined) {
    this._currentTrack.next(track); // 👈 triggers subscribers
  }

  async displayCurrentTrack(currentTrack: any): Promise<void> {
      if (!this.geography.map || !currentTrack || !this.geography.currentLayer) return;
      const source = this.geography.currentLayer.getSource();
      if (!source) return;
      const coordinates = currentTrack.features?.[0]?.geometry?.coordinates;
      if (!Array.isArray(coordinates) || coordinates.length < 1) return;
      const num = coordinates.length;
      // 1. Buscamos las features por su etiqueta de tipo
      const features = source.getFeatures();
      const routeLine = features.find(f => f.get('type') === 'route_line');
      const startPin = features.find(f => f.get('type') === 'start_pin');
      // 2. Actualizamos la Línea (Solo si tenemos suficientes puntos)
      if (routeLine && num >= 2) {
          routeLine.setGeometry(new LineString(coordinates));
          routeLine.setStyle(this.stylerService.setStrokeStyle(this.currentColor));
      }
      // 3. Actualizamos el Pin de Inicio (Solo si existe)
      if (startPin) {
          startPin.setGeometry(new Point(coordinates[0]));
          startPin.setStyle(this.stylerService.createPinStyle('green'));
      }
      // 4. Ajustar la vista del mapa ocasionalmente
      // (Mantenemos tu lógica de intervalos, es muy buena para no marear al usuario)
      if ([5, 10, 25].includes(num) || num % 50 === 0) {
          await this.geography.setMapView(currentTrack);
      }
  }

  // ACCUMULATED DISTANCES ////////////////////////////////
  async accumulatedDistances(track: any) {
    if (!track) return;
    // get coordinates and data arrays
    let coordinates = track.features[0].geometry.coordinates;
    let data = track.features[0].geometry.properties.data;
    let num = coordinates.length ?? 0;
    // Ensure data exists and has enough entries
    if (num < 2 || !data || data.length != num) return track;
    // Compute distances for each point
    for (let i = this.filtered + 1; i < num; i++) {
      const lastPoint = coordinates[i - 1];
      const currPoint = coordinates[i];
      // Calculate the distance
      const distance = this.fs.computeDistance(lastPoint[0], lastPoint[1], currPoint[0], currPoint[1]);
      // Update the data with the new distance
      data[i].distance = data[i - 1].distance + distance;
    }
    //const startTime = data[0].time;
    //const endTime = data[num-1].time;
    //track.features[0].properties.totalTime = this.fs.formatMillisecondsToUTC(endTime - startTime) || 0; 
    track.features[0].properties.totalDistance = data[num-1].distance;
    track.features[0].properties.totalNumber = num;
    return track
  }

    // 38. SET WAYPOINT ALTITUDE ////////////////////////////////////////
  async setWaypointAltitude() {
    if (!this.currentTrack) return;
    // Retrieve waypoints
    const waypoints: Waypoint[] = this.currentTrack.features[0].waypoints || [];
    for (const wp of waypoints) {
      if (wp.altitude != null && wp.altitude >= 0) wp.altitude = this.currentTrack.features[0].geometry.properties.data[wp.altitude].altitude
    }
    console.log(this.currentTrack)
  }

  // 8. FOREGROUND TASK ////////////////////////
  async foregroundTask(track: any) {
    if (!track) return undefined;   
    const num = track.features[0].geometry.coordinates.length;
     // 2. Cálculos de distancia y filtrado de velocidad y altitud
    track = await this.accumulatedDistances(track);
    track = await this.fs.filterSpeedAndAltitude(track, this.filtered+1);
    this.filtered = num - 1;
    // 3. UI y Mapa (Dentro de la zona para asegurar refresco de etiquetas)
    await this.displayCurrentTrack(track);
    return track
  }

  async updateTrack(location: Location): Promise<boolean> {
    if (!this.geography.map || !this.geography.currentLayer) return false;
    // 1. INICIALIZACIÓN (Primer punto)
    if (!this.currentTrack) {
      // Creamos las features con sus etiquetas 'type'
      const routeLine = new Feature();
      routeLine.set('type', 'route_line');
      const startPin = new Feature();
      startPin.set('type', 'start_pin');
      const endPin = new Feature(); // Se crea ahora, se posicionará en stopTracking
      endPin.set('type', 'end_pin');
      const features = [routeLine, startPin, endPin];
      this.currentTrack = {
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          properties: {
            name: '', place: '', date: undefined, description: '',
            totalDistance: 0, totalElevationGain: 0, totalElevationLoss: 0,
            totalTime: 0, inMotion: 0, totalNumber: 1,
            currentAltitude: undefined, currentSpeed: undefined
          },
          bbox: [location.longitude, location.latitude, location.longitude, location.latitude],
          geometry: {
            type: 'LineString',
            coordinates: [[location.longitude, location.latitude]],
            properties: {
              data: [{
                altitude: location.altitude,
                speed: location.speed,
                time: location.time,
                compSpeed: 0,
                compAltitude: location.altitude,
                distance: 0
              }]
            }
          },
          waypoints: []
        }]
      };
      this.location.stopped = 0;
      this.location.averagedSpeed = 0;
      // Posicionar el pin de inicio
      startPin.setGeometry(new Point([location.longitude, location.latitude]));
      startPin.setStyle(this.styler.createPinStyle('green'));
      // Registrar en el mapa
      const source = this.geography.currentLayer.getSource();
      if (source) {
        source.clear();
        source.addFeatures(features);
      }
      return true;
    }
    // 2. ACTUALIZACIÓN (Puntos sucesivos)
    const num = this.currentTrack.features[0].geometry.coordinates.length;
    const prevData = this.currentTrack.features[0].geometry.properties.data[num - 1];
    const previousTime = prevData?.time || 0;
    const previousAltitude = prevData?.altitude || 0;
    if (previousTime > location.time) return false;
    // Suavizado de altitud
    if (location.time - previousTime < 60000 && Math.abs(location.altitude - previousAltitude) > 50) {
      location.altitude = previousAltitude + 10 * Math.sign(location.altitude - previousAltitude);
    }
    location.speed = location.speed * 3.6;
    // Añadir punto al geojson y actualizar la geometría de la línea en el mapa
    let track: any = this.currentTrack;
    track = await this.location.fillGeojson(track, location);
    if (this.location.foreground) this.currentTrack = await this.foregroundTask(track);
    return true;
  }

} 