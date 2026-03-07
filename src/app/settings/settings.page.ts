import { Component, OnDestroy } from '@angular/core';
import { IonicModule, ModalController, PopoverController, ViewWillEnter } from '@ionic/angular'; // Added ViewWillEnter
import { DecimalPipe, DatePipe, CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { register } from 'swiper/element/bundle';
import { Subscription, Subject } from 'rxjs';
import { debounceTime, takeUntil } from 'rxjs/operators';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

// --- SERVICES & ENV ---
import { FunctionsService } from '../services/functions.service';
import { ServerService } from '../services/server.service';
import { MapService } from '../services/map.service';
import { LanguageService } from '../services/language.service';
import { ReferenceService } from '../services/reference.service';
import { GeographyService } from '../services/geography.service';
import { PresentService } from '../services/present.service';
import { LocationManagerService } from '../services/location-manager.service';
import { global } from '../../environments/environment';

// --- COMPONENTS ---
import { ColorPopoverComponent } from '../color-popover/color-popover.component';

// --- INTERFACES ---
import { LanguageOption } from '../../globald';

// Interfaz local para los mapas definidos en environment.ts
interface OfflineMap {
  filename: string;
  url: string;
  name?: string;
  size?: number;
}

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
export class SettingsPage implements OnDestroy, ViewWillEnter {
  
  downloadProgress = 0; 
  isDownloading = false; 
  private progressSubscription?: Subscription; 

  // Language
  languages: LanguageOption[] = [
    { name: 'Català', code: 'ca' },
    { name: 'Español', code: 'es' },
    { name: 'English', code: 'en' },
    { name: 'Français', code: 'fr' },
    { name: 'Русский', code: 'ru' },
    { name: '中文', code: 'zh' },
  ];
  selectedLanguage: LanguageOption = { name: 'English', code: 'en' };

  // Maps
  onlineMaps: string[] = ['OpenStreetMap', 'OpenTopoMap', 'German_OSM', 'MapTiler_streets', 'MapTiler_outdoor', 'MapTiler_hybrid', 'MapTiler_v_outdoor', 'IGN'];
  missingOfflineMaps: string[] = [];
  availableOfflineMaps: string[] = [];
  baseMaps: string[] = [];
  
  // Colors
  colors: string[] = ['crimson', 'red', 'orange', 'gold', 'yellow', 'magenta', 'purple', 'lime', 'green', 'cyan', 'blue'];
  
  // Alert
  alerts: string[] = ['on', 'off'];
  
  // Geocoding service
  // geocodingServices: string[] = ['maptiler'];

  // Subjects for debouncing
  private mapUploadSubject = new Subject<string>();
  private mapRemoveSubject = new Subject<string>();
  private destroy$ = new Subject<void>(); 

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
    this.setupMapActions();
  }

  private setupMapActions() {
    // Tipado seguro para global.offlineMaps
    const offlineMapsDef = (global.offlineMaps || []) as OfflineMap[];

    this.mapUploadSubject.pipe(
      debounceTime(500),
      takeUntil(this.destroy$)
    ).subscribe(async (mapName: string) => {
      const mapWithExtension = mapName + '.mbtiles';
      const match = offlineMapsDef.find(item => item.filename === mapWithExtension);
      if (match) {
          await this.mapUpload(match.url, match.filename);
      }
    });

    this.mapRemoveSubject.pipe(
      debounceTime(500),
      takeUntil(this.destroy$)
    ).subscribe(async (mapName: string) => {
      const mapWithExtension = mapName + '.mbtiles';
      const match = offlineMapsDef.find(item => item.filename === mapWithExtension);
      if (match) {
        await this.removeMapFile(match.filename);
      }
    });
  }

  async ionViewWillEnter() {
    await this.checkMaps();
    const code = this.languageService.currentLangValue; 
    this.selectedLanguage = this.languages.find(lang => lang.code === code) || { name: 'English', code: 'en' };
  }

  // --- MÉTODOS DE CAMBIO ---

  async onLanguageChange(code: string) {
    await this.languageService.setLanguage(code);
    const found = this.languages.find((l) => l.code === code);
    if (found) this.selectedLanguage = found;
  }

  async onMapChange(map: string) {
    this.geography.mapProvider = map;
    
    // 1. Guardar configuración
    await this.fs.storeSet('mapProvider', this.geography.mapProvider);
    
    // 2. Recargar mapa
    try {
      await this.mapService.loadMap();
      this.fs.displayToast(this.translate.instant('SETTINGS.MAP_UPDATED'), 'success');
    } catch (error) {
      console.error("Error reloading map:", error);
      this.fs.displayToast('Error updating map provider', 'error');
    }
  }

  async onAlertChange(value: boolean) {
    this.fs.alert = value ? 'on' : 'off'; 
    await this.fs.storeSet('alert', this.fs.alert);
    await this.location.sendReferenceToPlugin();
  }

  // --- GESTIÓN DE COLORES ---

  async openColorPopover(ev: Event, type: 'current' | 'archived') {
    const popover = await this.popoverController.create({
      component: ColorPopoverComponent,
      componentProps: {
        colors: this.colors,
        currentColor: type === 'current' ? this.present.currentColor : this.reference.archivedColor,
        onSelect: (selectedColor: string) => {
          this.updateColor(type, selectedColor);
          popover.dismiss(); 
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
    const offlineMapsDef = (global.offlineMaps || []) as OfflineMap[];
    
    try {
      const filesInDataDirectory = await this.server.listFilesInDataDirectory();
      
      this.missingOfflineMaps = offlineMapsDef
        .filter(map => !filesInDataDirectory.includes(map.filename))
        .map(map => map.filename.replace(/\.mbtiles$/i, ''));

      this.availableOfflineMaps = offlineMapsDef
        .filter(map => filesInDataDirectory.includes(map.filename))
        .map(map => map.filename.replace(/\.mbtiles$/i, ''));

      this.baseMaps = [...this.onlineMaps, ...this.availableOfflineMaps];
    } catch (e) {
      console.warn('Error checking offline maps:', e);
      this.baseMaps = [...this.onlineMaps];
    }
  }

  // 13. MAP UPLOAD (LOGICA DE DESCARGA) /////////////////////////////////////////
  async mapUpload(url: string, filePath: string) {
    this.isDownloading = true; 
    this.downloadProgress = 0;

    // Suscripción al Subject de progreso del servicio (si existe)
    if (this.server.getDownloadProgress) {
        this.progressSubscription = this.server.getDownloadProgress().subscribe((progress) => {
            this.downloadProgress = progress;
        });
    }

    try {
      // Iniciamos la descarga
      await this.server.downloadBinaryFile(url, filePath, (progress) => {
        // Callback directo como respaldo o fuente principal
        this.downloadProgress = progress;
      });
      
      console.log('Download complete!');
      await this.cleanupSubscription(true);
      await this.checkMaps(); 
    } catch (err) {
      console.error('Download failed:', err);
      await this.cleanupSubscription(false);
    }
  }

  // 14. CLEAN SUBSCRIPTION ////////////////////////
  private async cleanupSubscription(success: boolean) {
    if (this.progressSubscription) {
      this.progressSubscription.unsubscribe();
      this.progressSubscription = undefined;
    }
    this.isDownloading = false; 
    this.downloadProgress = 0;  
    
    if (success) {
        this.fs.displayToast(this.translate.instant('SETTINGS.UPLOADMAP'), 'success');
    } else {
        this.fs.displayToast(this.translate.instant('SETTINGS.FAILED_UPLOADMAP'), 'error');
    }
  }

  // 16. REMOVE MAP FILE /////////////////////////////////
  async removeMapFile(filename: string) {
    try {
      await Filesystem.deleteFile({
        path: filename,
        directory: Directory.Data,
      });

      await this.checkMaps();
      this.fs.displayToast(this.translate.instant('SETTINGS.REMOVEMAP'), 'success');
    } catch (error) {
      console.error(`Error removing file ${filename}:`, error);
      this.fs.displayToast(this.translate.instant('SETTINGS.FAILED_REMOVEMAP'), 'error');
    }
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
    if (this.progressSubscription) {
        this.progressSubscription.unsubscribe();
    }
  }

  // --- MÉTODOS DE CONEXIÓN PARA SELECTORES ---

  /*
  async onGeocodingServiceChange(service: string) {
    this.fs.geocoding = service;
    await this.fs.storeSet('geocoding', this.fs.geocoding);
  }
  */

  onMapUploadChange(mapName: string) {
    if (mapName) {
      this.mapUploadSubject.next(mapName);
    }
  }

  onMapRemoveChange(mapName: string) {
    if (mapName) {
      this.mapRemoveSubject.next(mapName);
    }
  }
}