
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
import { Geometry, MultiLineString, MultiPoint } from 'ol/geom';
import GeoJSON from 'ol/format/GeoJSON';
import { Filesystem, Encoding, Directory } from '@capacitor/filesystem';
import { IonicModule, ModalController, isPlatform } from '@ionic/angular';
import { EditModalComponent } from '../edit-modal/edit-modal.component';
import { SearchModalComponent } from '../search-modal/search-modal.component';
import { lastValueFrom, Subscription } from 'rxjs';
import { LanguageService } from '../services/language.service';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { LocationResult, Route } from '../../globald';
import { SpeechRecognition } from '@capacitor-community/speech-recognition';
import { FormsModule } from '@angular/forms';
import { TrackingControlService } from '../services/trackingControl.service';
import { LocationSharingService } from '../services/locationSharing.service';
import { LocationManagerService } from '../services/location-manager.service';
import { AudioService } from '../services/audio.service';
import { StylerService } from '../services/styler.service';
import { ReferenceService } from '../services/reference.service';
import { GeographyService } from '../services/geography.service';
import { PresentService } from '../services/present.service';
import MyService from '../../plugins/MyServicePlugin';
import { Platform } from '@ionic/angular';
import { PopoverController } from '@ionic/angular';
import { BatteryPopoverComponent } from '../battery-popover.component';
import { Device } from '@capacitor/device';
import { Geolocation } from '@capacitor/geolocation';

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

  speedFiltered: number = 0;
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
  //private appStateSubscription: Subscription = new Subscription();
  
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
    private audio: AudioService,
    private stylerService: StylerService,
    public reference: ReferenceService,
    private geography: GeographyService,
    private present: PresentService,
    private platform: Platform,
    private popoverController: PopoverController
  ) {}

  /* FUNCTIONS

  1. ngOnInit
  2. ionViewDidEnter
  3. startTracking
  4. removeTrack
  5. stopTracking
  6. setTrackDetails
  
  10. showValidationAlert
  11. saveFile
  14. show
  15. onDestroy

  18. handleClicks

  21. handleMapClick

  23. htmValues


  29. saveTrack

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

    // 1. Tareas rápidas de interfaz y configuración
    this.languageService.determineLanguage();
    this.show('alert', 'none'); 

    // 2. Inicialización de datos críticos
    await this.initializeVariables();
    await this.fs.uncheckAll();

    // 3. 🛡️ CONTROL DE PERMISOS (Punto de control obligatorio)
    const hasPermission = await this.checkGpsPermissions(); 

    if (hasPermission) {
      console.log("✅ Permisos concedidos. Configurando servicios...");
      
      try {
        // Lanzamos primero el plugin nativo (el "Cerebro")
        // Esto evita el crash de Android 15 al asegurar que hay permisos activos
        await MyService.startService(); 
        console.log("🧠 Servicio nativo (Cerebro) arrancado.");
        await MyService.setReferenceTrack({ coordinates: [] });

        // 4. Configuración del Mapa (ahora que tenemos GPS permitido)
        await this.mapService.loadMap();
        this.mapService.mapIsReady = true;

        if (this.mapService.hasPendingDisplay && this.reference.archivedTrack) {
          await this.reference.displayArchivedTrack();
          this.mapService.hasPendingDisplay = false;
        }

        // 5. Lanzar procesos en segundo plano y tracking de Ionic
        await this.checkBatteryOptimizations(); // Ajustes de Xiaomi
        await this.handleClicks();
        await this.location.startPaso();     // Iniciar tracking de Capacitor
        
      } catch (error) {
        console.error("❌ Error en la cadena de inicio:", error);
      }

    } else {
      // Caso: El usuario no dio permisos
      console.error("❌ Permisos denegados. Modo visor activado.");
      await this.mapService.loadMap();
      this.show('alert', 'block'); // Mostramos el div de alerta (pero con 'block')
    }

    // Finalización
    global.ngOnInitFinished = true;
    this.cd.detectChanges();
  }

  // 2. ION VIEW DID ENTER
  async ionViewDidEnter() {
    while (!global.ngOnInitFinished) {
      await new Promise(resolve => setTimeout(resolve, 50)); // Wait until ngOnInit is done
    }
    if (this.fs.reDraw) await this.mapService.updateColors();
    if (this.fs.buildTrackImage) await this.buildTrackImage()
  }

  async startTracking() {
    // 1. Guard: If already tracking, don't start again
    if (this.location.state === 'tracking') return;
    // 2. Clean up old subscriptions (Crucial to prevent memory leaks)
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
    // 3. Reset Live Data
    this.present.currentTrack = undefined;
    this.location.currentPoint = 0;
    this.speedFiltered = 0;
    this.present.altitudeFiltered = -1;
    this.location.averagedSpeed = 0;
    this.present.computedDistances = 0;
    // 4. Clear Map Visuals immediately
    if (this.geography.currentLayer) {
      this.geography.currentLayer.getSource()?.clear();
    }
    // 5. Update UI values to zero/empty instantly
    await this.present.htmlValues();
    // 6. Subscribe to Location Updates
    this.subscription = this.location.latestLocation$.subscribe(async (loc) => {
      if (!loc) return;
      // Only run expensive tasks if in foreground
      if (this.location.foreground) {
        try {
          await this.foregroundTask();
        } catch (err) {
          console.error("Foreground task failed:", err);
        }
      } 
    });
    // 7. Finalize State
    this.location.state = 'tracking';
    await this.location.sendReferenceToPlugin()
  }

  // 4. REMOVE TRACK ///////////////////////////////////
  async deleteTrack() {
    // show / hide elements
    this.location.state = 'inactive';
    // Reset current track
    this.audio.status = 'black';
    this.present.currentTrack = undefined;
    this.geography.currentLayer?.getSource()?.clear();
    this.fs.displayToast(this.translate.instant('MAP.CURRENT_TRACK_DELETED'));
  }

  // 5. STOP TRACKING //////////////////////////////////
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
    const final = await this.present.filterAltitude(this.present.currentTrack, this.present.altitudeFiltered + 1, coordinates.length - 1);
    if (final) this.present.altitudeFiltered = final
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
    await this.location.sendReferenceToPlugin()
  }

  // 6. SET TRACK NAME, TIME, DESCRIPTION, ...
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
    const track = this.present.currentTrack;
    if (!track?.features?.[0]) return;
    // 1. Altitude Processing (DEM)
    if (this.fs.selectedAltitude === 'DEM') {
      const coordinates = track.features[0].geometry.coordinates;
      try {
        const altSlopes = await this.getAltitudesFromMap(coordinates as [number, number][]);
        if (altSlopes) {
          const props = track.features[0].properties;
          if (altSlopes.slopes) {
            props.totalElevationGain = altSlopes.slopes.gain;
            props.totalElevationLoss = altSlopes.slopes.loss;
          }
          if (altSlopes.altitudes && track.features[0].geometry.properties?.data) {
            track.features[0].geometry.properties.data.forEach((item: any, index: number) => {
              item.altitude = altSlopes.altitudes[index];
            });
          }
        }
      } catch (error) {
        console.error("Elevation gain calculation failed", error);
      }
    }
    // 2. Update Properties
    const trackProperties = track.features[0].properties;
    const saveDate = new Date();
    trackProperties.name = name;
    trackProperties.place = place;
    trackProperties.description = description;
    trackProperties.date = saveDate;
    // 3. Storage Logic
    // Use ISO string as key: it's readable and unique
    const dateKey = JSON.stringify(trackProperties.date);
    try {
      // Save the full GeoJSON track once
      await this.fs.storeSet(dateKey, track);
      // 4. Update Collection (The "Index" of all tracks)
      const trackDef: TrackDefinition = {
        name,
        date: saveDate,
        place,
        description,
        isChecked: false
      };
      this.fs.collection.push(trackDef);
      await this.fs.storeSet('collection', this.fs.collection);
      // 5. UI Feedback
      this.fs.displayToast(this.translate.instant('MAP.SAVED'));
      this.location.state = 'saved';
      this.show('alert', 'none');
    } catch (e) {
      console.error("Failed to save to storage", e);
      this.fs.displayToast("Error saving track");
    }
  }

  // 14. SHOW / HIDE ELEMENTS /////////////////////////////////
  async show(id: string, action: 'block' | 'none' | 'inline' | 'flex') {
    const obj = document.getElementById(id);
    if (obj) {
      obj.style.display = action;
    }
  }

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

  // 31. FOREGROUND TASK ////////////////////////
  async foregroundTask() {
    const num = this.present.currentTrack?.features[0].geometry.coordinates.length ?? 0;
    // filter altitude
    const final = await this.present.filterAltitude(this.present.currentTrack, this.present.altitudeFiltered + 1, num - this.fs.lag - 1);
    if (final) this.present.altitudeFiltered = final
    // compute distances
    await this.present.accumulatedDistances();
    // filter speed
    if (this.present.currentTrack) {
      this.present.currentTrack.features[0].geometry.properties.data = await this.fs.filterSpeed(
        this.present.currentTrack.features[0].geometry.properties.data,
        this.speedFiltered + 1
      );
    }
    this.speedFiltered = num - 1;
    // html values
    await this.present.htmlValues();
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

  // 43. COMPUTE ALTITUDES
  async getAltitudes(rawCoordinates: [number, number][]): Promise<number[]> {
    const requestBody = {
      locations: rawCoordinates.map(([lon, lat]) => ({
        latitude: lat,
        longitude: lon
      }))
    };
    try {
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
    //this.audio.audioAlert = await this.fs.check(this.audio.audioAlert,'audioAlert')
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
/*    if (this.appStateSubscription) {
      this.appStateSubscription.unsubscribe();
    } */
  }

async checkBatteryOptimizations(evento?: any) {
  try {
    const info = await Device.getInfo();
    const brand = info.manufacturer.toLowerCase();
    
    // 1. Check if we have already warned the user
    const hasBeenWarned = localStorage.getItem('battery_warning_dismissed');
    if (hasBeenWarned) return;

    // 2. Identify aggressive brands
    const aggressiveBrands = ['xiaomi', 'samsung', 'huawei', 'oneplus', 'oppo', 'vivo', 'realme'];
    
    if (aggressiveBrands.includes(brand)) {
      const popover = await this.popoverController.create({
        component: BatteryPopoverComponent,
        componentProps: { brand: brand },
        event: evento,
        translucent: true,
        backdropDismiss: false 
      });

      await popover.present();

      const { data } = await popover.onDidDismiss();
      
      if (data?.action === 'settings') {
        try {
          // Action Branching
          if (data?.action === 'settings') {
            if (brand === 'xiaomi') {
              await MyService.openAutostartSettings();
              localStorage.setItem('battery_warning_dismissed', 'true');
            } else {
              // For other brands, since we can't open settings, 
              // we just inform them and save the dismissal.
              console.log('Manual configuration required for:', brand);
              localStorage.setItem('battery_warning_dismissed', 'true');
            }
          }

          // Optional: Mark as warned so they aren't nagged every time they open the app
          localStorage.setItem('battery_warning_dismissed', 'true');
          
        } catch (err) {
          console.error('Action failed. MyService might be missing native implementation.', err);
        }
      }
    }
  } catch (error) {
    console.error('Error checking device info:', error);
  }
}

async checkGpsPermissions(): Promise<boolean> {
  try {
    // 1. Ver el estado actual de los permisos
    let check = await Geolocation.checkPermissions();
    console.log("Estado inicial de permisos:", check.location);

    // 2. Si no están concedidos, los pedimos explícitamente
    if (check.location !== 'granted') {
      console.log("Solicitando permisos al usuario...");
      const request = await Geolocation.requestPermissions();
      
      if (request.location !== 'granted') {
        console.warn("El usuario denegó los permisos de ubicación.");
        return false;
      }
    }

    // 3. Verificación extra para Android 10+ (Background Location)
    // Nota: Para Foreground Service basta con 'location', 
    // pero 'coarse' debe ser 'fine' para alta precisión.
    if (check.location === 'granted') {
        return true;
    }

    return false;
  } catch (error) {
    console.error("Error chequeando permisos:", error);
    return false;
  }
}

}

