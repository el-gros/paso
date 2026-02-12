import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { Feature } from 'ol';
import { LineString, Point } from 'ol/geom';

// Internal Imports
import { Track, Waypoint, ParsedPoint } from 'src/globald';
import { StylerService } from './styler.service';
import { GeographyService } from './geography.service';
import { FunctionsService } from '../services/functions.service';
import { LocationManagerService } from '../services/location-manager.service';
import { Location } from 'src/plugins/MyServicePlugin';

@Injectable({
  providedIn: 'root'
})
export class PresentService {
  
  private hasCenteredInitial = false;

  private readonly _currentTrack = new BehaviorSubject<Track | undefined>(undefined);
  readonly currentTrack$ = this._currentTrack.asObservable(); 
  
  // Cache for OpenLayers features to avoid O(n) lookups on every GPS tick
  private routeLineFeature?: Feature<LineString>;
  private startPinFeature?: Feature<Point>;

  currentColor: string = 'orange';
  filtered: number = 0;
  computedDistances: number = 0; // <--- Add this line
  
  // UI State
  isRecordPopoverOpen: boolean = false;
  isConfirmStopOpen = false;
  isConfirmDeletionOpen = false;
  mapIsReady: boolean = false;
  hasPendingDisplay: boolean = false;
  visibleAll: boolean = false;

  constructor(
    private stylerService: StylerService,
    private geography: GeographyService,
    public fs: FunctionsService,
    private location: LocationManagerService,
  ) { }

  // --- Getters / Setters ---
  get currentTrack(): Track | undefined {
    return this._currentTrack.value;
  }

  set currentTrack(track: Track | undefined) {
    this._currentTrack.next(track);
  }

  // --- 1. RENDERING ENGINE ---
  async displayCurrentTrack(track: Track): Promise<void> {
    const source = this.geography.currentLayer?.getSource();
    if (!source || !track) return;

    const coords = track.features[0].geometry.coordinates;
    if (coords.length < 1) return;

    // Initialize or retrieve cached features
    if (!this.routeLineFeature || !this.startPinFeature) {
      const features = source.getFeatures();
      this.routeLineFeature = features.find(f => f.get('type') === 'route_line') as Feature<LineString>;
      this.startPinFeature = features.find(f => f.get('type') === 'start_pin') as Feature<Point>;
    }

    // Update Line Geometry
    if (this.routeLineFeature && coords.length >= 2) {
      this.routeLineFeature.getGeometry()?.setCoordinates(coords);
      // Only update style if necessary (optional optimization)
      this.routeLineFeature.setStyle(this.stylerService.setStrokeStyle(this.currentColor));
    }

    // Update Start Pin
    if (this.startPinFeature) {
      this.startPinFeature.getGeometry()?.setCoordinates(coords[0]);
    }

    // Smart View Adjustment (throttled to specific intervals)
    const count = coords.length;
    if ([5, 15, 30].includes(count) || count % 100 === 0) {
      await this.geography.setMapView(track);
    }
  }

  // --- 2. DATA PROCESSING ---
  async accumulatedDistances(track: Track): Promise<Track> {
    const feature = track.features[0];
    const coords = feature.geometry.coordinates;
    const data = feature.geometry.properties.data;
    const num = coords.length;

    if (num < 2) return track;

    // Start from the last processed point (this.filtered)
    for (let i = Math.max(1, this.filtered); i < num; i++) {
      const prev = coords[i - 1];
      const curr = coords[i];
      
      const segmentDist = this.fs.computeDistance(prev[0], prev[1], curr[0], curr[1]);
      data[i].distance = data[i - 1].distance + segmentDist;
      
      if (feature.bbox) {
        this.updateBBox(feature.bbox, curr);
      }
    }

    feature.properties.totalDistance = data[num - 1].distance;
    feature.properties.totalNumber = num;
    return track;
  }

  private updateBBox(bbox: [number, number, number, number], coord: number[]) {
    bbox[0] = Math.min(bbox[0], coord[0]); // Min Lon
    bbox[1] = Math.min(bbox[1], coord[1]); // Min Lat
    bbox[2] = Math.max(bbox[2], coord[0]); // Max Lon
    bbox[3] = Math.max(bbox[3], coord[1]); // Max Lat
  }

  async setWaypointAltitude() {
    const track = this.currentTrack;
    if (!track) return;

    const waypoints: Waypoint[] = track.features[0].waypoints || [];
    const data = track.features[0].geometry.properties.data;

    for (const wp of waypoints) {
      // Logic assumes wp.altitude stores the index of the point in 'data'
      if (typeof wp.altitude === 'number' && data[wp.altitude]) {
        wp.altitude = data[wp.altitude].compAltitude;
      }
    }
  }

  // --- 3. TRACK LIFECYCLE ---
  async foregroundTask(track: Track) {
    if (!track) return undefined;
    
    track = await this.accumulatedDistances(track);
    track = await this.fs.filterSpeedAndAltitude(track, this.filtered);
    
    this.filtered = track.features[0].geometry.coordinates.length - 1;
    
    await this.displayCurrentTrack(track);
    return track;
  }

  async updateTrack(location: Location): Promise<boolean> {
    if (!this.geography.map || !this.geography.currentLayer) return false;

    // --- 1. GLOBAL INITIAL AUTO-CENTER ---
    // This triggers once per session (or until reset) when the first valid point arrives
    if (!this.hasCenteredInitial && location.longitude && location.latitude) {
      this.geography.map.getView().animate({
        center: [location.longitude, location.latitude],
        zoom: 16,
        duration: 1000
      });
      this.hasCenteredInitial = true;
    }

    // --- 2. INITIALIZE NEW TRACK ---
    if (!this.currentTrack) {
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

      const source = this.geography.currentLayer.getSource();
      if (source) {
        source.clear();
        source.addFeatures([routeLine, startPin]);
      }
      return true;
    }

    // --- 3. UPDATE EXISTING TRACK ---
    const track = this.currentTrack;
    const dataArray = track.features[0].geometry.properties.data;
    const lastData = dataArray[dataArray.length - 1];

    // Prevent duplicate timestamps
    if (location.time <= lastData.time) return false;

    // Basic Altitude Smoothing
    const altDiff = Math.abs(location.altitude - lastData.altitude);
    if (location.time - lastData.time < 60000 && altDiff > 50) {
      location.altitude = lastData.altitude + (5 * Math.sign(location.altitude - lastData.altitude));
    }

    location.speed = location.speed * 3.6; // m/s to km/h

    const updatedTrack = await this.location.fillGeojson(track, location);
    
    if (this.location.foreground && updatedTrack) {
      this.currentTrack = await this.foregroundTask(updatedTrack);
    } else {
      this.currentTrack = updatedTrack;
    }
    
    return true;
  }

  // --- 4. RESET LOGIC ---
  // Ensure you update your reset method to include the centering flag if necessary
  private resetTrackingState() {
    this.filtered = 0;
    this.computedDistances = 0;
    this.hasCenteredInitial = false; // Set to false if you want it to re-center on the next new track
    this.routeLineFeature = undefined;
    this.startPinFeature = undefined;
  }

  // --- 4. PARSERS ---
  async parseKmlXml(xmlDoc: Document) {
    const waypoints: Waypoint[] = [];
    const trackPoints: ParsedPoint[] = [];
    const placemarks = Array.from(xmlDoc.getElementsByTagName("Placemark"));

    for (const pm of placemarks) {
      const name = pm.getElementsByTagName("name")[0]?.textContent || "";
      const desc = pm.getElementsByTagName("description")[0]?.textContent || "";

      // Handle Waypoints
      const pointEl = pm.getElementsByTagName("Point")[0];
      if (pointEl) {
        const coordText = pointEl.getElementsByTagName("coordinates")[0]?.textContent?.trim();
        if (coordText) {
          const [lon, lat, ele] = coordText.split(",").map(Number);
          waypoints.push({
            latitude: lat, longitude: lon, altitude: ele || 0,
            name: this.fs.sanitize(name), comment: this.fs.sanitize(desc),
          });
        }
      }

      // Handle LineStrings
      const lineEl = pm.getElementsByTagName("LineString")[0];
      if (lineEl) {
        const coordText = lineEl.getElementsByTagName("coordinates")[0]?.textContent?.trim();
        if (coordText) {
          coordText.split(/\s+/).forEach(str => {
            const [lon, lat, ele] = str.split(",").map(Number);
            if (!isNaN(lon) && !isNaN(lat)) {
              trackPoints.push({ lon, lat, ele: ele || 0, time: 0 });
            }
          });
        }
      }
    }
    return { waypoints, trackPoints };
  }
}