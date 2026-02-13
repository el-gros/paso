import { Component, NgZone, ChangeDetectorRef, OnInit, OnDestroy } from '@angular/core';
import { DecimalPipe, DatePipe, CommonModule } from '@angular/common';
import { Storage } from '@ionic/storage-angular';
import { register } from 'swiper/element/bundle';
import Map from 'ol/Map';
import { useGeographic } from 'ol/proj.js';
import { TrackDefinition, Waypoint, WikiData } from '../../globald';
import { FunctionsService } from '../services/functions.service';
import { MapService } from '../services/map.service';
import { ServerService } from '../services/server.service';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { IonicModule, Platform, PopoverController } from '@ionic/angular';
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
import { BatteryPopoverComponent } from '../battery-popover.component';
import { RecordPopoverComponent } from '../record-popover.component';
import { SearchGuidePopoverComponent } from '../search-guide-popover.component';
import { Device } from '@capacitor/device';
import { Geolocation } from '@capacitor/geolocation';
import { BehaviorSubject, filter, Subject, take, takeUntil } from 'rxjs';
import { WikiCardComponent } from '../wiki-card.component';
import { MapBrowserEvent } from 'ol';
import { FeatureLike } from 'ol/Feature';
import { Feature } from 'ol';
import { ToastController } from '@ionic/angular';

useGeographic();
register();

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

  private destroy$ = new Subject<void>();
  private initStatus$ = new BehaviorSubject<boolean>(false);
  private eventsInitialized = false;
  public wikiData: WikiData | null = null;
  public routeStatus: 'green' | 'red' | 'unknown' = 'unknown';

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

  // 1. ON INIT ////////////////////////////////
  async ngOnInit() {
    await this.platform.ready();
    await this.initializeVariables();
    const hasPermission = await this.checkGpsPermissions(); 
    if (hasPermission) {
      try {
        await MyService.startService(); 
        await this.mapService.loadMap();
        this.mapService.mapIsReady = true;
        await this.initializeEvents(); 
        
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

  // 2. ION VIEW DID ENTER //////////////////////
  async ionViewDidEnter() {
    this.initStatus$.pipe(
      filter(ready => ready === true),
      take(1)
    ).subscribe(async () => {
      this.geography.map?.updateSize();
      await this.initializeEvents();
      
      this.mapService.pendingTrack$
        .pipe(
          takeUntil(this.destroy$),
          filter(track => track !== null) 
        )
        .subscribe(async (track) => {
          this.reference.archivedTrack = track;
          await this.reference.displayArchivedTrack();
          await this.geography.setMapView(track);
          this.mapService.pendingTrack$.next(null);
        });

      if (this.fs.reDraw) {
        await this.mapService.updateColors();
        this.fs.reDraw = false;
      }
      if (this.fs.buildTrackImage) {
        await this.buildTrackImage();
      }
    });
    if (this.mapService.visibleAll) {
      // Solo si el source está vacío, para no recargar mil veces
      const source = this.geography.archivedLayer?.getSource();
      if (source && source.getFeatures().length === 0) {
        this.mapService.displayAllTracks();
      }
    }
  }

  // 3. CHECK BATTERY OPTIMIZATIONS /////////////
  async checkBatteryOptimizations(evento?: any) {
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

  // 4. HANDLE CLICKS ///////////////////////////
  async handleClicks() {
    const map = this.geography.map;
    if (!map) return;

    // Quitamos los corchetes y usamos el string directo
    map.un('singleclick', this.handleMapClick);
    map.on('singleclick', this.handleMapClick);
    console.log('✅ Click listener activado en el mapa');
  }

  // 5. HANDLE MAP CLICK ////////////////////////
  private handleMapClick = async (event: any) => {
    console.log('¡Clic detectado!', event?.coordinate);
    const browserEvent = event as MapBrowserEvent<PointerEvent>;
    const map = this.geography.map;

    // 1. Si no hay mapa o la capa no tiene fuente de datos, no hacemos nada
    if (!map || !this.geography.archivedLayer?.getSource()) return;

    let selectedFeature: any = null;

    map.forEachFeatureAtPixel(browserEvent.pixel, (feature: FeatureLike) => {
      console.log('Feature encontrada:', feature.getProperties());
      if (feature instanceof Feature) {
        const type = feature.get('type');
        if (!selectedFeature && type) {
          selectedFeature = feature;
          return true; 
        }
      }
      return false;
    }, { hitTolerance: 5 });

    if (!selectedFeature) {
      return;
      console.log('No se seleccionó ninguna feature válida');
    }  
    
    const type = selectedFeature.get('type');
    console.log('Tipo de feature:', type);
    const geometry = selectedFeature.getGeometry();
    if (!geometry) return;

    // --- ESCENARIO 2a: YA HAY UN TRACK ABIERTO ---
    if (this.reference.archivedTrack) {
      
      // Si se pincha en un Waypoint
      if (type === 'archived_waypoints' && 'getCoordinates' in geometry) {
        const coords = (geometry as any).getCoordinates();
        const clickedCoordinate = (geometry as any).getClosestPoint(browserEvent.coordinate);
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
              this.fs.displayToast(this.translate.instant('MAP.WAYPOINT_UPDATED'), 'success');
            }
          }
        }
      } 
      // Si se pincha en cualquier otra parte del track (línea, inicio, fin)
      else {
        const trackElements = ['archived_line', 'archived_start', 'archived_end', 'archived_points'];
        if (trackElements.includes(type)) {
          const archivedDate = this.reference.archivedTrack?.features?.[0]?.properties?.date;
          if (archivedDate) {
            const archivedTime = new Date(archivedDate).getTime();
            const index = this.fs.collection.findIndex((item: TrackDefinition) => 
              item.date && new Date(item.date).getTime() === archivedTime
            );

            if (index >= 0) {
              await this.reference.editTrack(index);
            }
          }
        }
      }
    } 

    // --- ESCENARIO 2b: NO HAY TRACK ABIERTO (Cargar nuevo) ---
    else {
      // Si se pincha en los puntos de un trayecto archivado
      if (type === 'archived_points') {
        const clickedCoordinate = (geometry as any).getClosestPoint(event.coordinate);
        const coords = (geometry as any).getCoordinates();
        const index = this.findClosestIndex(coords, clickedCoordinate);
        
        if (index !== -1) {
          const multiKey = selectedFeature.get('multikey');
          this.fs.key = JSON.stringify(multiKey[index]);
          
          // Cargamos el track seleccionado
          const trackData = await this.fs.storeGet(this.fs.key);
          
          if (trackData) {
            // Limpiamos los trayectos actuales de la capa "archived" antes de mostrar el específico
            this.geography.archivedLayer.getSource()?.clear();
            
            this.reference.archivedTrack = trackData;
            this.reference.displayArchivedTrack();
            await this.geography.setMapView(this.reference.archivedTrack);
          }
        }
      }
    }
  }

  // 6. FIND CLOSEST INDEX //////////////////////
  private findClosestIndex(coords: any[], target: any): number {
    const eps = 0.000001;
    return coords.findIndex(c => Math.abs(c[0] - target[0]) < eps && Math.abs(c[1] - target[1]) < eps);
  }

  // 7. INITIALIZE VARIABLES ////////////////////
  async initializeVariables() {
    this.geography.mapProvider = await this.fs.check(this.geography.mapProvider, 'mapProvider');
    this.fs.collection = await this.fs.storeGet('collection') || [];
    this.reference.archivedColor = await this.fs.check(this.reference.archivedColor, 'archivedColor');
    this.present.currentColor = await this.fs.check(this.present.currentColor, 'currentColor');
    this.fs.alert = await this.fs.check(this.fs.alert,'alert');
    //this.fs.selectedAltitude = await this.fs.check(this.fs.selectedAltitude, 'altitude');
    this.fs.geocoding = await this.fs.check(this.fs.geocoding, 'geocoding');
  }

  // 8. ON DESTROY /////////////////////////////
  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
    MyService.stopService();
  }

  // 9. START PASO /////////////////////////////
  async startPaso() {
    await MyService.startService();

    // 1. Listener de Ubicación (GPS)
    MyService.addListener('location', (location: any) => {
      this.zone.run(async () => {
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

    // 2. Listener de Estado de Ruta (Color)
    // Usamos (MyService as any) para evitar el error de "routeStatusUpdate"
    (MyService as any).addListener('routeStatusUpdate', (data: { status: string }) => {
      this.zone.run(() => {
        // Usamos el casting "as any" o el desglose de tipos para que no proteste
        this.routeStatus = data.status as 'green' | 'red' | 'unknown';
        
        // Forzamos la detección de cambios para que la UI responda al instante
        this.cd.detectChanges();
      });
    });
  }

  // 10. CHECK GPS PERMISSIONS //////////////////
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

  // 11. INITIALIZE EVENTS //////////////////////
  async initializeEvents() {
    if (this.eventsInitialized) return; 

    // Location Subscriptions (Usando directamente los servicios)
    this.mapService.locationActivated$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.zone.run(() => this.trackingControlService.start()));

    this.mapService.locationDeactivated$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.zone.run(() => this.trackingControlService.stop()));

    // Sharing Subscriptions (Simplificado sin funciones puente)
    
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

  // 12. EXPORT MAP IMAGE ///////////////////////
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
 
async showStatusToast() {
  // Determinamos el mensaje según el estado
  let msgKey = 'MAP.UNKNOWN_STATUS';
  if (this.routeStatus === 'green') msgKey = 'MAP.ON_ROUTE';
  if (this.routeStatus === 'red') msgKey = 'MAP.OFF_ROUTE';

  // Obtenemos el texto traducido
  const finalMessage = msgKey ? this.translate.instant(msgKey) : msgKey;

  const toast = await this.toastCtrl.create({
    message: finalMessage,
    duration: 3000,
    position: 'top',
    cssClass: `custom-toast ${this.routeStatus}-toast`, // Clase dinámica para el color
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