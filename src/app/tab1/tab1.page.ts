import { Component, NgZone, ChangeDetectorRef, OnInit, OnDestroy } from '@angular/core';
import { DecimalPipe, DatePipe, CommonModule } from '@angular/common';
import { Storage } from '@ionic/storage-angular';
import { register } from 'swiper/element/bundle';
import Map from 'ol/Map';
import { TrackDefinition, Waypoint, WikiData, WikiWeatherResult } from '../../globald';
import { FunctionsService } from '../services/functions.service';
import { MapService } from '../services/map.service';
import { ServerService } from '../services/server.service';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { IonicModule, Platform, PopoverController, ToastController } from '@ionic/angular';
import { LanguageService } from '../services/language.service';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { FormsModule } from '@angular/forms';
import { TrackingControlService } from '../services/trackingControl.service';
import { LocationSharingService } from '../services/locationSharing.service';
import { LocationManagerService } from '../services/location-manager.service';
import { ReferenceService } from '../services/reference.service';
import { GeographyService } from '../services/geography.service';
import { PresentService } from '../services/present.service';
import { BatteryPopoverComponent } from '../battery-popover.component';
import { RecordPopoverComponent } from '../record-popover.component';
import { SearchGuidePopoverComponent } from '../search-guide-popover/search-guide-popover.component';
import { Device } from '@capacitor/device';
import { Geolocation } from '@capacitor/geolocation';
import { BehaviorSubject, filter, Subject, switchMap, take, takeUntil } from 'rxjs'; 
import { WikiCardComponent } from '../wiki-card.component';
import { LocalNotifications } from '@capacitor/local-notifications';

// --- OPENLAYERS IMPORTS ---
import { MapBrowserEvent } from 'ol';
import Feature, { FeatureLike } from 'ol/Feature'; 
import { Coordinate } from 'ol/coordinate';
import { SimpleGeometry } from 'ol/geom'; 

// --- PLUGIN IMPORTS ---
import MyService, { Location as PluginLocation } from '../../plugins/MyServicePlugin';

register();

interface RouteStatusEvent {
  status: 'green' | 'red' | 'unknown';
}

@Component({
  standalone: true,
  selector: 'app-tab1',
  templateUrl: 'tab1.page.html',
  styleUrls: ['tab1.page.scss'],
  imports: [
    IonicModule, CommonModule, FormsModule, TranslateModule, RecordPopoverComponent,
    SearchGuidePopoverComponent, WikiCardComponent
  ],
  providers: [DecimalPipe, DatePipe],
})
export class Tab1Page implements OnInit, OnDestroy {

  // ==========================================================================
  // 1. VARIABLES Y ESTADO GLOBALES
  // ==========================================================================
  private destroy$ = new Subject<void>();
  private initStatus$ = new BehaviorSubject<boolean>(false);
  private eventsInitialized = false;
  
  public wikiData: WikiWeatherResult | null = null;
  public weatherData: any | null = null;
  public routeStatus: 'green' | 'red' | 'unknown' = 'unknown';
  private firstPointReceived = false;

  // ==========================================================================
  // 2. CONSTRUCTOR
  // ==========================================================================
  constructor(
    public fs: FunctionsService,
    public mapService: MapService,
    public server: ServerService,
    public storage: Storage,
    private zone: NgZone,
    private cd: ChangeDetectorRef,
    private languageService: LanguageService,
    private translate: TranslateService,
    private trackingControlService: TrackingControlService,
    private locationSharingService: LocationSharingService,
    public location: LocationManagerService,
    public reference: ReferenceService,
    public geography: GeographyService,
    public present: PresentService, 
    private platform: Platform,
    private popoverController: PopoverController,
    private toastCtrl: ToastController,
  ) {}

  // ==========================================================================
  // 3. CICLO DE VIDA (LIFECYCLE)
  // ==========================================================================
  async ngOnInit() {
    await this.platform.ready();

    // 1. Pedir permiso de NOTIFICACIONES (Crítico para que se vea el servicio)
    const permNotif = await LocalNotifications.checkPermissions();
    if (permNotif.display !== 'granted') {
      await LocalNotifications.requestPermissions();
    }

    // 2. Pedir permisos de GPS
    const hasPermission = await this.checkGpsPermissions(); 
    
    if (hasPermission) {
      try {
        // 3. Cargar variables y Mapa
        await this.initializeVariables();
        await this.mapService.loadMap();
        this.mapService.mapIsReady = true;

        // 4. Configurar eventos de la interfaz y clicks
        await this.initializeEvents(); 
        await this.handleClicks();

        // 5. Configurar Listeners y ARRANKAR el servicio (Todo dentro de startPaso)
        await this.startPaso();

        // 6. Optimización de batería (Xiaomi)
        await this.checkBatteryOptimizations();

      } catch (error) {
        console.error("❌ Error en secuencia de inicio:", error);
      }
    }

    this.cd.detectChanges();
    this.initStatus$.next(true);
  }

  async ionViewDidEnter() {
    this.initStatus$.pipe(
      filter(ready => ready === true),
      take(1),
      switchMap(async () => {
        this.geography.map?.updateSize();
        await this.initializeEvents();
        return this.mapService.pendingTrack$; 
      }),
      switchMap(obs => obs), 
      takeUntil(this.destroy$),
      filter(track => track !== null)
    ).subscribe(async (track) => {
      this.reference.archivedTrack = track;
      await this.reference.displayArchivedTrack();
      await this.geography.setMapView(track);
      this.mapService.pendingTrack$.next(null);
    });

    this.initStatus$.pipe(
        filter(ready => ready === true),
        take(1)
    ).subscribe(async () => {
        if (this.fs.reDraw) {
            await this.mapService.updateColors();
            this.fs.reDraw = false;
        }
        if (this.fs.buildTrackImage) {
            await this.buildTrackImage();
        }
        if (this.mapService.visibleAll) {
            const source = this.geography.archivedLayer?.getSource();
            if (source && source.getFeatures().length === 0) {
              this.mapService.displayAllTracks();
            }
        }
    });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ==========================================================================
  // 4. INICIALIZACIÓN Y CONFIGURACIÓN BASE
  // ==========================================================================
  async initializeVariables() {
    this.geography.mapProvider = await this.fs.check(this.geography.mapProvider, 'mapProvider');
    this.fs.collection = await this.fs.storeGet('collection') || [];
    this.reference.archivedColor = await this.fs.check(this.reference.archivedColor, 'archivedColor');
    this.present.currentColor = await this.fs.check(this.present.currentColor, 'currentColor');
    this.fs.alert = await this.fs.check(this.fs.alert,'alert');
    this.fs.geocoding = await this.fs.check(this.fs.geocoding, 'geocoding');
  }

  async checkGpsPermissions(): Promise<boolean> {
    try {
      let check = await Geolocation.checkPermissions();
      if (check.location !== 'granted') {
        const request = await Geolocation.requestPermissions();
        if (request.location !== 'granted') return false;
      }
      return true;
    } catch (error) {
      console.error("Error chequeando permisos:", error);
      return false;
    }
  }

  async checkBatteryOptimizations(evento?: Event) {
    try {
      const { value: isAlreadyIgnored } = await MyService.isIgnoringBatteryOptimizations();
      if (isAlreadyIgnored) return;

      const hasBeenWarned = localStorage.getItem('battery_warning_dismissed');
      if (hasBeenWarned) return;

      const info = await Device.getInfo();
      const brand = info.manufacturer.toLowerCase();
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
          if (brand === 'xiaomi') {
            await MyService.openAutostartSettings();
            await MyService.openBatteryOptimization(); 
          } else {
            await MyService.openBatteryOptimization();
          }
          localStorage.setItem('battery_warning_dismissed', 'true');
        }
      }
    } catch (error) {
      console.error('Error en checkBatteryOptimizations:', error);
    }
  }

  // ==========================================================================
  // 5. GESTIÓN DE TRACKING Y EVENTOS (BACKGROUND)
  // ==========================================================================
  async initializeEvents() {
    if (this.eventsInitialized) return; 

    this.mapService.locationActivated$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.zone.run(() => this.trackingControlService.start()));

    this.mapService.locationDeactivated$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.zone.run(() => this.trackingControlService.stop()));

    this.mapService.shareStarted$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.zone.run(() => this.locationSharingService.startSharing()));

    this.mapService.shareStopped$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.zone.run(() => this.locationSharingService.stopSharing()));

    this.handleClicks();
    this.trackingControlService.start();
    this.eventsInitialized = true;
    console.log("🚀 All Map & Sharing events initialized");
  }

  async startPaso() {
    // 1. Limpiamos cualquier rastro previo para evitar duplicados
    await MyService.removeAllListeners();

    // 2. Registramos el listener de UBICACIÓN
    await MyService.addListener('location', (location: PluginLocation) => {
      this.zone.run(async () => {
        if (!location) return;

        // --- CRUCIAL: Mapeo completo a la interfaz Location ---
        // Forzamos que todo sea numérico y proporcionamos valores por defecto
        const cleanLocation: PluginLocation = {
          latitude: Number(location.latitude),
          longitude: Number(location.longitude),
          accuracy: Number(location.accuracy) || 0,
          altitude: Number(location.altitude) || 0,
          altitudeAccuracy: Number(location.altitudeAccuracy) || 0,
          bearing: Number(location.bearing) || 0,
          speed: Number(location.speed) || 0,
          time: Number(location.time) || Date.now(),
          simulated: !!location.simulated
        };

        // Si las coordenadas principales fallan, no seguimos
        if (isNaN(cleanLocation.longitude) || isNaN(cleanLocation.latitude)) {
          console.warn("⚠️ Coordenadas inválidas recibidas:", location);
          return;
        }

        console.log(`📍 GPS Procesado: [${cleanLocation.longitude}, ${cleanLocation.latitude}] - Acc: ${cleanLocation.accuracy}`);

        // 3. Procesamos la ubicación en los servicios (Lógica de distancias/estados)
        const success = this.location.processRawLocation(cleanLocation);
        
        if (success) {
          // --- AUTO-CENTRADO: Solo para el primer punto ---
          if (!this.firstPointReceived) {
            console.log("🎯 Primer punto detectado. Centrando mapa...");
            this.geography.map?.getView().animate({
              center: [cleanLocation.longitude, cleanLocation.latitude],
              zoom: 17,
              duration: 1000
            });
            this.firstPointReceived = true;
          }

          // 4. Dibujamos en el mapa si el usuario le dio a "Grabar"
          if (this.location.state === 'tracking') {
            console.log("✏️ Dibujando punto en el track...");
            await this.present.updateTrack(cleanLocation);
          }
          
          // 5. Compartir posición en tiempo real (si está activo)
          if (this.location.isSharing) {
            await this.location.shareLocationIfActive(cleanLocation);
          }

          // --- FORZAR RENDER: Vital para ver los cambios al instante ---
          this.geography.map?.render();
          this.cd.detectChanges(); // Refuerzo para la detección de cambios de Angular
        }
      }); 
    });

    // 3. Listener de ESTADO DE RUTA (Fuera/Dentro de camino)
    await MyService.addListener('routeStatusUpdate' as any, (data: any) => {
      this.zone.run(() => {
        console.log("🛣️ Estado ruta nativo:", data.status);
        this.routeStatus = data.status;
        this.cd.detectChanges();
      });
    });

    // 4. ARRANQUE DEL SERVICIO NATIVO
    console.log("🚀 Lanzando PasoServicePlugin...");
    try {
      await MyService.startService();
    } catch (err) {
      console.error("❌ Error al iniciar el servicio nativo:", err);
    }
  }

  // ==========================================================================
  // 6. INTERACCIÓN CON EL MAPA (CLICKS)
  // ==========================================================================
  async handleClicks() {
    const map = this.geography.map;
    if (!map) return;
    map.un('singleclick', this.handleMapClick);
    map.on('singleclick', this.handleMapClick);
  }

  private handleMapClick = async (event: MapBrowserEvent<any>) => {
    const map = this.geography.map;
    if (!map || !this.geography.archivedLayer?.getSource()) return;

    let hitFeature: FeatureLike | null = null;
    map.forEachFeatureAtPixel(event.pixel, (feature: FeatureLike) => {
      hitFeature = feature;
      return true; 
    }, { hitTolerance: 5 });

    if (!hitFeature) return;

    const selectedFeature = hitFeature as Feature;
    const type = selectedFeature.get('type');
    const geometry = selectedFeature.getGeometry() as SimpleGeometry;
    
    if (!geometry) return;

    if (this.reference.archivedTrack) {
        await this.handleArchivedTrackClick(type, selectedFeature, geometry, event);
    } else {
        await this.handleGeneralMapClick(type, selectedFeature, geometry, event);
    }
  }

  private async handleArchivedTrackClick(type: string, feature: Feature, geometry: SimpleGeometry, event: MapBrowserEvent<any>) {
    if (type === 'archived_waypoints') {
        const coords = geometry.getCoordinates();
        const clickedCoordinate = geometry.getClosestPoint(event.coordinate);
        const index = this.findClosestIndex(coords as Coordinate[], clickedCoordinate);

        if (index !== -1) {
          const waypoints: Waypoint[] = feature.get('waypoints');
          if (waypoints && waypoints[index]) {
            const response = await this.fs.editWaypoint(waypoints[index], true, false);
            if (response && response.action === 'ok') {
              waypoints[index].name = response.name;
              waypoints[index].comment = response.comment;
              if (this.reference.archivedTrack?.features?.[0]) {
                this.reference.archivedTrack.features[0].waypoints = waypoints;
              }
              if (this.fs.key && this.reference.archivedTrack) {
                await this.fs.storeSet(this.fs.key, this.reference.archivedTrack);
                this.fs.displayToast(this.translate.instant('MAP.WAYPOINT_UPDATED'), 'success');
              }
            }
          }
        }
    } else {
        const trackElements = ['archived_line', 'archived_start', 'archived_end', 'archived_points'];
        if (trackElements.includes(type)) {
          const archivedDate = this.reference.archivedTrack?.features?.[0]?.properties?.date;
          if (archivedDate) {
            const archivedTime = new Date(archivedDate).getTime();
            const index = this.fs.collection.findIndex((item: TrackDefinition) => 
              item.date && new Date(item.date).getTime() === archivedTime
            );
            if (index >= 0) await this.reference.editTrack(index);
          }
        }
    }
  }

  private async handleGeneralMapClick(type: string, feature: Feature, geometry: SimpleGeometry, event: MapBrowserEvent<any>) {
    // --- CASO 1: Click en Puntos (Waypoints o Clusters) ---
    if (type === 'archived_points') {
      const clickedCoordinate = geometry.getClosestPoint(event.coordinate);
      const coords = geometry.getCoordinates();
      if (!coords) return;
      const coordsArray = (Array.isArray(coords[0]) ? coords : [coords]) as Coordinate[];
      const index = this.findClosestIndex(coordsArray, clickedCoordinate);

      if (index !== -1) {
        const multiKey = feature.get('multikey');
        if (multiKey && multiKey[index]) {
          this.fs.key = JSON.stringify(multiKey[index]);
          const trackData = await this.fs.storeGet(this.fs.key);
          if (trackData) {
            this.geography.archivedLayer?.getSource()?.clear();
            this.reference.archivedTrack = trackData;
            await this.reference.displayArchivedTrack();
            if (this.reference.archivedTrack) {
              await this.geography.setMapView(this.reference.archivedTrack);
            }
          }
        }
      }
      return;
    }

    // --- CASO 2: Click en Líneas, Inicio o Fin ---
    const trackElements = ['archived_line', 'archived_start', 'archived_end'];

    if (trackElements.includes(type)) {
      const featureDate = feature.get('date');

      if (featureDate) {
        const storageKey = new Date(featureDate).toISOString();
        const trackData = await this.fs.storeGet(storageKey);

        if (trackData) {
          this.geography.archivedLayer?.getSource()?.clear();
          this.mapService.visibleAll = false; 

          this.reference.archivedTrack = trackData;
          await this.reference.displayArchivedTrack();
          await this.geography.setMapView(trackData);
          await this.location.sendReferenceToPlugin();
          
          this.cd.detectChanges();
        } else {
          console.warn('⚠️ No se pudieron cargar los datos del track seleccionado.');
        }
      }
    }
  }

  private findClosestIndex(coords: Coordinate[], target: Coordinate): number {
    const eps = 0.000001;
    return coords.findIndex(c => Math.abs(c[0] - target[0]) < eps && Math.abs(c[1] - target[1]) < eps);
  }

  // ==========================================================================
  // 7. EXPORTACIÓN A IMAGEN
  // ==========================================================================
  async buildTrackImage() {
    try {
      await new Promise(resolve => setTimeout(resolve, 150));
      this.geography.currentLayer?.setVisible(false);
      
      const mapWrapper = document.getElementById('map-wrapper');
      if (mapWrapper) mapWrapper.style.transform = `scale(1)`;

      let success = false;
      if (this.geography.map) {
        success = await this.exportMapToImage(this.geography.map);
      }
      
      this.geography.currentLayer?.setVisible(true);
      if (success) {
        this.fs.gotoPage('canvas');
      } else {
        this.fs.buildTrackImage = false;
        await this.fs.displayToast(this.translate.instant('MAP.TOIMAGE_FAILED'), 'error');
        this.fs.gotoPage('archive');
      }
    } catch (err) {
      this.fs.buildTrackImage = false;
      this.fs.gotoPage('archive');
    }
  }

  async exportMapToImage(map: Map): Promise<boolean> {
    const waitForRender = (m: Map): Promise<void> => {
      return new Promise((r) => {
        m.once('rendercomplete', () => setTimeout(() => r(), 300));
        m.renderSync();
      });
    };
    try {
      map.updateSize();
      await waitForRender(map);
      const size = map.getSize() || [window.innerWidth, window.innerHeight];
      const mapCanvas = document.createElement('canvas');
      mapCanvas.width = size[0];
      mapCanvas.height = size[1];
      const ctx = mapCanvas.getContext('2d');
      if (!ctx) return false;

      document.querySelectorAll<HTMLCanvasElement>('.ol-layer canvas').forEach((canvas) => {
        if (canvas.width > 0) {
          const opacity = (canvas.parentNode as HTMLElement)?.style.opacity || '1';
          ctx.globalAlpha = Number(opacity);
          const tr = canvas.style.transform;
          if (tr && tr.startsWith('matrix')) {
            const m = tr.match(/^matrix\(([^)]+)\)$/)?.[1].split(',').map(Number);
            if (m) ctx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
          } else {
            ctx.setTransform(1, 0, 0, 1, 0, 0);
          }
          ctx.drawImage(canvas, 0, 0);
        }
      });

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const dataUrl = mapCanvas.toDataURL('image/png');
      await Filesystem.writeFile({
        path: 'map.png',
        data: dataUrl.split(',')[1],
        directory: Directory.ExternalCache,
      });
      return true;
    } catch (err) {
      return false;
    }
  }

  // ==========================================================================
  // 8. INTERFAZ DE USUARIO (UI / TOASTS)
  // ==========================================================================
  handleWikiResult(event: WikiWeatherResult) {
    this.wikiData = event;       
    this.cd.detectChanges();
  }

  async showStatusToast() {
    let msgKey = 'MAP.UNKNOWN_STATUS';
    if (this.routeStatus === 'green') msgKey = 'MAP.ON_ROUTE';
    if (this.routeStatus === 'red') msgKey = 'MAP.OFF_ROUTE';

    const finalMessage = msgKey ? this.translate.instant(msgKey) : msgKey;

    const toast = await this.toastCtrl.create({
      message: finalMessage,
      duration: 3000,
      position: 'top',
      cssClass: `custom-toast ${this.routeStatus}-toast`, 
      buttons: [
        {
          text: 'OK',
          role: 'cancel'
        }
      ]
    });
    await toast.present();
  }
}