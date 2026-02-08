import { FunctionsService } from '../services/functions.service';
import { Component, OnDestroy } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { DecimalPipe, DatePipe, CommonModule } from '@angular/common';
import { global } from '../../environments/environment';
import { register } from 'swiper/element/bundle';
import { ServerService } from '../services/server.service';
import { MapService } from '../services/map.service';
import { ModalController, PopoverController } from '@ionic/angular';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { ColorPopoverComponent } from '../color-popover/color-popover.component';
import { Subscription, Subject } from 'rxjs';
import { debounceTime, takeUntil } from 'rxjs/operators';
import { LanguageService } from '../services/language.service';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { LanguageOption } from '../../globald';
import { FormsModule } from '@angular/forms';
import { ReferenceService } from '../services/reference.service';
import { GeographyService } from '../services/geography.service';
import { PresentService } from '../services/present.service';
import { LocationManagerService } from '../services/location-manager.service';

register();

@Component({
    standalone: true,
    selector: 'app-settings',
    templateUrl: 'settings.page.html',
    styleUrls: ['settings.page.scss'],
    imports: [
      IonicModule, CommonModule, FormsModule, TranslateModule
    ],
    providers: [DecimalPipe, DatePipe],
})

export class SettingsPage implements OnDestroy {
  downloadProgress = 0; // To show download progress
  isDownloading = false; // 🔹 Controls progress bar
  private progressSubscription?: Subscription; // 🔹 Store subscription
  // Language
  languages: LanguageOption[] = [
    { name: 'Català', code: 'ca' },
    { name: 'Español', code: 'es' },
    { name: 'English', code: 'en' },
    { name: 'Français', code: 'fr' },
    { name: 'Русский', code: 'ru' },
    { name: '中文', code: 'zh' },
  ];
  selectedLanguage: any = {name:'English', code:'en'}
  onlineMaps: string[] = ['OpenStreetMap', 'OpenTopoMap', 'German_OSM', 'MapTiler_streets', 'MapTiler_outdoor', 'MapTiler_hybrid', 'MapTiler_v_outdoor', 'IGN'];
  missingOfflineMaps: string[] = [];
  availableOfflineMaps: string[] = [];
  baseMaps: string[] = [];
  colors: string[] = ['crimson', 'red', 'orange', 'gold', 'yellow', 'magenta', 'purple', 'lime', 'green', 'cyan', 'blue']
  // Alert
  alerts: string[] = ['on', 'off'];
  // Geocoding service
  geocodingServices: string[] = ['maptiler']
  // Altitudes
  altitudes: string[] = ['GPS', 'DEM'];
  // Subjects for debouncing map upload/remove actions
  private mapUploadSubject = new Subject<string>();
  private mapRemoveSubject = new Subject<string>();

  private destroy$ = new Subject<void>(); // Para desuscribirse de todo limpiamente

constructor(
    public fs: FunctionsService,
    public server: ServerService,
    public modalController: ModalController,
    private popoverController: PopoverController,
    private languageService: LanguageService,
    private translate: TranslateService,
    private mapService: MapService,
    public reference: ReferenceService,
    public geography: GeographyService,
    public present: PresentService,
    private location: LocationManagerService,
  ) {
    // Configuración de Subscriptions con takeUntil para evitar fugas de memoria
    this.setupMapActions();
  }

  private setupMapActions() {
    this.mapUploadSubject.pipe(
      debounceTime(500),
      takeUntil(this.destroy$)
    ).subscribe(async (map: string) => {
      const mapWithExtension = map + '.mbtiles';
      const match = global.offlineMaps.find((item: any) => item.filename === mapWithExtension);
      if (match) await this.mapUpload(match.url, match.filename);
    });

    this.mapRemoveSubject.pipe(
      debounceTime(500),
      takeUntil(this.destroy$)
    ).subscribe(async (map: string) => {
      const mapWithExtension = map + '.mbtiles';
      const match = global.offlineMaps.find((item: any) => item.filename === mapWithExtension);
      if (match) {
        await this.removeMapFile(match.filename);
      }
    });
  }

  async ionViewWillEnter() {
    await this.checkMaps();
    const code = this.languageService.getCurrentLangValue();
    this.selectedLanguage = this.languages.find(lang => lang.code === code);
  }

  // --- MÉTODOS DE CAMBIO ---

  async onLanguageChange(code: string) {
    await this.languageService.setLanguage(code);
    this.selectedLanguage = this.languages.find((l) => l.code === code);
  }

  async onMapChange(map: string) {
    this.geography.mapProvider = map;
    
    // 1. Ensure the setting is saved first
    await this.fs.storeSet('mapProvider', this.geography.mapProvider);
    
    // 2. Trigger the reload
    try {
      await this.mapService.loadMap();
      this.fs.displayToast(this.translate.instant('SETTINGS.MAP_UPDATED'));
    } catch (error) {
      console.error("Error reloading map:", error);
    }
  }

  async onAlertChange(value: boolean) {
    // Conversión segura de boolean a string
    this.fs.alert = value ? 'on' : 'off'; 
    await this.fs.storeSet('alert', this.fs.alert);
    await this.location.sendReferenceToPlugin();
  }

  // --- GESTIÓN DE COLORES (UNIFICADA) ---

  async openColorPopover(ev: Event, type: 'current' | 'archived') {
    const popover = await this.popoverController.create({
      component: ColorPopoverComponent,
      componentProps: {
        colors: this.colors,
        currentColor: type === 'current' ? this.present.currentColor : this.reference.archivedColor,
        onSelect: (selectedColor: string) => {
          this.updateColor(type, selectedColor);
          popover.dismiss(); // Cerramos el popover tras elegir
        },
      },
      event: ev,
      translucent: true,
    });
    await popover.present();
  }

  async updateColor(type: 'current' | 'archived', color: string) {
    this.fs.reDraw = true;
    if (type === 'current') {
      this.present.currentColor = color;
      await this.fs.storeSet('currentColor', color);
    } else {
      this.reference.archivedColor = color;
      await this.fs.storeSet('archivedColor', color);
    }
  }

  // --- MAPAS OFFLINE ---

  async checkMaps() {
    try {
      const filesInDataDirectory = await this.server.listFilesInDataDirectory();
      
      this.missingOfflineMaps = global.offlineMaps
        .filter((map: any) => !filesInDataDirectory.includes(map.filename))
        .map((map: any) => map.filename.replace(/\.mbtiles$/i, ''));

      this.availableOfflineMaps = global.offlineMaps
        .filter((map: any) => filesInDataDirectory.includes(map.filename))
        .map((map: any) => map.filename.replace(/\.mbtiles$/i, ''));

      this.baseMaps = [...this.onlineMaps, ...this.availableOfflineMaps];
    } catch (e) {
      this.baseMaps = [...this.onlineMaps];
    }
  }

  // 13. MAP UPLOAD (LOGICA DE DESCARGA) /////////////////////////////////////////
  async mapUpload(url: string, filePath: string) {
    this.isDownloading = true; // 🔹 Muestra la barra de progreso
    this.downloadProgress = 0;

    // Nos suscribimos al progreso que emite el servicio server
    this.progressSubscription = this.server.getDownloadProgress().subscribe((progress) => {
      this.downloadProgress = progress;
    });

    try {
      // Iniciamos la descarga binaria
      await this.server.downloadBinaryFile(url, filePath, (progress) => {
        this.downloadProgress = progress;
      });
      
      console.log('Download complete!');
      this.cleanupSubscription();
      await this.checkMaps(); // Refrescamos las listas de mapas
    } catch (err) {
      console.error('Download failed:', err);
      this.cleanupSubscription();
      this.fs.displayToast(this.translate.instant('SETTINGS.FAILED_UPLOADMAP'));
    }
  }

  // 14. CLEAN SUBSCRIPTION ////////////////////////
  private cleanupSubscription() {
    if (this.progressSubscription) {
      this.progressSubscription.unsubscribe();
      this.progressSubscription = undefined;
    }
    this.isDownloading = false; // 🔹 Oculta la barra de progreso
    this.downloadProgress = 0;  // Resetea el porcentaje
    
    // Toast de éxito
    this.fs.displayToast(this.translate.instant('SETTINGS.UPLOADMAP'));
  }

  // 16. REMOVE MAP FILE /////////////////////////////////
  async removeMapFile(filename: string) {
    try {
      await Filesystem.deleteFile({
        path: filename,
        directory: Directory.Data,
      });

      // Refrescar las listas después de borrar
      await this.checkMaps();
      
      const toast_removeMap = this.translate.instant('SETTINGS.REMOVEMAP');
      this.fs.displayToast(toast_removeMap);
    } catch (error) {
      const toast_failed_removeMap = this.translate.instant('SETTINGS.FAILED_REMOVEMAP');
      this.fs.displayToast(toast_failed_removeMap);
      console.error(`Error removing file ${filename}:`, error);
    }
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // --- MÉTODOS DE CONEXIÓN PARA SELECTORES ---

  // 1. Cambio de servicio de Geocodificación
  async onGeocodingServiceChange(service: string) {
    this.fs.geocoding = service;
    await this.fs.storeSet('geocoding', this.fs.geocoding);
  }

  // 2. Cambio de método de Altitud (GPS vs DEM)
  async onAltitudeChange(method: string) {
    this.fs.selectedAltitude = method;
    await this.fs.storeSet('altitude', this.fs.selectedAltitude);
  }

  // 3. Disparador para subir mapa (usa el Subject con debounce)
  onMapUploadChange(mapName: string) {
    if (mapName) {
      this.mapUploadSubject.next(mapName);
    }
  }

  // 4. Disparador para borrar mapa (usa el Subject con debounce)
  onMapRemoveChange(mapName: string) {
    if (mapName) {
      this.mapRemoveSubject.next(mapName);
    }
  }

}