import { Component, OnDestroy } from '@angular/core';
import { IonicModule, ModalController, PopoverController, ViewWillEnter } from '@ionic/angular';
import { DecimalPipe, DatePipe, CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { register } from 'swiper/element/bundle';
import { Subscription, Subject } from 'rxjs';
import { debounceTime, takeUntil } from 'rxjs/operators';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { FilePicker } from '@capawesome/capacitor-file-picker';
import { LoadingController, AlertController } from '@ionic/angular';

// --- SERVICES & ENV ---
import { FunctionsService } from '../services/functions.service';
import { ServerService } from '../services/server.service';
import { MapService } from '../services/map.service';
import { LanguageService } from '../services/language.service';
import { ReferenceService } from '../services/reference.service';
import { GeographyService } from '../services/geography.service';
import { PresentService } from '../services/present.service';
import { LocationManagerService } from '../services/location-manager.service';
import { BackupService } from '../services/backup.service'; 
import { global } from '../../environments/environment';

// --- COMPONENTS ---
import { ColorPopoverComponent } from '../color-popover.component';

// --- INTERFACES ---
import { LanguageOption } from '../../globald';

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
  imports: [IonicModule, CommonModule, FormsModule, TranslateModule],
  providers: [DecimalPipe, DatePipe],
})
export class SettingsPage implements OnDestroy, ViewWillEnter {
  
  // ==========================================================================
  // 1. ESTADO Y VARIABLES
  // ==========================================================================
  private destroy$ = new Subject<void>(); 

  // --- Mapas ---
  public onlineMaps: string[] = ['OpenStreetMap', 'OpenTopoMap', 'German_OSM', 'MapTiler_streets', 'MapTiler_outdoor', 'MapTiler_hybrid', 'MapTiler_v_outdoor', 'IGN'];
  public missingOfflineMaps: string[] = [];
  public availableOfflineMaps: string[] = [];
  public baseMaps: string[] = [];
  private mapUploadSubject = new Subject<string>();
  private mapRemoveSubject = new Subject<string>();

  // --- Descargas ---
  public downloadProgress = 0; 
  public isDownloading = false; 
  private progressSubscription?: Subscription; 

  // --- Preferencias (UI) ---
  public languages: LanguageOption[] = [
    { name: 'Català', code: 'ca' },
    { name: 'Español', code: 'es' },
    { name: 'English', code: 'en' },
    { name: 'Français', code: 'fr' },
    { name: 'Русский', code: 'ru' },
    { name: '中文', code: 'zh' },
  ];
  public selectedLanguage: LanguageOption = { name: 'English', code: 'en' };
  public colors: string[] = ['crimson', 'red', 'orange', 'gold', 'yellow', 'magenta', 'purple', 'lime', 'green', 'cyan', 'blue'];
  public alerts: string[] = ['on', 'off'];

  // ==========================================================================
  // 2. CONSTRUCTOR Y CICLO DE VIDA
  // ==========================================================================
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
    private backupService: BackupService,
    private loadingCtrl: LoadingController,
    private alertCtrl: AlertController,
  ) {
    this.setupMapActions();
  }

  async ionViewWillEnter() {
    await this.checkMaps();
    const code = this.languageService.currentLangValue; 
    this.selectedLanguage = this.languages.find(lang => lang.code === code) || { name: 'English', code: 'en' };
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
    if (this.progressSubscription) {
        this.progressSubscription.unsubscribe();
    }
  }

  // ==========================================================================
  // 3. GESTIÓN DE PREFERENCIAS GENERALES
  // ==========================================================================
  
  async onLanguageChange(code: string) {
    await this.languageService.setLanguage(code);
    const found = this.languages.find((l) => l.code === code);
    if (found) this.selectedLanguage = found;
  }

  async onAlertChange(value: boolean) {
    this.fs.alert = value ? 'on' : 'off'; 
    await this.fs.storeSet('alert', this.fs.alert);
    await this.location.sendReferenceToPlugin();
  }

  // ==========================================================================
  // 4. GESTIÓN DE COLORES
  // ==========================================================================

  async openColorPopover(ev: Event, type: 'current' | 'archived') {
    const popover = await this.popoverController.create({
      component: ColorPopoverComponent,
      componentProps: {
        colors: this.colors,
        currentColor: type === 'current' ? this.present.currentColor : this.reference.archivedColor,
      },
      cssClass: 'centered-glass-popover', 
      alignment: 'center',                
      side: 'bottom',                     
      translucent: true,
      backdropDismiss: true
    });
    
    await popover.present();

    const { data } = await popover.onDidDismiss();
    
    if (data?.selectedColor) {
      await this.updateColor(type, data.selectedColor);
    }
  }

  private async updateColor(type: 'current' | 'archived', color: string) {
    this.fs.reDraw = true;
    if (type === 'current') {
      this.present.currentColor = color;
      await this.fs.storeSet('currentColor', color);
    } else {
      this.reference.archivedColor = color;
      await this.fs.storeSet('archivedColor', color);
    }
  }

  // ==========================================================================
  // 5. GESTIÓN DE MAPAS ONLINE Y PROVEEDOR
  // ==========================================================================

  async onMapChange(map: string) {
    this.geography.mapProvider = map;
    await this.fs.storeSet('mapProvider', this.geography.mapProvider);
    
    try {
      await this.mapService.loadMap();
      this.fs.displayToast(this.translate.instant('SETTINGS.MAP_UPDATED'), 'success');
    } catch (error) {
      console.error("Error reloading map:", error);
      this.fs.displayToast(this.translate.instant('SETTINGS.MAP_UPDATE_ERROR'), 'error');
    }
  }

  // ==========================================================================
  // 6. GESTIÓN DE MAPAS OFFLINE (Suscripciones, Listado y Descarga)
  // ==========================================================================

  private setupMapActions() {
    const offlineMapsDef = (global.offlineMaps || []) as OfflineMap[];

    this.mapUploadSubject.pipe(
      debounceTime(500),
      takeUntil(this.destroy$)
    ).subscribe(async (mapName: string) => {
      const mapWithExtension = mapName + '.mbtiles';
      const match = offlineMapsDef.find(item => item.filename === mapWithExtension);
      if (match) await this.mapUpload(match.url, match.filename);
    });

    this.mapRemoveSubject.pipe(
      debounceTime(500),
      takeUntil(this.destroy$)
    ).subscribe(async (mapName: string) => {
      const mapWithExtension = mapName + '.mbtiles';
      const match = offlineMapsDef.find(item => item.filename === mapWithExtension);
      if (match) await this.removeMapFile(match.filename);
    });
  }

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

  // --- Triggers para el HTML ---
  onMapUploadChange(mapName: string) {
    if (mapName) this.mapUploadSubject.next(mapName);
  }

  onMapRemoveChange(mapName: string) {
    if (mapName) this.mapRemoveSubject.next(mapName);
  }

  // --- Lógica de Descarga ---
  private async mapUpload(url: string, filePath: string) {
    this.isDownloading = true; 
    this.downloadProgress = 0;

    if (this.server.getDownloadProgress) {
        this.progressSubscription = this.server.getDownloadProgress().subscribe((progress) => {
            this.downloadProgress = progress;
        });
    }

    try {
      await this.server.downloadBinaryFile(url, filePath, (progress) => {
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

  private async removeMapFile(filename: string) {
    try {
      await Filesystem.deleteFile({ path: filename, directory: Directory.Data });
      await this.checkMaps();
      this.fs.displayToast(this.translate.instant('SETTINGS.REMOVEMAP'), 'success');
    } catch (error) {
      console.error(`Error removing file ${filename}:`, error);
      this.fs.displayToast(this.translate.instant('SETTINGS.FAILED_REMOVEMAP'), 'error');
    }
  }

  async doExport() {
    const loading = await this.loadingCtrl.create({ 
      message: this.translate.instant('SETTINGS.BACKUP_PACKING'),
      spinner: 'crescent'
    });
    await loading.present();

    try {
      // 1. CREAR EL PAYLOAD (Súper Objeto)
      // Empezamos con la colección resumen
      const payload: any = {
        collection: this.fs.collection
      };

      // 2. OBTENER CADA TRACK INDIVIDUAL
      // Mapeamos la colección para obtener las llaves (ISO Strings)
      const keys = this.fs.collection
        .filter((item: any) => item && item.date)
        .map((item: any) => {
            const dateObj = (item.date instanceof Date) ? item.date : new Date(item.date);
            return dateObj.toISOString();
        });

      // Leemos todos los tracks del storage
      const tracksData = await Promise.all(keys.map((key: string) => this.fs.storeGet(key)));

      // 3. ASIGNAR TRACKS AL PAYLOAD USANDO SU LLAVE
      // En lugar de un array "tracks", metemos cada track con su fecha como nombre de propiedad
      keys.forEach((key, index) => {
        if (tracksData[index]) {
          payload[key] = tracksData[index];
        }
      });

      console.log('📦 Payload preparado con', Object.keys(payload).length - 1, 'tracks.');

      // 4. EXPORTAR
      const success = await this.backupService.exportBackup(payload);
      
      await loading.dismiss();
      
      if (success) {
        this.showAlert(
          this.translate.instant('SETTINGS.BACKUP_SUCCESS_TITLE'), 
          this.translate.instant('SETTINGS.BACKUP_SUCCESS_DESC')
        );
      }
    } catch (e) {
      console.error('❌ Error exportando:', e);
      await loading.dismiss();
      this.showAlert(
        this.translate.instant('SETTINGS.BACKUP_ERROR_TITLE'), 
        this.translate.instant('SETTINGS.BACKUP_ERROR_DESC')
      );
    }
  }

  async doImport() {
    let loading: HTMLIonLoadingElement | null = null;

    try {
      const result = await FilePicker.pickFiles({
        types: ['application/zip', 'application/octet-stream', '.paso', '.zip'] 
      });

      const file = result.files[0];
      if (!file || !file.path) return;

      loading = await this.loadingCtrl.create({ 
        message: this.translate.instant('SETTINGS.BACKUP_RESTORING'),
        spinner: 'crescent'
      });
      await loading.present();

      // 1. EL SERVICIO EXTRAE EL ZIP Y PROCESA LAS FOTOS
      const backupData = await this.backupService.importBackup(file.path);

      // Verificamos que llegó algo y que al menos tiene la colección (formato moderno)
      if (backupData && backupData.collection) {
        
        console.log('📚 Restaurando colección...');
        
        // 2A. AÑADIMOS O REEMPLAZAMOS LA COLECCIÓN COMPLETA (igual que en app.component)
        this.fs.collection = backupData.collection;
        await this.fs.storeSet('collection', this.fs.collection);

        // 2B. GUARDAR LOS TRACKS INDIVIDUALES
        const keys = Object.keys(backupData);
        console.log('✅ Elementos a restaurar:', keys.length);

        for (const key of keys) {
          // Ignoramos settings y la colección; el resto son los tracks
          if (key !== 'collection' && key !== 'settings') {
            console.log(`💾 Restaurando track: ${key}`);
            await this.fs.storeSet(key, backupData[key]);
          }
        }

        if (loading) await loading.dismiss();
        
        this.fs.displayToast(
          this.translate.instant('SETTINGS.RESTORE_SUCCESS_TITLE'), 'success'
        );

        // 3. RECARGA PARA APLICAR CAMBIOS
        setTimeout(() => {
          // location.replace reinicia la app pero forzándola a ir a la ruta principal
          // Cambia '/' por '/tabs/tab1' si esa es la ruta base de tu app
          window.location.replace('/'); 
        }, 1500);

      } else {
        if (loading) await loading.dismiss();
        this.showAlert(
          this.translate.instant('SETTINGS.INVALID_FILE_TITLE'), 
          this.translate.instant('SETTINGS.INVALID_FILE_DESC')
        );
      }
    } catch (e: any) {
      if (loading) {
        await loading.dismiss();
      }

      if (e.message !== 'Pick files canceled.') {
        console.error('Error importando:', e);
        this.showAlert(
          this.translate.instant('SETTINGS.BACKUP_ERROR_TITLE'), 
          this.translate.instant('SETTINGS.RESTORE_ERROR_DESC')
        );
      }
    }
  }

  private async showAlert(header: string, message: string) {
    const alert = await this.alertCtrl.create({ header, message, buttons: ['OK'], cssClass: 'glass-island-alert' });
    await alert.present();
  }

}