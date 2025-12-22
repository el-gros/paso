
import { Component, NgZone, Inject } from '@angular/core';
import { DecimalPipe, DatePipe, CommonModule } from '@angular/common';
import { CapacitorHttp, PluginListenerHandle, registerPlugin } from "@capacitor/core";
import { Storage } from '@ionic/storage-angular';
import { CUSTOM_ELEMENTS_SCHEMA, ChangeDetectorRef } from '@angular/core';
import { register } from 'swiper/element/bundle';
import Map from 'ol/Map';
import Feature, { FeatureLike } from 'ol/Feature';
import Point from 'ol/geom/Point';
import LineString from 'ol/geom/LineString';
import { ParsedPoint, Location, Track, TrackDefinition, Data, Waypoint } from '../../globald';
import { FunctionsService } from '../services/functions.service';
import { MapService } from '../services/map.service';
import { ServerService } from '../services/server.service';
import { global } from '../../environments/environment';
import { Circle as CircleStyle, Fill, Stroke, Style } from 'ol/style';
import { useGeographic } from 'ol/proj.js';
import { App } from '@capacitor/app';
import { Geometry, MultiLineString, MultiPoint } from 'ol/geom';
import GeoJSON from 'ol/format/GeoJSON';
import { Filesystem, Encoding, Directory } from '@capacitor/filesystem';
import { IonicModule, ModalController, isPlatform } from '@ionic/angular';
import { EditModalComponent } from '../edit-modal/edit-modal.component';
import { SearchModalComponent } from '../search-modal/search-modal.component';
import { lastValueFrom, Subscription } from 'rxjs';
import { LanguageService } from '../services/language.service';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import JSZip from 'jszip';
import { LocationResult, Route } from '../../globald';
import { SpeechRecognition } from '@capacitor-community/speech-recognition';
import { FormsModule } from '@angular/forms';
import { TrackingControlService } from '../services/trackingControl.service';
import { LocationSharingService } from '../services/locationSharing.service';
import { LocationManagerService } from '../services/location-manager.service';
import { AppStateService } from '../services/appState.service';
import { AudioService } from '../services/audio.service';
import { StylerService } from '../services/styler.service';
import { ReferenceService } from '../services/reference.service';
import { GeographyService } from '../services/geography.service';
import { PresentService } from '../services/present.service';
import MyService from '../../plugins/MyServicePlugin';
import { Platform } from '@ionic/angular';
import { PopoverController } from '@ionic/angular';
import { XiaomiPopoverComponent } from '../xiaomi-popover.component';

useGeographic();
register();

@Component({
    standalone: true,
    selector: 'app-tab1',
    templateUrl: 'tab1.page.html',
    styleUrls: ['tab1.page.scss'],
    imports: [
      IonicModule, CommonModule, FormsModule, TranslateModule
    ],
    providers: [DecimalPipe, DatePipe],
    schemas: [CUSTOM_ELEMENTS_SCHEMA]
})

export class Tab1Page {

  altitudeFiltered: number = 0;
  speedFiltered: number = 0;
  computedDistances: number = 0;
  vMin: number = 1;

  styleSearch?: (featureLike: FeatureLike) => Style | Style[] | undefined;

  isRecordPopoverOpen = false;
  isConfirmStopOpen = false;
  isConfirmDeletionOpen = false;
  isSearchGuidePopoverOpen = false;
  isSearchPopoverOpen = false;
  isGuidePopoverOpen = false;
  
  query: string = '';
  query2: string = '';
  query3: string = '';
  
  results: LocationResult[] = [];
  loading: boolean = false;
  
  subscription: Subscription | undefined;

  
  constructor(
    public fs: FunctionsService,
    public mapService: MapService,
    public server: ServerService,
    public storage: Storage,
    @Inject(NgZone) private zone: NgZone,
    private cd: ChangeDetectorRef,
    private modalController: ModalController,
    private languageService: LanguageService,
    private translate: TranslateService,
    private trackingControlService: TrackingControlService,
    private locationSharingService: LocationSharingService,
    public location: LocationManagerService,
    private appState: AppStateService,
    private audio: AudioService,
    private stylerService: StylerService,
    public reference: ReferenceService,
    private geography: GeographyService,
    private present: PresentService,
    private platform: Platform,
    private popoverController: PopoverController
  ) {
      this.appState.onEnterBackground().subscribe(() => {
        this.trackingControlService.stop();
        this.location.foreground = false;
        this.location.toBackground = true;
      });
      this.appState.onEnterForeground().subscribe(async () => {
        this.location.foreground = true;
        this.location.toForeground = true;
        if (this.mapService.customControl?.isControlActive()) {
          this.trackingControlService.start();
        }
        if (this.present.currentTrack) await this.morningTask();
      });
  }


  /* FUNCTIONS

  1. ngOnInit
  2. addFileListener
  3. ionViewDidEnter
  4. startTracking
  5. deleteTrack
  6. stopTracking

  9. setTrackDetails
  10. showValidationAlert
  11. saveFile
  14. show
  15. onDestroy

  18. handleClicks
  19. filterAltitude

  21. handleMapClick
  22. computeDistances
  23. htmValues


  28. computeTrackStats
  29. saveTrack
  30. processUrl
  31. foregroundTask

  36. determineColors
  37. waypoint
  38. setWaypointAltitude
  39. search
  40. guide
  41. addSearchLayer

  43. gettitudes
  44. getAltitudesFromMap

  */

  // 1. ON INIT ////////////////////////////////
  async ngOnInit() {
    await this.platform.ready();
    console.log("🚀 Plataforma lista, iniciando carga...");
    // 1. Instantaneous or very fast tasks
    this.languageService.determineLanguage();
    this.show('alert', 'none');
    this.addFileListener();
    // 2. Critical tasks on data
    try {
      await this.initializeVariables();
      await this.fs.uncheckAll();
    } catch (e) {
      console.error("Error en inicialización de variables", e);
    }
    // 3. Paralell processes (no async) 
    // A. Preparation for Xiaomi
    this.prepareXiaomi().then(() => {
      return MyService.startService();
    }).catch(err => console.error("Error en servicio nativo", err));
    // B. Map and taps on it
    this.mapService.loadMap().then(() => {
      return this.handleClicks();
    }).then(() => {
      return this.location.startPaso();
    }).catch(err => console.error("Error en Mapa/GPS", err));
    // Final
    global.ngOnInitFinished = true;
  }

  // 2. LISTENING FOR OPEN EVENTS
  addFileListener() {
    // Listen for app URL open events (e.g., file tap)
    App.addListener('appUrlOpen', async (data: any) => {
      //this.fs.gotoPage('tab1');
      await this.processUrl(data);
      // iF an archived track has been parsed...
      if (this.reference.archivedTrack) await this.reference.displayArchivedTrack();
    });
  }

  // 3. ION VIEW DID ENTER
  async ionViewDidEnter() {
    while (!global.ngOnInitFinished) {
      await new Promise(resolve => setTimeout(resolve, 50)); // Wait until ngOnInit is done
    }
    if (this.fs.reDraw) await this.mapService.updateColors();
    if (this.fs.buildTrackImage) await this.buildTrackImage()
  }

  // 4. START TRACKING /////////////////////////////////
  async startTracking() {
    // Reset current track and related variables
    this.present.currentTrack = undefined;
    this.geography.currentLayer?.getSource()?.clear();
    this.location.currentPoint = 0;
    // Initialize variables
    this.speedFiltered = 0;
    this.altitudeFiltered = 0;
    this.location.averagedSpeed = 0;
    this.computedDistances = 0;
    // Subscribe to LocationService
    this.subscription = this.location.latestLocation$.subscribe(async loc => {
      if (!loc) return;
      if (this.location.foreground) {
        await this.foregroundTask();
      } 
    });
    // Update state */
    this.location.state = 'tracking';
  }

  // 5. REMOVE TRACK ///////////////////////////////////
  async deleteTrack() {
    // show / hide elements
    this.location.state = 'inactive';
    // Reset current track
    this.audio.status = 'black';
    this.present.currentTrack = undefined;
    this.geography.currentLayer?.getSource()?.clear();
    this.fs.displayToast(this.translate.instant('MAP.CURRENT_TRACK_DELETED'));
  }

  // 6. STOP TRACKING //////////////////////////////////
  async stopTracking(): Promise<void> {
    this.location.state = 'stopped';
    this.show('alert', 'none');
    this.subscription?.unsubscribe();
    // If no current layer yet → nothing to update on the map, just finish cleanly
    if (!this.geography.currentLayer?.getSource() || !this.present.currentTrack || !this.geography.map) return;
    const source = this.geography.currentLayer.getSource();
    if (!source) return;
    const features = source.getFeatures();
    // If we have coordinates, finalize track geometry
    let coordinates = this.present.currentTrack.features?.[0]?.geometry?.coordinates;
    if (!Array.isArray(coordinates) || coordinates.length < 1) {
      this.fs.displayToast(this.translate.instant('MAP.TRACK_EMPTY'));
      return;
    }
    await this.filterAltitude(this.present.currentTrack, coordinates.length - 1);
    await this.setWaypointAltitude();
    coordinates = this.present.currentTrack.features?.[0]?.geometry?.coordinates;
    if (!Array.isArray(coordinates) || coordinates.length < 1) return;
    if (features.length >= 3) {
      features[0].setGeometry(new LineString(coordinates));
      features[0].setStyle(this.stylerService.setStrokeStyle(this.present.currentColor));
      features[1].setGeometry(new Point(coordinates[0]));
      features[1].setStyle(this.stylerService.createPinStyle('green'));
      features[2].setGeometry(new Point(coordinates.at(-1)!));
      features[2].setStyle(this.stylerService.createPinStyle('red'));
    }
    this.geography.setMapView(this.present.currentTrack);
    this.fs.displayToast(this.translate.instant('MAP.TRACK_FINISHED'));
    // Update state
    this.location.state = 'stopped';
  }

  // 9. SET TRACK NAME, TIME, DESCRIPTION, ...
  async setTrackDetails() {
    const modalEdit = {
      name: '',
      place: '',
      description: ''
    };
    const edit: boolean = true;
    // Open the modal for editing
    const modal = await this.modalController.create({
      component: EditModalComponent,
      componentProps: { modalEdit, edit },
      cssClass: ['modal-class','green-class'] ,
      backdropDismiss: true, // Allow dismissal by tapping the backdrop
    });
    await modal.present();
    // Handle the modal's dismissal
    const { data } = await modal.onDidDismiss();
    if (data) {
      let { action, name, place, description } = data;
      if (action === 'ok') {
        // Update collection
        if (!name) name = 'No name'
        this.saveFile(name, place, description)
      }
    }
  }

  // 10. NO NAME TO SAVE ////////////////////////////////////
  async showValidationAlert() {
    const cssClass = 'alert greenishAlert'
    const header = 'Validation Error'
    const message = 'Please enter a name for the track.'
    const buttons = ['OK']
    const inputs: never[] = []
    const action = ''
    await this.fs.showAlert(cssClass, header, message, inputs, buttons, action)
  }

  // 11. SAVE FILE ////////////////////////////////////////
  async saveFile(name: string, place: string, description: string) {
    if (!this.present.currentTrack) return;
    // altitud method
    if (this.fs.selectedAltitude === 'DEM') {
      const coordinates: number[][] = this.present.currentTrack.features[0].geometry.coordinates;
      var altSlopes: any = await this.getAltitudesFromMap(coordinates as [number, number][])
      console.log(altSlopes)
      if (altSlopes.slopes) this.present.currentTrack.features[0].properties.totalElevationGain = altSlopes.slopes.gain;
      if (altSlopes.slopes) this.present.currentTrack.features[0].properties.totalElevationLoss = altSlopes.slopes.loss;
      if (altSlopes.altitudes) this.present.currentTrack.features[0].geometry.properties.data.forEach((item, index) => {
        item.altitude = altSlopes.altitudes[index];
      });
    }
    // build new track definition
    const currentProperties = this.present.currentTrack.features[0].properties;
    currentProperties.name = name;
    currentProperties.place = place;
    currentProperties.description = description;
    currentProperties.date = new Date();
    // Save the current track to storage with date as key
    const dateKey = JSON.stringify(currentProperties.date);
    await this.fs.storeSet(dateKey, this.present.currentTrack);
    await this.fs.storeSet(JSON.stringify(this.present.currentTrack.features[0].properties.date), this.present.currentTrack);
    // Create a new track definition
    const trackDef: TrackDefinition = {
      name,
      date: currentProperties.date,
      place,
      description,
      isChecked: false
    };
    // Add new track definition to the collection and save it
    this.fs.collection.push(trackDef);
    await this.fs.storeSet('collection', this.fs.collection);
    // Toast
    this.fs.displayToast(this.translate.instant('MAP.SAVED'));
    // Update UI elements
    this.location.state = 'saved'
    this.show('alert', 'none');
  }

  // 14. SHOW / HIDE ELEMENTS /////////////////////////////////
  async show(id: string, action: 'block' | 'none' | 'inline' | 'flex') {
    const obj = document.getElementById(id);
    if (obj) {
      obj.style.display = action;
    }
  }

  // 15. ON DESTROY ////////////////////////
  ngOnDestroy(): void {}

  // 18. CREATE MAP ////////////////////////////////////////
  async handleClicks() {
    try {
      if (!this.geography.map) return
      // Type guard ensures map is defined before calling 'on'
      (this.geography.map as Map).on('click', this.handleMapClick.bind(this));
    } catch (error) {
      console.error('Error creating map:', error);
    }
  }

  // 19. FILTER ALTITUDE /////////////////////////////
  async filterAltitude(track: any, final: number) {
    if (!track) return;
    // number of points
    const num = track.features[0].geometry.properties.data.length ?? 0;
    // Skip processing if final index is not the last point, or if points are fewer than lag
    if ((final != num - 1) && (num <= this.fs.lag)) return
    // Get the track data once to simplify access
    const data = track.features[0].geometry.properties.data;
    // Loop through each point to filter altitude
    for (let i = this.altitudeFiltered + 1; i <=final; i++) {
      const start = Math.max(0, i - this.fs.lag);
      const end = Math.min(i + this.fs.lag, num - 1);
      // Calculate the average altitude in the window
      const sum = data.slice(start, end + 1)
        .reduce((acc: any, point: { altitude: any; }) => acc + point.altitude, 0);
      data[i].altitude = sum / (end - start + 1);
      // Calculate elevation gains/losses
      const slope = data[i].altitude - data[i - 1].altitude;
      if (slope > 0) {
        track.features[0].properties.totalElevationGain += slope;
      } else {
        track.features[0].properties.totalElevationLoss -= slope;
      }
      // Update current altitude
      track.features[0].properties.currentAltitude = data[i].altitude;
      // Update the last processed index
      this.altitudeFiltered = i;
    }
  }

  // 21. HANDLE MAP CLICK //////////////////////////////
  async handleMapClick(event: { coordinate: any; pixel: any }) {
    if (this.geography.archivedLayer?.getSource() && !this.reference.archivedTrack) {
      const source = this.geography.archivedLayer?.getSource();
      if (!source || !this.geography.map) return;
      const features = source.getFeatures();
      if (!features || features.length<2) return;
      this.geography.map.forEachFeatureAtPixel(event.pixel, async (feature: any) => {
        if (feature === features[1]) {
          // Retrieve clicked coordinate and find its index
          const clickedCoordinate = feature.getGeometry().getClosestPoint(event.coordinate);
          const multiPointCoordinates = feature.getGeometry().getCoordinates();
          const index = multiPointCoordinates.findIndex((coord: [number, number]) =>
            coord[0] === clickedCoordinate[0] && coord[1] === clickedCoordinate[1]
          );
          // Retrieve the archived track based on the index key
          const multiKey = feature.get('multikey'); // Retrieve stored waypoints
          const key = multiKey[index];
          this.reference.archivedTrack = await this.fs.storeGet(JSON.stringify(key));
          // Display archived track details if it exists
          if (this.reference.archivedTrack) await this.reference.displayArchivedTrack();
        }
      }); }
    else if (this.reference.archivedTrack) {
      let hit: boolean = false;
      const asource = this.geography.archivedLayer?.getSource();
      if (!asource || !this.geography.map) return;
      const afeatures = asource.getFeatures();
      if (!afeatures || afeatures.length<5) return;
      this.geography.map.forEachFeatureAtPixel(event.pixel, feature => {
        const match = [afeatures?.[1], afeatures?.[3]].includes(feature as Feature<Geometry>);
        if (!match) return;
        hit = true;
        const archivedDate = this.reference.archivedTrack?.features?.[0]?.properties?.date;
        const index = this.fs.collection.findIndex(
          (item: TrackDefinition) =>
            item.date instanceof Date &&
            archivedDate instanceof Date &&
            item.date.getTime() === archivedDate.getTime()
        );
        if (index >= 0) {
          this.fs.editTrack(index, '#ffffbb', false).catch(console.error);
        }
      });
      if (!hit && this.geography.map) this.geography.map.forEachFeatureAtPixel(event.pixel, async (feature: any) => {
        if (feature === afeatures[4]) {
          // Retrieve clicked coordinate and find its index
          const clickedCoordinate = feature.getGeometry().getClosestPoint(event.coordinate);
          const multiPointCoordinates = feature.getGeometry().getCoordinates();
          const index = multiPointCoordinates.findIndex((coord: [number, number]) =>
            coord[0] === clickedCoordinate[0] && coord[1] === clickedCoordinate[1]
          );
          if (index !== -1) {
            // Retrieve the waypoint data using the index
            let waypoints: Waypoint[] = feature.get('waypoints'); // Retrieve stored waypoints
            const clickedWaypoint: Waypoint = waypoints[index];
            const response: {action: string, name: string, comment: string} = await this.fs.editWaypoint(clickedWaypoint, true, false)
            if (response.action == 'ok') {
              waypoints[index].name = response.name;
              waypoints[index].comment = response.comment;
              if (this.reference.archivedTrack) {
                this.reference.archivedTrack.features[0].waypoints = waypoints;
                if (this.fs.key) await this.fs.storeSet(this.fs.key,this.reference.archivedTrack)
              }
            }
          }
        };
      });
    }
  }

  // 22. COMPUTE DISTANCES //////////////////////////////////////
  async computeDistances() {
    if (!this.present.currentTrack) return;
    // get coordinates and data arrays
    const coordinates = this.present.currentTrack.features[0].geometry.coordinates;
    const data = this.present.currentTrack.features[0].geometry.properties.data;
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

  // 23. GET VALUES TO SHOW ON THE TABLE ////////////////////////////////////
  async htmlValues() {
    if (!this.present.currentTrack) return;
    // Get the data array
    const data = this.present.currentTrack.features[0].geometry.properties.data;
    // Ensure data exists and has elements
    const num = data.length ?? 0;
    if (num < 1) return;
    // Update HTML values
    this.present.currentTrack.features[0].properties.totalDistance = data[num - 1].distance;
    this.present.currentTrack.features[0].properties.totalTime = this.fs.formatMillisecondsToUTC(data[num - 1].time - data[0].time);
    this.present.currentTrack.features[0].properties.totalNumber = num;
    this.present.currentTrack.features[0].properties.currentSpeed = data[num - 1].compSpeed;
  }

  // 28. COMPUTE TRACK STATS /////////////////////////
  async computeTrackStats(
    trackPoints: ParsedPoint[],
    waypoints: Waypoint[],
    trk: Element
  ) {
    const track: Track = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: {
          name: this.fs.sanitize(trk.getElementsByTagName('name')[0]?.textContent || 'No Name') || 'No Name',
          place: '',
          date: undefined,
          description: this.fs.sanitize(trk.getElementsByTagName('cmt')[0]?.textContent || '') || '',
          totalDistance: 0,
          totalElevationGain: 0,
          totalElevationLoss: 0,
          totalTime: '00:00:00',
          totalNumber: 0,
          currentAltitude: undefined,
          currentSpeed: undefined
        },
        bbox: undefined,
        geometry: {
          type: 'LineString',
          coordinates: [],
          properties: {
            data: [],
          }
        },
        waypoints
      }]
    };
    // Initialize distance and bounding box
    let distance = 0;
    let lonMin = Infinity, latMin = Infinity;
    let lonMax = -Infinity, latMax = -Infinity;
    for (let k = 0; k < trackPoints.length; k++) {
      const { lat, lon, ele, time } = trackPoints[k];
      if (isNaN(lat) || isNaN(lon)) continue;
      // Update bounding box
      lonMin = Math.min(lonMin, lon);
      latMin = Math.min(latMin, lat);
      lonMax = Math.max(lonMax, lon);
      latMax = Math.max(latMax, lat);
      // Add coordinates
      track.features[0].geometry.coordinates.push([lon, lat]);
      const num = track.features[0].geometry.coordinates.length;
      // Distance
      if (k > 0) {
        const prev = trackPoints[k - 1];
        distance += await this.fs.computeDistance(prev.lon, prev.lat, lon, lat);
      }
      // Altitude
      let alt = ele ?? 0;
      if (alt === 0 && num > 1) {
        alt = track.features[0].geometry.properties.data[num - 2].altitude;
      }
      // Time
      const locTime = time || 0;
      // Store point data
      track.features[0].geometry.properties.data.push({
        altitude: alt,
        speed: 0,
        time: locTime,
        compSpeed: 0,
        distance: distance,
      });
      track.features[0].bbox = [lonMin, latMin, lonMax, latMax];
    }
    const num = track.features[0].geometry.properties.data.length ?? 0;
    track.features[0].properties.totalDistance = distance;
    if (num > 1) {
      track.features[0].properties.totalTime = this.fs.formatMillisecondsToUTC(
        track.features[0].geometry.properties.data[num - 1].time -
        track.features[0].geometry.properties.data[0].time
      );
    }
    track.features[0].properties.totalNumber = num;
    // Post-process: filters
    try {
      this.fs.filterSpeed(track.features[0].geometry.properties.data, num - 1);
    } catch {}
    try {
      track.features[0].properties.totalElevationGain = 0;
      track.features[0].properties.totalElevationLoss = 0;
      await this.filterAltitude(track, num - 1);
      this.altitudeFiltered = 0;
    } catch {}
    // Second speed filter
    track.features[0].geometry.properties.data = await this.fs.filterSpeed(
      track.features[0].geometry.properties.data, 1 );
    // Save date
    const date = new Date(track.features[0].geometry.properties.data[num - 1]?.time || Date.now());
    track.features[0].properties.date = date;
    return track;
  }

  // 29. SAVE TRACK INTO COLLECTION
  async saveTrack(track: Track) {
    const dateKey = JSON.stringify(track.features[0].properties.date);
    const existing = await this.fs.storeGet(dateKey);
    if (existing) return;
    await this.fs.storeSet(dateKey, track);
    const trackDef = {
      name: track.features[0].properties.name,
      date: track.features[0].properties.date,
      place: track.features[0].properties.place,
      description: track.features[0].properties.description,
      isChecked: true
    };
    this.fs.collection.push(trackDef);
    await this.fs.storeSet('collection', this.fs.collection);
  }

  // 30. PROCESS FILE AFTER TAPPING ON IT /////////////
  async processUrl(data: any) {
    if (!data.url) {
      this.fs.displayToast(this.translate.instant('MAP.NO_FILE_SELECTED'));
      return;
    }
    try {
      console.log('url', data);
      // Try to extract extension from URL
      let ext = data.url.split('.').pop()?.toLowerCase();
      // Fallback: detect type from content if no extension (common with content:// URIs)
      if (!ext || data.url.startsWith('content://')) {
        try {
          const probe = await Filesystem.readFile({
            path: data.url,
          });
          let sample = '';
          if (typeof probe.data === 'string') {
            // Native: base64 string
            sample = atob(probe.data.substring(0, 100));
          } else if (probe.data instanceof Blob) {
            // Web: Blob
            const text = await probe.data.text(); // read blob as text
            sample = text.substring(0, 100);
          }
          // Decide type from sample
          if (sample.includes('<gpx')) {
            ext = 'gpx';
          } else if (sample.includes('<kml')) {
            ext = 'kml';
          } else if (typeof probe.data === 'string' && probe.data.startsWith('UEsDB')) {
            // Base64 of "PK" → ZIP → KMZ
            ext = 'kmz';
          } else {
            ext = 'unknown';
          }
        } catch (probeErr) {
          console.warn('Could not probe file type:', probeErr);
          this.fs.displayToast(this.translate.instant('MAP.UNSUPPORTED_FILE'));
          return;
        }
      }
      let waypoints: Waypoint[] = [];
      let trackPoints: ParsedPoint[] = [];
      let trk: Element | null = null;
      if (ext === 'gpx') {
        console.log('Processing GPX file');
        const fileContent = await Filesystem.readFile({
          path: data.url,
          encoding: Encoding.UTF8,
        });
        console.log(fileContent);
        ({ waypoints, trackPoints, trk } = await this.mapService.parseGpxXml(fileContent.data as string));
      } else if (ext === 'kmz') {
        console.log('Processing KMZ file');
        const fileContent = await Filesystem.readFile({
          path: data.url,
        });
        console.log(fileContent);
        ({ waypoints, trackPoints, trk } = await this.parseKmz(fileContent.data as string));
      } else {
        this.fs.displayToast(this.translate.instant('MAP.UNSUPPORTED_FILE'));
        return;
      }
      console.log('trk', trk);
      // ✅ Common track handling
      if (!trackPoints.length || !trk) {
        this.fs.displayToast(this.translate.instant('MAP.NO_TRACK'));
        return;
      }
      const track = await this.computeTrackStats(trackPoints, waypoints, trk);
      await this.saveTrack(track);
      this.reference.archivedTrack = track;
      this.fs.displayToast(this.translate.instant('MAP.IMPORTED'));
    } catch (error) {
      console.error('Import failed:', error);
      this.fs.displayToast(this.translate.instant('MAP.NOT_IMPORTED'));
    }
  }

  // 31. FOREGROUND TASK ////////////////////////
  async foregroundTask() {
    const num = this.present.currentTrack?.features[0].geometry.coordinates.length ?? 0;
    // filter altitude
    await this.filterAltitude(this.present.currentTrack, num - this.fs.lag - 1);
    // compute distances
    await this.computeDistances();
    // filter speed
    if (this.present.currentTrack) {
      this.present.currentTrack.features[0].geometry.properties.data = await this.fs.filterSpeed(
        this.present.currentTrack.features[0].geometry.properties.data,
        this.speedFiltered + 1
      );
    }
    this.speedFiltered = num - 1;
    // html values
    await this.htmlValues();
    // display the current track
    await this.present.displayCurrentTrack(this.present.currentTrack);
    // Ensure UI updates are reflected
    this.zone.run(() => {
      this.cd.detectChanges();
    });
    console.log('Foreground',this.present.currentTrack?.features[0].properties.totalNumber || 0, 'points. Process completed')
  }

  // 37. ADD WAYPOINT ////////////////////////////////////
  async waypoint() {
    if (!this.present.currentTrack) return;
    const num: number = this.present.currentTrack.features[0].geometry.coordinates.length;
    const point = this.present.currentTrack.features[0].geometry.coordinates[num - 1];
    // Wrap the reverse geocode in a timeout
    const addressObservable = this.mapService.reverseGeocode(point[1], point[0]);
    const addressPromise = lastValueFrom(addressObservable);
    // Timeout promise (rejects or resolves after 500 ms)
    const timeoutPromise = new Promise(resolve =>
      setTimeout(() => resolve(null), 500)
    );
    // Race both
    const address: any = (await Promise.race([addressPromise, timeoutPromise])) || {
      name: '',
      display_name: '',
      short_name: ''
    };
    const waypoint: Waypoint = {
      longitude: point[0],
      latitude: point[1],
      altitude: num - 1,
      name: address?.short_name ?? address?.name ?? address?.display_name ?? '',
      comment: ''
    };
    const response: { action: string; name: string; comment: string } =
      await this.fs.editWaypoint(waypoint, false, true);
    if (response.action === 'ok') {
      waypoint.name = response.name;
      waypoint.comment = response.comment;
      this.present.currentTrack?.features[0].waypoints?.push(waypoint);
      this.fs.displayToast(this.translate.instant('MAP.WPT_ADDED'));
    }
  }

  // 38. SET WAYPOINT ALTITUDE ////////////////////////////////////////
  async setWaypointAltitude() {
    if (!this.present.currentTrack) return;
    // Retrieve waypoints
    const waypoints: Waypoint[] = this.present.currentTrack.features[0].waypoints || [];
    for (const wp of waypoints) {
      if (wp.altitude != null && wp.altitude >= 0) wp.altitude = this.present.currentTrack.features[0].geometry.properties.data[wp.altitude].altitude
    }
    console.log(this.present.currentTrack)
  }

  async search() {
    if (!this.geography.map || !this.geography.searchLayer) return;
    // Define a style function for the search results
    const styleSearch = (featureLike: FeatureLike) => {
      const geometryType = featureLike.getGeometry()?.getType();
      const blackPin = this.stylerService.createPinStyle('black');
      if (geometryType === 'Point') return blackPin;
      if (geometryType === 'Polygon' || geometryType === 'MultiPolygon') {
        return new Style({
          stroke: new Stroke({ color: 'black', width: 2 }),
          fill: new Fill({ color: 'rgba(128, 128, 128, 0.5)' }),
        });
      }
      return this.stylerService.setStrokeStyle('black');
    };
    this.geography.searchLayer.setStyle(styleSearch);
    this.isSearchPopoverOpen = true;
  }

  // 40. SEARCH ROUTE /////////////////////////////////////////////
  async guide() {
    // Create modal
    const modal = await this.modalController.create({
      component: SearchModalComponent,
      cssClass: ['modal-class','yellow-class'] ,
      backdropDismiss: true, // Allow dismissal by tapping the backdrop
    });
    // Present modal
    await modal.present();
    // Receive data after modal dismiss
    const { data } = await modal.onDidDismiss();
    // Build track
    const date = new Date();
    var trackName = ''
    if (data) {
      trackName = data.respo7nse.trackName;
      console.log('trackName', trackName)
      // Coordinates
      const rawCoordinates = data.response.features[0].geometry.coordinates;
      // Case of no route
      if (!rawCoordinates || rawCoordinates?.length === 0) {
        this.fs.displayToast(this.translate.instant('MAP.NO_ROUTE'));
        return;
      }
      // Compute distances
      const distances: number[] = await this.fs.computeCumulativeDistances(rawCoordinates)
      // Compute times
      const times: number[] = await this.fs.createTimes(data, date, distances);
      // Get altitudes and compute elevation gain and loss
      var altSlopes: any = await this.getAltitudesFromMap(rawCoordinates)
      // compute speed
      const speed = (data.response.features[0].properties.summary.distance / data.response.features[0].properties.summary.duration) * 3.6;
      const rawProperties: Data[] = await this.fs.fillProperties(distances, altSlopes.altitudes, times, speed);
      console.log(rawCoordinates, rawProperties)
      // Increase the number of coordinates
      const result = await this.fs.adjustCoordinatesAndProperties(rawCoordinates, rawProperties, 0.025);
      if (result) {
        var num = result.newCoordinates.length;
        this.reference.archivedTrack = {
          type: 'FeatureCollection',
          features: [{
            type: 'Feature',
            properties: {
              name: trackName,
              place: '',
              date: date,
              description: '',
              totalDistance: data.response.features[0].properties.summary.distance / 1000,
              totalElevationGain: altSlopes.slopes.gain,
              totalElevationLoss: altSlopes.slopes.loss,
              totalTime: this.fs.formatMillisecondsToUTC(data.response.features[0].properties.summary.duration * 1000,),
              totalNumber: num,
              currentAltitude: undefined,
              currentSpeed: undefined
            },
            bbox: data.response.features[0].bbox,
            geometry: {
              type: 'LineString',
              coordinates: result.newCoordinates,
              properties: { data: result.newProperties }
            },
            waypoints: []
          }]
        };
      }
    }
    if (this.reference.archivedTrack) await this.reference.displayArchivedTrack();
  }

  // 42. MORNING TASK
  async morningTask() {
    // Run updates outside of Angular's zone to avoid change detection overhead
    this.zone.runOutsideAngular(async () => {
      try{
        // display current track
        await this.present.displayCurrentTrack(this.present.currentTrack);
        // Filter altitude data
        const num = this.present.currentTrack?.features[0].geometry.coordinates.length ?? 0;
        await this.filterAltitude(this.present.currentTrack, num - this.fs.lag - 1);
        // compute distances
        await this.computeDistances();
        // Filter speed data
        if (this.present.currentTrack) this.present.currentTrack.features[0].geometry.properties.data = await this.fs.filterSpeed(
          this.present.currentTrack.features[0].geometry.properties.data,
          this.speedFiltered + 1
        );
        this.speedFiltered = num - 1;
        // Update HTML values
        await this.htmlValues();
        // Trigger Angular's change detection
        this.cd.detectChanges();
      } catch (error) {
        console.error('Error during foreground transition processing:', error);
      }
    });
  }

  // 43. COMPUTE ALTITUDES
  async getAltitudes(rawCoordinates: [number, number][]): Promise<number[]> {
    const requestBody = {
      locations: rawCoordinates.map(([lon, lat]) => ({
        latitude: lat,
        longitude: lon
      }))
    };
    try {
/*      const response = await CapacitorHttp.post({
        url: 'https://api.open-elevation.com/api/v1/lookup',
        headers: { 'Content-Type': 'application/json' },
        data: requestBody, // no need to JSON.stringify
      }); */
      const response = await fetch('https://api.open-elevation.com/api/v1/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });
      //const result = await response.json();
      console.log(response)
      // Check status
      if (response.status < 200 || response.status >= 300) {
        this.fs.displayToast('Failed to fetch elevation data.');
        return [];
      }
      // Parse response as JSON and extract elevations
      const result = await response.json();
      return result.results.map((result: any) => result.elevation);
    } catch (error) {
      // Handle network or parsing errors gracefully
      this.fs.displayToast('Error retrieving elevation data.');
      return [];
    }
  }

  // 44. GET ALTITUDES FROM MAP /////////////////////////////////
  async getAltitudesFromMap(coordinates: [number, number][] ) {
    try {
      const altitudes = await this.getAltitudes(coordinates)
      const slopes = await this.fs.computeElevationGainAndLoss(altitudes)
      return {altitudes: altitudes, slopes: slopes}
    }
    catch {
      return {altitudes: null, slopes: null}
    }
  }

  async buildTrackImage() {
  try {
    // Give Angular time to finish ngOnInit
    await new Promise(resolve => setTimeout(resolve, 150));
    // Hide current track
    this.geography.currentLayer?.setVisible(false);
    // Optional: adjust zoom/scale if needed
    const scale = 1;
    const mapWrapperElement: HTMLElement | null = document.getElementById('map-wrapper');
    if (mapWrapperElement) {
      mapWrapperElement.style.transform = `scale(${scale})`;
    }
    // Convert map to image
    let success = false;
    if (this.geography.map) {
      success = await this.exportMapToImage(this.geography.map);
    }
    // Restore visibility of current track
    this.geography.currentLayer?.setVisible(true);
    // Handle result
    if (success) {
      this.fs.gotoPage('canvas');
    } else {
      this.fs.buildTrackImage = false;
      await this.fs.displayToast(this.translate.instant('MAP.TOIMAGE_FAILED'));
      this.fs.gotoPage('archive');
    }
  } catch (err) {
    console.error('buildTrackImage failed:', err);
    this.fs.buildTrackImage = false;
    await this.fs.displayToast(this.translate.instant('MAP.TOIMAGE_FAILED'));
    this.fs.gotoPage('archive');
  }
}

  async exportMapToImage(map: Map): Promise<boolean> {
    // Wait for full map render
    const waitForRenderComplete = (map: Map): Promise<void> => {
      return new Promise((resolve) => {
        map.once('rendercomplete', () => {
          // add a slight delay for WebGL/vector layers
          setTimeout(() => resolve(), 300);
        });
        map.renderSync();
      });
    };
    try {
      // Ensure map is sized & rendered correctly
      map.updateSize();
      await waitForRenderComplete(map);
      const width = map.getSize()?.[0] ?? window.innerWidth;
      const height = map.getSize()?.[1] ?? window.innerHeight;
      const mapCanvas = document.createElement('canvas');
      mapCanvas.width = width;
      mapCanvas.height = height;
      const ctx = mapCanvas.getContext('2d');
      if (!ctx) throw new Error('No 2D rendering context');
      // Composite all OL layer canvases
      document.querySelectorAll<HTMLCanvasElement>('.ol-layer canvas').forEach((canvas) => {
        if (canvas.width > 0) {
          const opacity = (canvas.parentNode as HTMLElement)?.style.opacity || '1';
          ctx.globalAlpha = Number(opacity);
          // respect transform from OL
          const transform = canvas.style.transform;
          if (transform && transform.startsWith('matrix')) {
            const matrix = transform.match(/^matrix\(([^)]+)\)$/);
            if (matrix) {
              const values = matrix[1].split(',').map(Number);
              // setTransform expects 6 numbers: a, b, c, d, e, f
              ctx.setTransform(values[0], values[1], values[2], values[3], values[4], values[5]);
            }
          } else {
            ctx.setTransform(1, 0, 0, 1, 0, 0); // reset
          }
          ctx.drawImage(canvas, 0, 0);
        }
      });
      // Reset any transform
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1.0;
      // Export as PNG
      const dataUrl = mapCanvas.toDataURL('image/png');
      const base64Data = dataUrl.split(',')[1];
      await Filesystem.writeFile({
        path: 'map.png',
        data: base64Data,
        directory: Directory.ExternalCache, // Cache is more reliable than External
      });
      return true; // success
    } catch (err) {
      console.error('Failed to export map image:', err);
      return false;
    }
  }

async processKmz(data: any) {
  try {
    // 1. Read binary file
    const fileContent = await Filesystem.readFile({
      path: data.url,
    });
    // 2. Load KMZ (ZIP)
    const zip = await JSZip.loadAsync(fileContent.data, { base64: true });
    // 3. Find KML inside (usually "doc.kml")
    const kmlFile = zip.file(/\.kml$/i)[0];
    if (!kmlFile) {
      this.fs.displayToast(this.translate.instant('MAP.NOT_IMPORTED'));
      return;
    }
    // 4. Parse KML text
    const kmlText = await kmlFile.async("string");
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(kmlText, 'application/xml');
    // 5. Extract waypoints and trackpoints
    const { waypoints, trackPoints, trk } = await this.mapService.parseKmlXml(xmlDoc);
    if (!trackPoints.length || !trk) return;
    // 6. Compute and save track
    const track = await this.computeTrackStats(trackPoints, waypoints, trk);
    await this.saveTrack(track);
    this.reference.archivedTrack = track;
    this.fs.displayToast(this.translate.instant('MAP.IMPORTED'));
  } catch (err) {
    console.error(err);
    this.fs.displayToast(this.translate.instant('MAP.NOT_IMPORTED'));
  }
}

// PARSE KMZ ///////////////////////////////////////
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

  async initializeVariables() {
    // Check map provider
    this.geography.mapProvider = await this.fs.check(this.geography.mapProvider, 'mapProvider');
    // retrieve collection
    this.fs.collection = await this.fs.storeGet('collection') || [];
    // Determine colors
    this.reference.archivedColor = await this.fs.check(this.reference.archivedColor, 'archivedColor');
    this.present.currentColor = await this.fs.check(this.present.currentColor, 'currentColor');
    // Aert
    this.audio.alert = await this.fs.check(this.audio.alert,'alert')
    // Audio alert
    this.audio.audioAlert = await this.fs.check(this.audio.audioAlert,'audioAlert')
    // Altitude method
    this.fs.selectedAltitude = await this.fs.check(this.fs.selectedAltitude, 'altitude');
    // Geocoding Service
    this.fs.geocoding = await this.fs.check(this.fs.geocoding, 'geocoding');
  }

  closeAllPopovers() {
    this.isConfirmStopOpen = false;
    this.isConfirmDeletionOpen = false;
    this.isRecordPopoverOpen = false;
    this.isSearchPopoverOpen = false;
    //this.isSharingPopoverOpen = false;
  }

  async selectResult(location: LocationResult | null) {
    if (location?.boundingbox && location?.geojson) {
      this. isSearchPopoverOpen = false;
      const [minLat, maxLat, minLon, maxLon] = location.boundingbox.map(Number);
      const latRange = maxLat - minLat;
      const lonRange = maxLon - minLon;
      const padding = Math.max(Math.max(latRange, lonRange) * 0.1, 0.005);
      const extent = [minLon - padding, minLat - padding, maxLon + padding, maxLat + padding];
      const geojson = typeof location.geojson === 'string'
        ? JSON.parse(location.geojson)
        : location.geojson;
      // readFeatures assumes geographic coordinates since useGeographic() is active
      const features = new GeoJSON().readFeatures(geojson);
      if (features.length > 0) {
        const source = this.geography.searchLayer?.getSource();
        source?.clear();
        source?.addFeatures(features);
        this.geography.map?.getView().fit(extent, { duration: 800 }); // small animation
      }
    }
  }

  async openList() {
    if (!this.query) return;

    this.loading = true;

    try {
      const url = `https://api.maptiler.com/geocoding/${encodeURIComponent(this.query)}.json?key=${global.mapTilerKey}`;

      const response = await CapacitorHttp.get({
        url,
        headers: { 'Accept': 'application/json' }
      });

      // Normalize MapTiler results
      const features = response.data?.features ?? [];

      this.results = features.map((f: any, idx: number) => {
        const [lon, lat] = f.geometry.coordinates;

        // compute bbox from geometry when available
        const coords = f.geometry.type === 'Point'
          ? [[lon, lat]]
          : f.geometry.coordinates
              .flat(Infinity)
              .reduce((acc: any[], v: any, i: number) => {
                if (i % 2 === 0) acc.push([v]);
                else acc[acc.length - 1].push(v);
                return acc;
              }, []);

        const lons = coords.map((c: any) => c[0]);
        const lats = coords.map((c: any) => c[1]);

        const boundingbox = [
          Math.min(...lats), // south
          Math.max(...lats), // north
          Math.min(...lons), // west
          Math.max(...lons)  // east
        ];

        return {
          lat,
          lon,
          name: f.text ?? '(no name)',
          display_name: f.place_name ?? f.text ?? '(no name)',
          short_name: f.text ?? f.place_name ?? '(no name)',
          type: f.place_type?.[0] ?? 'unknown',
          place_id: f.id ?? idx,
          boundingbox,
          geojson: f.geometry
        };
      });

    } catch (error) {
      console.error('Error fetching MapTiler geocoding data:', error);
      this.fs.displayToast(this.translate.instant('SEARCH.NETWORK_ERROR'));
      this.results = [];
    } finally {
      this.loading = false;
    }
  }

  async startDictation() {
    const available = await SpeechRecognition.available();
    if (!available.available) {
      console.log('❌ Speech recognition not available');
      return;
    }
    const permission = await SpeechRecognition.checkPermissions();
    if (permission.speechRecognition !== 'granted') {
      await SpeechRecognition.requestPermissions();
    }
    let lang = this.languageService.getCurrentLangValue();
    if (lang == 'ca') lang = 'ca-ES'
    else if (lang == 'es') lang = 'es-ES'
    else if (lang == 'en') lang = 'en-EN' 
    await SpeechRecognition.start({
      language: lang,
      partialResults: true,
      popup: false,
    });

    SpeechRecognition.addListener('partialResults', (data: { matches: string[] }) => {
      this.zone.run(() => {
        this.query = data.matches[0] || '';
      });
      console.log('🎤 Heard:', data.matches[0]);
    });

    SpeechRecognition.addListener('listeningState', (data: { status: 'started' | 'stopped' }) => {
      console.log('🎧 Listening state:', data.status);
    });
  }

  private shortenName(fullName: string): string {
    if (!fullName) return '(no name)';
    const parts = fullName.split(',').map(p => p.trim());
    return parts.slice(0, 2).join(', ');
  }

  ngAfterViewInit() {
    this.initializeEvents();
  }

  initializeEvents() {
    const interval = setInterval(() => {
      const map = this.geography.map;
      const customControl = this.mapService.customControl;
      const shareControl = this.mapService.shareControl;

      if (customControl && shareControl && map) {

        // ---------------------------
        // CURRENT LOCATION EVENTS
        // ---------------------------
        customControl.onActivate(() => {
          console.log("CustomControl ACTIVATED");
          this.onCurrentLocationActivate();
        });

        customControl.onDeactivate(() => {
          console.log("CustomControl DEACTIVATED");
          this.onCurrentLocationDeactivate();
        });

        // ---------------------------
        // SHARE CONTROL EVENTS
        // ---------------------------
        shareControl.onShareStart = () => {
          console.log("ShareControl START event received in TAB1");
          this.onShareStartFromControl();
        };

        shareControl.onShareStop = () => {
          console.log("ShareControl STOP event received in TAB1");
          this.onShareStopFromControl();
        };

        clearInterval(interval);

        // Ensure tracking starts when map is ready
        this.trackingControlService.start();
      }
    }, 200);
  }

  onCurrentLocationActivate() {
    console.log('current location activate')
    this.trackingControlService.start();
  }

  onCurrentLocationDeactivate() {
    console.log('current location deactivate')
    this.trackingControlService.stop();  
  }

  private onShareStartFromControl() {
    console.log("🔥 starting sharing");
    this.locationSharingService.startSharing();  
  }

  private onShareStopFromControl() {
    console.log("🟥 stopping sharing");
    this.locationSharingService.stopSharing();
  }

  async onDestroy()  {
    //await this.location.stopBackgroundTracking();
    MyService.stopService();
  }

  async prepareXiaomi(evento?: any) {
    const { value: esXiaomi } = await MyService.isXiaomi();
    
    if (esXiaomi) {
      const yaAvisado = localStorage.getItem('xiaomi_configurado');
      if (yaAvisado) return;

      const popover = await this.popoverController.create({
        component: XiaomiPopoverComponent,
        event: evento, // Opcional: apunta al botón que disparó la acción
        translucent: true,
        backdropDismiss: true
      });

      await popover.present();

      const { data } = await popover.onDidDismiss();
      
      if (data === true) {
        await MyService.openAutostartSettings();
        localStorage.setItem('xiaomi_configurado', 'true');
      }
    }
  }

}




