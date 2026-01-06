import { StylerService } from './styler.service'
import { Track } from 'src/globald';
import { GeographyService } from './geography.service';
import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { LineString, Point } from 'ol/geom';
import { FunctionsService } from '../services/functions.service';

@Injectable({
  providedIn: 'root'
})

  export class PresentService {
  
  private _currentTrack = new BehaviorSubject<Track | undefined>(undefined);
  currentTrack$ = this._currentTrack.asObservable(); // 👈 observable for others to subscribe
  currentColor: string = 'orange';
  computedDistances: number = 0;
  altitudeFiltered: number = -1;

  constructor(
    private stylerService: StylerService,
    private geography: GeographyService,
    public fs: FunctionsService
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
          this.geography.setMapView(currentTrack);
      }
  }

  // ACCUMULATED DISTANCES ////////////////////////////////
  async accumulatedDistances() {
    if (!this.currentTrack) return;
    // get coordinates and data arrays
    const coordinates = this.currentTrack.features[0].geometry.coordinates;
    const data = this.currentTrack.features[0].geometry.properties.data;
    let num = coordinates.length ?? 0;
    // Ensure data exists and has enough entries
    if (num < 2 || !data || data.length != num) return;
    // Compute distances for each point
    for (let i = this.computedDistances + 1; i < num; i++) {
      const lastPoint = coordinates[i - 1];
      const currPoint = coordinates[i];
      // Calculate the distance
      const distance = this.fs.computeDistance(lastPoint[0], lastPoint[1], currPoint[0], currPoint[1]);
      // Update the data with the new distance
      data[i].distance = data[i - 1].distance + distance;
      // Track the last computed distance index
      this.computedDistances = i;
    }
  }

  async filterAltitude(track: any, initial: number, final: number) {
    if (!track?.features?.[0]?.geometry?.properties?.data) return NaN;
    const data = track.features[0].geometry.properties.data;
    const props = track.features[0].properties;
    const num = data.length;
    if (num === 0) return NaN;
    // Ensure bounds are safe
    const startIdx = Math.max(0, initial);
    const endLimit = Math.min(final, num - 1);
    for (let i = startIdx; i <= endLimit; i++) {
      // 1. Safety Check: Does the object at this index exist?
      if (!data[i]) continue;
      // 2. Smoothing (Moving Average)
      const lag = this.fs.lag || 2; 
      const start = Math.max(0, i - lag);
      const end = Math.min(i + lag, num - 1);
      let sum = 0;
      let count = 0;
      for (let j = start; j <= end; j++) {
        if (data[j]) {
          sum += data[j].altitude;
          count++;
        }
      }
      const smoothedAltitude = sum / count;
      data[i].altitude = smoothedAltitude;
      // 3. Elevation Gain/Loss with Threshold (Hysteresis)
      if (i > 0 && data[i-1]) {
        const slope = data[i].altitude - data[i - 1].altitude;
        const minThreshold = 0.25; // Ignore tiny micro-movements
        if (Math.abs(slope) > minThreshold) {
          if (slope > 0) {
            props.totalElevationGain = (props.totalElevationGain || 0) + slope;
          } else {
            props.totalElevationLoss = (props.totalElevationLoss || 0) - Math.abs(slope);
          }
        }
      }
      props.currentAltitude = data[i].altitude;
    }
    return endLimit;
  }

  async htmlValues() {
    if (!this.currentTrack) return;
    // Get the data array
    const data = this.currentTrack.features[0].geometry.properties.data;
    // Ensure data exists and has elements
    const num = data.length ?? 0;
    if (num < 1) return;
    // Update HTML values
    this.currentTrack.features[0].properties.totalDistance = data[num - 1].distance;
    this.currentTrack.features[0].properties.totalTime = this.fs.formatMillisecondsToUTC(data[num - 1].time - data[0].time);
    this.currentTrack.features[0].properties.totalNumber = num;
    this.currentTrack.features[0].properties.currentSpeed = data[num - 1].compSpeed;
  }

}