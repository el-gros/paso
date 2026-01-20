import { Component, NgZone, Inject, inject } from '@angular/core';
import { DecimalPipe, DatePipe, CommonModule } from '@angular/common';
import { Storage } from '@ionic/storage-angular';
import {  ChangeDetectorRef } from '@angular/core';
import { register } from 'swiper/element/bundle';
import Map from 'ol/Map';
import { ParsedPoint, Location, Track, TrackDefinition, Data, Waypoint } from '../../globald';
import { FunctionsService } from '../services/functions.service';
import { MapService } from '../services/map.service';
import { ServerService } from '../services/server.service';
import { useGeographic } from 'ol/proj.js';
import { Filesystem, Encoding, Directory } from '@capacitor/filesystem';
import { IonicModule, ModalController, isPlatform } from '@ionic/angular';
import { LanguageService } from '../services/language.service';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { FormsModule } from '@angular/forms';
import { TrackingControlService } from '../services/trackingControl.service';
import { LocationSharingService } from '../services/locationSharing.service';
import { LocationManagerService } from '../services/location-manager.service';
import { ReferenceService } from '../services/reference.service';
import { GeographyService } from '../services/geography.service';
import { PresentService } from '../services/present.service';
import MyService from '../../plugins/MyServicePlugin';
import { Platform } from '@ionic/angular';
import { PopoverController } from '@ionic/angular';
import { BatteryPopoverComponent } from '../battery-popover.component';
import { RecordPopoverComponent } from '../record-popover.component';
import { SearchGuidePopoverComponent } from '../search-guide-popover.component';
import { Device } from '@capacitor/device';
import { Geolocation } from '@capacitor/geolocation';
import { BehaviorSubject, filter, Subject, take, takeUntil } from 'rxjs';

useGeographic();
register();

@Component({
    standalone: true,
    selector: 'app-tab1',
    templateUrl: 'tab1.page.html',
    styleUrls: ['tab1.page.scss'],
    imports: [
      IonicModule, CommonModule, FormsModule, TranslateModule, RecordPopoverComponent,
      SearchGuidePopoverComponent
    ],
    providers: [DecimalPipe, DatePipe],
})

export class Tab1Page {

  private destroy$ = new Subject<void>();
  private initStatus$ = new BehaviorSubject<boolean>(false);
  private eventsInitialized = false;

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
  ) {}

  /* FUNCTIONS

  1. ngOnInit
  2. ionViewDidEnter
  3. checkBatteryOptimizations
  4. handleClicks
  5. handleMapClicks
  6. findClosestIndex
  7. initializeVariables
  8. onDestroy
  9. startPaso
  10. checkGpsPermissions
  11. initializeEvents

  */

  // 1. ON INIT ////////////////////////////////
  async ngOnInit() {
    await this.platform.ready();
    this.languageService.determineLanguage();
    await this.initializeVariables();
    const hasPermission = await this.checkGpsPermissions(); 
    if (hasPermission) {
      try {
        await MyService.startService(); 
        // Carga el mapa
        await this.mapService.loadMap();
        this.mapService.mapIsReady = true;
        // LLAMADA DIRECTA AQUÍ: En lugar de esperar con un interval externo
        await this.initializeEvents(); 
        if (this.mapService.hasPendingDisplay && this.reference.archivedTrack) {
          // ... tu lógica de track archivado ...
        }
        await this.checkBatteryOptimizations();
        await this.handleClicks();
        await this.startPaso();
      } catch (error) {
        console.error("❌ Error en inicio:", error);
      }
    }
    this.cd.detectChanges();
    this.initStatus$.next(true);
  }

  // 2. ION VIEW DID ENTER
  async ionViewDidEnter() {
    this.initStatus$.pipe(
      filter(ready => ready === true),
      take(1)
    ).subscribe(async () => {
      // 1. Refresh Map UI
      this.geography.map?.updateSize();
      // 2. Initialize Events (using the RxJS pattern we discussed)
      await this.initializeEvents();
      // 3. LISTEN FOR PENDING TRACKS (Files opened from outside the app)
      this.mapService.pendingTrack$
        .pipe(
          takeUntil(this.destroy$),
          filter(track => track !== null) 
        )
        .subscribe(async (track) => {
          this.reference.archivedTrack = track;
          await this.reference.displayArchivedTrack();
          await this.geography.setMapView(track);
          // IMPORTANT: Clear the buffer so it doesn't pop up again
          this.mapService.pendingTrack$.next(null);
        });
      // 4. HANDLE INTERNAL FLAGS (Settings changes or Exports)
      if (this.fs.reDraw) {
        await this.mapService.updateColors();
        this.fs.reDraw = false;
      }
      if (this.fs.buildTrackImage) {
        await this.buildTrackImage();
        // Flag is usually reset inside buildTrackImage()
      }
    });
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

  // 4. HANDLE CLICKS ////////////////////////////////////////
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

  // 5. HANDLE MAP CLICK //////////////////////////////
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

  // 6. FIND CLOSEST INDEX /////////////////////////////////////////////
  private findClosestIndex(coords: any[], target: any): number {
    const eps = 0.000001;
    return coords.findIndex(c => Math.abs(c[0] - target[0]) < eps && Math.abs(c[1] - target[1]) < eps);
  }

  // 7. INITIALIZE VARIABLES /////////////////////////////////
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

  // 8. ON DESTROY ///////////////////
  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
    MyService.stopService(); // Mover aquí tu lógica de limpieza
  }

  // 9. START PASO /////////////////////////////////
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

  // 10. CHECK GPS PERMISSIONS //////////////////////////
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

  // 11. INITIALIZE EVENTS ////////////////////////////////
  async initializeEvents() {
    if (this.eventsInitialized) return; 
    // --- Location Subscriptions ---
    this.mapService.locationActivated$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.zone.run(() => this.onCurrentLocationActivate()));
    this.mapService.locationDeactivated$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.zone.run(() => this.onCurrentLocationDeactivate()));
    // --- Sharing Subscriptions ---
    this.mapService.shareStarted$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.zone.run(() => this.onShareStartFromControl()));
    this.mapService.shareStopped$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.zone.run(() => this.onShareStopFromControl()));
    // --- Standard Map Setup ---
    this.handleClicks();
    this.trackingControlService.start();
      this.eventsInitialized = true;
    console.log("🚀 All Map & Sharing events initialized via RxJS");
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

}

