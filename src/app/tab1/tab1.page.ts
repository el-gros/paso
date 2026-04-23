import { Component, ChangeDetectorRef, OnInit, OnDestroy } from '@angular/core';
import { DecimalPipe, DatePipe, CommonModule } from '@angular/common';
import { register } from 'swiper/element/bundle';

// --- CUSTOM IMPORTS ---
import { WikiWeatherResult } from '../../globald';
import { FunctionsService } from '../services/functions.service';
import { MapService } from '../services/map.service';
import { IonicModule, Platform, ToastController } from '@ionic/angular';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { FormsModule } from '@angular/forms';
import { TrackingControlService } from '../services/trackingControl.service';
import { LocationManagerService } from '../services/location-manager.service';
import { ReferenceService } from '../services/reference.service';
import { GeographyService } from '../services/geography.service';
import { PresentService } from '../services/present.service';
import { RecordPopoverComponent } from '../record-popover.component';
import { SearchComponent } from '../search/search.component';
import { BehaviorSubject, filter, Subject, switchMap, take, takeUntil } from 'rxjs'; 
import { WikiCardComponent } from '../wiki-card.component';
import { AppStateService } from '../services/appState.service'; 
import { GeoMathService } from '../services/geo-math.service';
import { MapInteractionService } from '../services/map-interaction.service'; 
import { TrackExportService } from '../services/track-export.service'; 
import { MapTracksService } from '../services/map-tracks.service';
import { DeviceSetupService } from '../services/device-setup.service'; 
import { TrackingEngineService } from '../services/tracking-engine.service'; // <-- NUEVO
import { PhotoWaypointService } from '../services/photo-waypoint.service'; // <-- NUEVO

register();

@Component({
  standalone: true,
  selector: 'app-tab1',
  templateUrl: 'tab1.page.html',
  styleUrls: ['tab1.page.scss'],
  imports: [
    IonicModule, CommonModule, FormsModule, TranslateModule, RecordPopoverComponent,
    SearchComponent, WikiCardComponent
  ],
  providers: [DecimalPipe, DatePipe],
})
export class Tab1Page implements OnInit, OnDestroy {

  // ==========================================================================
  // 1. ESTADO Y PROPIEDADES
  // ==========================================================================

  private destroy$ = new Subject<void>();
  private initStatus$ = new BehaviorSubject<boolean>(false);
  private eventsInitialized = false;
  
  public wikiData: WikiWeatherResult | null = null;
  public weatherData: any | null = null;

  /** Comprueba si hay contenido visual en la capa de referencia (archived) */
  get hasReferenceContent(): boolean {
    const source = this.geography.archivedLayer?.getSource();
    return source ? source.getFeatures().length > 0 : false;
  }

  // ==========================================================================
  // 2. CICLO DE VIDA (Lifecycle)
  // ==========================================================================

  constructor(
    public fs: FunctionsService,
    public mapService: MapService,
    private cd: ChangeDetectorRef,
    private translate: TranslateService,
    private trackingControlService: TrackingControlService,
    public location: LocationManagerService,
    public reference: ReferenceService,
    public geography: GeographyService,
    public present: PresentService, 
    private platform: Platform,
    private toastCtrl: ToastController,
    private appState: AppStateService, 
    private geoMath: GeoMathService,
    public mapInteraction: MapInteractionService,
    public trackExport: TrackExportService,
    public deviceSetup: DeviceSetupService,
    public mapTracksService: MapTracksService,
    public trackingEngine: TrackingEngineService, // <-- INYECTADO
    public photoWaypoint: PhotoWaypointService // <-- INYECTADO
  ) {}

  async ngOnInit() {
    console.log("📍 [Tab1] Inicializando componente...");
    await this.platform.ready();

    // 🔔 1. Escuchar repintados (Clicks y GPS)
    this.mapInteraction.mapNeedsUpdate$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.cd.detectChanges());

    this.trackingEngine.onTrackUpdated$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.cd.detectChanges());

    // 2. Pedir permisos nativos
    await this.deviceSetup.checkAndRequestNotifications();
    const hasPermission = await this.deviceSetup.checkGpsPermissions(); 
    
    if (hasPermission) {
      try {
        await this.initializeVariables();
        await this.mapService.loadMap();
        this.mapService.mapIsReady = true;

        await this.initializeEvents(); 
        await this.trackingEngine.startEngine(); // 🚀 Arranca el motor
        await this.deviceSetup.checkBatteryOptimizations();

      } catch (error) {
        console.error("❌ Error en secuencia de inicio:", error);
      }
    }

    this.cd.detectChanges();
    this.initStatus$.next(true);
  }

  /**
   * Se ejecuta cada vez que la vista vuelve a estar activa.
   * Gestiona tracks pendientes de importación y repintados forzados.
   */
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
            this.mapTracksService.updateColors();
            this.fs.reDraw = false;
        }
        /*if (this.fs.buildTrackImage) {
            await this.buildTrackImage();
        }*/
        if (this.mapService.visibleAll) {
            const source = this.geography.archivedLayer?.getSource();
            if (source && source.getFeatures().length === 0) {
              this.mapTracksService.displayAllTracks();
            }
        }
    });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
    this.trackingEngine.stopEngine(); // Detiene el motor si se destruye la vista
  }

  // ==========================================================================
  // 3. INICIALIZACIÓN DE DATOS Y EVENTOS (Privado)
  // ==========================================================================

  /**
   * Carga las preferencias del usuario y sincroniza variables locales con el Storage.
   */
  private async initializeVariables() {
    this.geography.mapProvider = await this.fs.check(this.geography.mapProvider, 'mapProvider');
    //this.fs.collection = await this.fs.storeGet('collection') || [];
    this.reference.archivedColor = await this.fs.check(this.reference.archivedColor, 'archivedColor');
    this.present.currentColor = await this.fs.check(this.present.currentColor, 'currentColor');
    this.fs.alert = await this.fs.check(this.fs.alert,'alert');
    this.fs.geocoding = await this.fs.check(this.fs.geocoding, 'geocoding');
  }

  /**
   * Configura los listeners globales necesarios para la interacción con el mapa y el sistema.
   */
  private async initializeEvents() {
    if (this.eventsInitialized) return; 

    this.appState.onEnterForeground$
      .pipe(takeUntil(this.destroy$))
      .subscribe(async () => {
        if (this.present.currentTrack) {
          await this.refreshMapOnForeground();
        }
      });

    this.mapService.locationActivated$.pipe(takeUntil(this.destroy$)).subscribe(() => this.trackingControlService.start());
    this.mapService.locationDeactivated$.pipe(takeUntil(this.destroy$)).subscribe(() => this.trackingControlService.stop());

    this.mapInteraction.initClickHandling();
    this.trackingControlService.start();
    this.eventsInitialized = true;
  }

  handleWikiResult(event: WikiWeatherResult) {
    this.wikiData = event;       
    this.cd.detectChanges();
  }

  async showStatusToast() {
    let msgKey = 'MAP.UNKNOWN_STATUS';
    if (this.fs.routeStatus === 'green') msgKey = 'MAP.ON_ROUTE';
    if (this.fs.routeStatus === 'red') msgKey = 'MAP.OFF_ROUTE';

    const toast = await this.toastCtrl.create({
      message: this.translate.instant(msgKey),
      duration: 3000,
      position: 'top',
      cssClass: `custom-toast ${this.fs.routeStatus}-toast`, 
      buttons: [{ text: 'OK', role: 'cancel' }]
    });
    await toast.present();
  }

  // 📸 Llama al nuevo servicio de fotos
  async addPhotoWaypoint() {
    await this.photoWaypoint.addPhotoWaypoint();
  }

  async startTracking() {
    this.present.currentTrack = undefined;
    this.location.currentPoint = 0;
    this.present.filtered = 0;
    this.location.averagedSpeed = 0;
    this.present.computedDistances = 0;
    if (this.geography.currentLayer) this.geography.currentLayer.getSource()?.clear();
    this.location.state = 'tracking';
    await this.location.sendReferenceToPlugin();
  }

  async refreshMapOnForeground() {
    if (!this.present.currentTrack) return;
    try {
      let track = this.present.currentTrack;
      const num = track.features[0].geometry.coordinates.length;
      
      await this.present.displayCurrentTrack(track);
      track = await this.geoMath.accumulatedDistances(track, this.present.filtered);
      track = await this.geoMath.filterSpeedAndAltitude(track, this.present.filtered + 1);
      
      this.present.filtered = Math.max(0, num - 1);
      this.geography.map?.updateSize(); 
      this.geography.map?.render();
      this.cd.detectChanges();
      await this.geography.setMapView(track);
    } catch (error) {
      console.error('Error al refrescar el mapa desde foreground:', error);
    }
  }

 async clearReferenceLayer() {
    this.reference.archivedTrack = undefined; 
    this.reference.foundRoute = false;
    this.mapService.visibleAll = false; 

    // Limpiamos el mapa
    this.geography.archivedLayer?.getSource()?.clear();
    
    // Le decimos a Angular: "Revisa el HTML ahora"
    this.cd.detectChanges(); 

    try {
      await this.location.sendReferenceToPlugin();
    } catch (error) {
      console.error(error);
    }
  }
}