import { Component, OnDestroy } from '@angular/core';
import { IonicModule, ModalController, PopoverController, ViewWillEnter } from '@ionic/angular';
import { DecimalPipe, DatePipe, CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { debounceTime, takeUntil } from 'rxjs/operators';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { FilePicker } from '@capawesome/capacitor-file-picker';
import { LoadingController, AlertController } from '@ionic/angular';

// --- SERVICES ---
import { FunctionsService } from '../services/functions.service';
import { MapService } from '../services/map.service';
import { LanguageService } from '../services/language.service';
import { ReferenceService } from '../services/reference.service';
import { GeographyService } from '../services/geography.service';
import { PresentService } from '../services/present.service';
import { LocationManagerService } from '../services/location-manager.service';
import { BackupService } from '../services/backup.service'; 
import { OfflineMapService } from '../services/offline-map.service'; // <--- Nuevo Servicio

// --- COMPONENTS ---
import { ColorPopoverComponent } from '../color-popover.component';

// --- INTERFACES ---
import { LanguageOption } from '../../globald';

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
  // 1. ESTADO Y PROPIEDADES
  // ==========================================================================

  private destroy$ = new Subject<void>(); 

  /** Lista de proveedores de mapas online disponibles */
  public onlineMaps: string[] = ['OpenStreetMap', 'OpenTopoMap', 'German_OSM', 'MapTiler_streets', 'MapTiler_outdoor', 'MapTiler_hybrid', 'MapTiler_v_outdoor', 'IGN'];
  
  private mapUploadSubject = new Subject<string>();
  private mapRemoveSubject = new Subject<string>();

  /** Opciones de idioma soportadas */
  public languages: LanguageOption[] = [
    { name: 'Català', code: 'ca' }, { name: 'Español', code: 'es' },
    { name: 'English', code: 'en' }, { name: 'Français', code: 'fr' },
    { name: 'Русский', code: 'ru' }, { name: '中文', code: 'zh' },
  ];
  public selectedLanguage: LanguageOption = { name: 'English', code: 'en' };
  
  /** Paleta de colores para la personalización de tracks */
  public colors: string[] = ['crimson', 'red', 'orange', 'gold', 'yellow', 'magenta', 'purple', 'lime', 'green', 'cyan', 'blue'];

  // ==========================================================================
  // 2. CICLO DE VIDA (Lifecycle)
  // ==========================================================================

  constructor(
    public fs: FunctionsService,
    public geography: GeographyService,
    public reference: ReferenceService,
    public present: PresentService,
    public offlineMapService: OfflineMapService, // <--- Inyectado
    private languageService: LanguageService,
    private mapService: MapService,
    private translate: TranslateService,
    private popoverController: PopoverController,
    private location: LocationManagerService,
    private backupService: BackupService,
    private loadingCtrl: LoadingController,
    private alertCtrl: AlertController,
  ) {
    this.setupMapActions();
  }

  async ionViewWillEnter() {
    // Sincronizamos mapas y el lenguaje guardado al entrar en la vista
    await this.offlineMapService.refreshMapsList();
    
    this.selectedLanguage = this.languages.find(
      lang => lang.code === this.languageService.currentLangValue
    ) || { name: 'English', code: 'en' };
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ==========================================================================
  // 3. GESTIÓN DE MAPAS (Online / Offline)
  // ==========================================================================

  /** Configura las suscripciones con debounce para la descarga/borrado de mapas */
  private setupMapActions() {
    this.mapUploadSubject.pipe(debounceTime(500), takeUntil(this.destroy$))
      .subscribe(name => this.offlineMapService.downloadMap(name));

    this.mapRemoveSubject.pipe(debounceTime(500), takeUntil(this.destroy$))
      .subscribe(name => this.offlineMapService.removeMap(name));
  }

  public onMapUploadChange(mapName: string) {
    if (mapName) this.mapUploadSubject.next(mapName);
  }

  public onMapRemoveChange(mapName: string) {
    if (mapName) this.mapRemoveSubject.next(mapName);
  }

  /** Cambia el proveedor de mapas activo y recarga el motor de mapas */
  public async onMapChange(map: string) {
    this.geography.mapProvider = map;
    await this.fs.storeSet('mapProvider', map);
    try {
      await this.mapService.loadMap();
      this.fs.displayToast(this.translate.instant('SETTINGS.MAP_UPDATED'), 'success');
    } catch (e) {
      this.fs.displayToast(this.translate.instant('SETTINGS.MAP_UPDATE_ERROR'), 'error');
    }
  }

  // ==========================================================================
  // 4. OTROS AJUSTES (Idioma, Color, Alertas)
  // ==========================================================================

  public async onLanguageChange(code: string) {
    await this.languageService.setLanguage(code);
    const found = this.languages.find((l) => l.code === code);
    if (found) this.selectedLanguage = found;
  }

  /** Activa o desactiva las alertas sonoras/visuales de desvío de ruta */
  public async onAlertChange(value: boolean) {
    this.fs.alert = value ? 'on' : 'off'; 
    await this.fs.storeSet('alert', this.fs.alert);
    await this.location.sendReferenceToPlugin();
  }

  /** Abre el selector de color para el track activo o el de referencia */
  public async openColorPopover(ev: Event, type: 'current' | 'archived') {
    const popover = await this.popoverController.create({
      component: ColorPopoverComponent,
      componentProps: {
        colors: this.colors,
        currentColor: type === 'current' ? this.present.currentColor : this.reference.archivedColor,
      },
      cssClass: 'centered-glass-popover', 
      translucent: true
    });
    await popover.present();
    const { data } = await popover.onDidDismiss();
    if (data?.selectedColor) await this.updateColor(type, data.selectedColor);
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
  // 5. BACKUP (Copia de Seguridad)
  // ==========================================================================

  /** Inicia el proceso de empaquetado y exportación de datos (.paso) */
  public async doExport() {
    const loading = await this.loadingCtrl.create({ 
      message: this.translate.instant('SETTINGS.BACKUP_PACKING'),
      spinner: 'crescent'
    });
    await loading.present();

    try {
      // Pasamos un callback para actualizar el mensaje con el progreso
      const success = await this.backupService.runFullExport((progress: number) => {
        loading.message = `${this.translate.instant('SETTINGS.BACKUP_PACKING')} (${progress}%)`;
      });
      await loading.dismiss();

      if (success) {
        this.fs.displayToast(this.translate.instant('SETTINGS.BACKUP_SUCCESS_DESC'), 'success', 0);
      }
    } catch (e) {
      await loading.dismiss();
      this.fs.displayToast(this.translate.instant('SETTINGS.BACKUP_ERROR_DESC'), 'danger', 0);
    }
  }

  /** Abre el selector de archivos para restaurar una copia de seguridad */
  public async doImport() {
    try {
      const result = await FilePicker.pickFiles({
        types: ['application/zip', 'application/octet-stream', '.paso', '.zip'] 
      });
      const file = result.files[0];
      if (!file?.path) return;

      const loading = await this.loadingCtrl.create({ 
        message: this.translate.instant('SETTINGS.BACKUP_RESTORING'),
        spinner: 'crescent'
      });
      await loading.present();

      // Pasamos un callback para actualizar el mensaje durante la restauración
      const success = await this.backupService.runFullImport(file.path, (progress: number) => {
        loading.message = `${this.translate.instant('SETTINGS.BACKUP_RESTORING')} (${progress}%)`;
      });
      await loading.dismiss();

      if (success) {
        this.fs.displayToast(this.translate.instant('SETTINGS.RESTORE_SUCCESS_TITLE'), 'success', 0);
        setTimeout(() => window.location.replace('/'), 1500);
      } else {
        this.fs.displayToast(this.translate.instant('SETTINGS.INVALID_FILE_DESC'), 'danger', 0);
      }
    } catch (e: any) {
      if (e.message !== 'Pick files canceled.') {
        this.fs.displayToast(this.translate.instant('SETTINGS.RESTORE_ERROR_DESC'), 'danger', 0);
      }
    }
  }

  private async showAlert(header: string, message: string) {
    const alert = await this.alertCtrl.create({ 
      header, 
      message, 
      buttons: ['OK']
      // Eliminamos cssClass: 'glass-island-alert' para usar el estilo estándar de la app
    });
    await alert.present();
  }

}