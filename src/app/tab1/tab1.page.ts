import { Component, NgZone, Inject, inject } from '@angular/core';
import { DecimalPipe, DatePipe, CommonModule } from '@angular/common';
import { CapacitorHttp, PluginListenerHandle, registerPlugin } from "@capacitor/core";
import { Storage } from '@ionic/storage-angular';
import {  ChangeDetectorRef } from '@angular/core';
import { register } from 'swiper/element/bundle';
import Map from 'ol/Map';
import Feature, { FeatureLike } from 'ol/Feature';
import Point from 'ol/geom/Point';
import { ParsedPoint, Location, Track, TrackDefinition, Data, Waypoint } from '../../globald';
import { FunctionsService } from '../services/functions.service';
import { MapService } from '../services/map.service';
import { ServerService } from '../services/server.service';
import { Circle as CircleStyle, Fill, Stroke, Style } from 'ol/style';
import { useGeographic } from 'ol/proj.js';
import GeoJSON from 'ol/format/GeoJSON';
import { Filesystem, Encoding, Directory } from '@capacitor/filesystem';
import { IonicModule, ModalController, isPlatform } from '@ionic/angular';
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
import { StylerService } from '../services/styler.service';
import { ReferenceService } from '../services/reference.service';
import { GeographyService } from '../services/geography.service';
import { PresentService } from '../services/present.service';
import MyService from '../../plugins/MyServicePlugin';
import { Platform } from '@ionic/angular';
import { PopoverController } from '@ionic/angular';
import { BatteryPopoverComponent } from '../battery-popover.component';
import { RecordPopoverComponent } from '../record-popover.component';
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
      IonicModule, CommonModule, FormsModule, TranslateModule, RecordPopoverComponent
    ],
    providers: [DecimalPipe, DatePipe],
})

export class Tab1Page {

  vMin: number = 1;

  styleSearch?: (featureLike: FeatureLike) => Style | Style[] | undefined;

  isSearchGuidePopoverOpen = false;
  isSearchPopoverOpen = false;
  isGuidePopoverOpen = false;
  
  query: string = '';
  query2: string = '';
  query3: string = '';
  
  results: LocationResult[] = [];
  loading: boolean = false;
  
  subscription: Subscription | undefined;
  ngOnInitFinished: boolean = false;

  // Deja el constructor vacío temporalmente

  constructor(
    public fs: FunctionsService,
    public mapService: MapService,
    public server: ServerService,
    public storage: Storage,
    private zone: NgZone,
    private cd: ChangeDetectorRef,
    private modalController: ModalController,
    private languageService: LanguageService,
    private translate: TranslateService,
    private trackingControlService: TrackingControlService,
    private locationSharingService: LocationSharingService,
    public location: LocationManagerService,
    private stylerService: StylerService,
    public reference: ReferenceService,
    public geography: GeographyService,
    public present: PresentService, 
    private platform: Platform,
    private popoverController: PopoverController,
    private styler: StylerService,
  ) {}

  /* FUNCTIONS

  1. ngOnInit
  2. ionViewDidEnter
  3. checkBatteryOptimizations

  10. handleClicks
  11. handleMapClicks

  14. show
  15. onDestroy

  21. handleMapClick

  29. saveTrack

  36. determineColors

  38. setWaypointAltitude
  39. search
  40. guide
  41. addSearchLayer

  43. getAltitudes
  44. getAltitudesFromMap

  */

  // 1. ON INIT ////////////////////////////////
  async ngOnInit() {
    await this.platform.ready();
    console.log("🚀 Plataforma lista, iniciando carga...");
    // 1. Tareas rápidas de interfaz y configuración
    this.languageService.determineLanguage();
    //this.show('alert', 'none'); 
    // 2. Inicialización de datos críticos
    await this.initializeVariables();
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
        // 4b. Check whether it has to display a reference map 
        if (this.mapService.hasPendingDisplay && this.reference.archivedTrack) {
          this.reference.displayArchivedTrack();
          await this.geography.setMapView(this.reference.archivedTrack);
          this.mapService.hasPendingDisplay = false;
        }
        // 5. Lanzar procesos en segundo plano y tracking de Ionic
        await this.checkBatteryOptimizations(); // Ajustes de Xiaomi
        await this.handleClicks();
        await this.startPaso();     // Iniciar tracking de Capacitor
      } catch (error) {
        console.error("❌ Error en la cadena de inicio:", error);
      }
    } else {
      // Caso: El usuario no dio permisos
      console.error("❌ Permisos denegados. Modo visor activado.");
      await this.mapService.loadMap();
      //this.show('alert', 'block'); // Mostramos el div de alerta (pero con 'block')
    }
    // Finalización
    this.ngOnInitFinished = true;
    this.cd.detectChanges();
  }

  // 2. ION VIEW DID ENTER
  async ionViewDidEnter() {
    // Check that ngOninit has been completed
    const timeout = Date.now() + 5000; // 5 segundos máximo
    while (!this.ngOnInitFinished && Date.now() < timeout) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    // If track colors have been changed in the settings page
    if (this.fs.reDraw) await this.mapService.updateColors();
    // If a track image is being built
    if (this.fs.buildTrackImage) await this.buildTrackImage()
  }

  // 3. CHECK BATTERY OPTIMIZATIONS /////////////////////////////////
  async checkBatteryOptimizations(evento?: any) {
    try {
      // 1. Verificación REAL del estado del sistema (Nativo)
      const { value: isAlreadyIgnored } = await MyService.isIgnoringBatteryOptimizations();
      if (isAlreadyIgnored) {
        console.log("🚀 El usuario ya concedió permisos 'Sin Restricciones'.");
        return; // Salimos, no hace falta hacer nada más.
      }
      // 2. Si no tiene permiso, verificamos si ya ignoró el aviso anteriormente
      // Esto evita ser demasiado intrusivo en cada inicio.
      const hasBeenWarned = localStorage.getItem('battery_warning_dismissed');
      if (hasBeenWarned) return;
      // 3. Obtener info del dispositivo
      const info = await Device.getInfo();
      const brand = info.manufacturer.toLowerCase();
      const aggressiveBrands = ['xiaomi', 'samsung', 'huawei', 'oneplus', 'oppo', 'vivo', 'realme'];
      // 4. Si es una marca agresiva Y no tiene permiso, mostramos el Popover
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
            // Lógica según marca usando tus nuevos métodos nativos
            if (brand === 'xiaomi') {
              await MyService.openAutostartSettings();
              // También abrimos la optimización estándar para Xiaomi
              await MyService.openBatteryOptimization(); 
            } else {
              // Generalizado para Samsung, Huawei, etc.
              await MyService.openBatteryOptimization();
            }
            // Marcamos como avisado para que no salga más
            localStorage.setItem('battery_warning_dismissed', 'true');
          } catch (err) {
            console.error('Error al abrir ajustes nativos:', err);
          }
        }
      }
    } catch (error) {
      console.error('Error general en checkBatteryOptimizations:', error);
    }
  }

  // 10. HANDLE CLICKS ////////////////////////////////////////
  async handleClicks() {
    try {
      if (!this.geography.map) return;
      // Remove existing listener first to prevent duplicates
      this.geography.map.un('click', this.handleMapClick.bind(this));
      // Register the listener
      this.geography.map.on('click', (ev: any) => this.handleMapClick(ev));
    } catch (error) {
      console.error('Error attaching map click listener:', error);
    }
  }

  // 11. HANDLE MAP CLICK //////////////////////////////
  async handleMapClick(event: { coordinate: any; pixel: any }) {
    if (!this.geography.map || !this.geography.archivedLayer) return;
    // 1. Buscamos la feature de forma síncrona primero
    let selectedFeature: any = null;
    this.geography.map.forEachFeatureAtPixel(event.pixel, (feature: any) => {
      if (!selectedFeature) {
        const type = feature.get('type');
        if (type) {
          selectedFeature = feature; // Capturamos la primera que tenga tipo
          return true; // Detiene el bucle de OpenLayers
        }
      }
      return false;
    }, { hitTolerance: 5 });
    if (!selectedFeature) return;
    // 2. Ejecutamos la lógica asíncrona fuera del bucle
    const type = selectedFeature.get('type');
    // --- CASO 1: CARGAR TRACK ---
    if (type === 'archived_points' && !this.reference.archivedTrack) {
      const clickedCoordinate = selectedFeature.getGeometry().getClosestPoint(event.coordinate);
      const coords = selectedFeature.getGeometry().getCoordinates();
      const index = this.findClosestIndex(coords, clickedCoordinate);
      if (index !== -1) {
        const multiKey = selectedFeature.get('multikey');
        this.fs.key = JSON.stringify(multiKey[index]);
        this.reference.archivedTrack = await this.fs.storeGet(this.fs.key);
        if (this.reference.archivedTrack) {
          this.reference.displayArchivedTrack();
          await this.geography.setMapView(this.reference.archivedTrack);
        }
      }
    }
    // --- CASO 2: EDITAR TRACK O WAYPOINTS ---
    else if (this.reference.archivedTrack) {
      // A) Detalles del Track (Línea o Extremos)
      const trackElements = ['archived_line', 'archived_start', 'archived_end'];
      if (trackElements.includes(type)) {
        const archivedDate = this.reference.archivedTrack?.features?.[0]?.properties?.date;
        const index = this.fs.collection.findIndex((item: TrackDefinition) => {
          if (!item.date || !archivedDate) return false;
          return new Date(item.date).getTime() === new Date(archivedDate).getTime();
        });
        if (index >= 0) {
          // Llamada centrada (sin pasar el evento)
          await this.reference.editTrack(index);
        }
      }
      // B) Waypoints
      else if (type === 'archived_waypoints') {
        const clickedCoordinate = selectedFeature.getGeometry().getClosestPoint(event.coordinate);
        const coords = selectedFeature.getGeometry().getCoordinates();
        const index = this.findClosestIndex(coords, clickedCoordinate);
        if (index !== -1) {
          let waypoints: Waypoint[] = selectedFeature.get('waypoints');
          const response = await this.fs.editWaypoint(waypoints[index], true, false);
          if (response.action === 'ok') {
            waypoints[index].name = response.name;
            waypoints[index].comment = response.comment;
            this.reference.archivedTrack.features[0].waypoints = waypoints;
            if (this.fs.key) {
              await this.fs.storeSet(this.fs.key, this.reference.archivedTrack);
              this.fs.displayToast(this.translate.instant('MAP.WAYPOINT_UPDATED'));
            }
          }
        }
      }
    }
  }

  private findClosestIndex(coords: any[], target: any): number {
    const eps = 0.000001;
    return coords.findIndex(c => Math.abs(c[0] - target[0]) < eps && Math.abs(c[1] - target[1]) < eps);
  }



/*  async search() {
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
  } */

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
    if (this.reference.archivedTrack) {
      await this.reference.displayArchivedTrack();
      await this.geography.setMapView(this.reference.archivedTrack);
    }
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
    this.fs.alert = await this.fs.check(this.fs.alert,'alert')
    // Altitude method
    this.fs.selectedAltitude = await this.fs.check(this.fs.selectedAltitude, 'altitude');
    // Geocoding Service
    this.fs.geocoding = await this.fs.check(this.fs.geocoding, 'geocoding');
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
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(this.query)}&format=json&polygon_geojson=1&addressdetails=1&limit=5`;

      const response = await CapacitorHttp.get({
        url,
        headers: { 
          'Accept': 'application/json',
          'User-Agent': 'MyMappingApp/1.0' // Nominatim requires a User-Agent
        }
      });

      // 1. Ensure we are dealing with an object/array
      let data = response.data;
      if (typeof data === 'string') {
        data = JSON.parse(data);
      }

      // 2. Check if data is actually an array before calling .map()
      if (!Array.isArray(data)) {
        console.error('Nominatim returned non-array data:', data);
        this.results = [];
        return;
      }

      this.results = data.map((item: any) => {
        // Nominatim's boundingbox is [latMin, latMax, lonMin, lonMax]
        const bbox = item.boundingbox ? item.boundingbox.map(Number) : [];

        return {
          lat: Number(item.lat),
          lon: Number(item.lon),
          name: item.display_name.split(',')[0],
          display_name: item.display_name,
          type: item.type,
          place_id: item.place_id,
          boundingbox: bbox,
          geojson: item.geojson 
        };
      });

    } catch (error) {
      console.error('Nominatim Error:', error);
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
    MyService.stopService();
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

 // 14. SHOW / HIDE ELEMENTS /////////////////////////////////
  async show(id: string, action: 'block' | 'none' | 'inline' | 'flex') {
    const obj = document.getElementById(id);
    if (obj) {
      obj.style.display = action;
    }
  } 

  async handleLocationSelection(location: LocationResult | null) {
    if (!location?.boundingbox || !location?.geojson) return;
    this.isSearchPopoverOpen = false;

    const layer = this.geography.searchLayer;
    const source = layer?.getSource();
    if (!layer || !source) return;

    source.clear();
    layer.setZIndex(1000);

    const geojson = typeof location.geojson === 'string' ? JSON.parse(location.geojson) : location.geojson;
    
    // readFeatures handles Point, Polygon, or MultiPolygon automatically
    const features = new GeoJSON().readFeatures(geojson);

    // LOGIC: If the API gave us a Polygon, we ALSO want a Pin at the center
    const hasPolygon = features.some(f => f.getGeometry()?.getType().includes('Polygon'));
    if (hasPolygon) {
      const centerPin = new Feature(new Point([location.lon, location.lat]));
      features.push(centerPin);
    }

    if (features.length > 0) {
      source.addFeatures(features);
      layer.setStyle((f) => this.applySearchStyle(f));

      // Zoom to the extent of the boundary
      const extent = this.calculateExtendedPadding(location.boundingbox);
      this.geography.map?.getView().fit(extent, { 
        duration: 800, 
        padding: [50, 50, 50, 50] 
      });
      
      this.geography.map?.render();
    }
  }

  private applySearchStyle(feature: FeatureLike): Style | Style[] {
    const type = feature.getGeometry()?.getType();

    if (type === 'Point') {
      return this.stylerService.createPinStyle('black');
    }
    
    if (type === 'Polygon' || type === 'MultiPolygon') {
      return new Style({
        stroke: new Stroke({ color: '#000', width: 2.5 }),
        fill: new Fill({ color: 'rgba(0, 0, 0, 0.15)' }),
      });
    }

    return this.stylerService.setStrokeStyle('black');
  }

  private calculateExtendedPadding(bbox: any[]): number[] {
    // bbox is [minLat, maxLat, minLon, maxLon]
    const [minLat, maxLat, minLon, maxLon] = bbox.map(Number);
    
    const latRange = maxLat - minLat;
    const lonRange = maxLon - minLon;
    const padding = Math.max(Math.max(latRange, lonRange) * 0.1, 0.005);
    
    // Returns [minLon, minLat, maxLon, maxLat] for OpenLayers
    return [minLon - padding, minLat - padding, maxLon + padding, maxLat + padding];
  }

  // REMOVE SEARCH LAYER
  clearSearch() {
    this.geography.searchLayer?.getSource()?.clear();
    this.fs.gotoPage('tab1');
  }

  async startPaso() {
    await MyService.startService();
    MyService.addListener('location', (location: any) => {
      // Force execution inside the Angular Zone
      this.zone.run(async () => {
        console.log('📍 Location Received', location);
        if (!location) return;
        const success = this.location.processRawLocation(location);
        if (!success) return;
        if (this.location.state === 'tracking') {
          await this.present.updateTrack(location);
        }
        if (this.location.isSharing) {
          await this.location.shareLocationIfActive(location);
        }
      });
    });
  }

  async updateTrack(location: Location): Promise<boolean> {
    if (!this.geography.map || !this.geography.currentLayer) return false;
    // 1. INICIALIZACIÓN (Primer punto)
    if (!this.present.currentTrack) {
      // Creamos las features con sus etiquetas 'type'
      const routeLine = new Feature();
      routeLine.set('type', 'route_line');
      const startPin = new Feature();
      startPin.set('type', 'start_pin');
      const endPin = new Feature(); // Se crea ahora, se posicionará en stopTracking
      endPin.set('type', 'end_pin');
      const features = [routeLine, startPin, endPin];
      this.present.currentTrack = {
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          properties: {
            name: '', place: '', date: undefined, description: '',
            totalDistance: 0, totalElevationGain: 0, totalElevationLoss: 0,
            totalTime: '00:00:00', totalNumber: 1,
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
    const num = this.present.currentTrack.features[0].geometry.coordinates.length;
    const prevData = this.present.currentTrack.features[0].geometry.properties.data[num - 1];
    const previousTime = prevData?.time || 0;
    const previousAltitude = prevData?.altitude || 0;
    if (previousTime > location.time) return false;
    // Suavizado de altitud
    if (location.time - previousTime < 60000 && Math.abs(location.altitude - previousAltitude) > 50) {
      location.altitude = previousAltitude + 10 * Math.sign(location.altitude - previousAltitude);
    }
    location.speed = location.speed * 3.6;
    // Añadir punto al geojson y actualizar la geometría de la línea en el mapa
    let track: any = this.present.currentTrack;
    track = await this.location.fillGeojson(track, location);
    if (this.location.foreground) this.present.currentTrack = await this.present.foregroundTask(track);
    return true;
  }

}

