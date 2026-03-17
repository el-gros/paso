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
  
  private destroy$ = new Subject<void>(); 

  // --- Mapas Online ---
  public onlineMaps: string[] = ['OpenStreetMap', 'OpenTopoMap', 'German_OSM', 'MapTiler_streets', 'MapTiler_outdoor', 'MapTiler_hybrid', 'MapTiler_v_outdoor', 'IGN'];
  
  // Subjects para manejar el debounce de la UI
  private mapUploadSubject = new Subject<string>();
  private mapRemoveSubject = new Subject<string>();

  // --- Preferencias UI ---
  public languages: LanguageOption[] = [
    { name: 'Català', code: 'ca' }, { name: 'Español', code: 'es' },
    { name: 'English', code: 'en' }, { name: 'Français', code: 'fr' },
    { name: 'Русский', code: 'ru' }, { name: '中文', code: 'zh' },
  ];
  public selectedLanguage: LanguageOption = { name: 'English', code: 'en' };
  public colors: string[] = ['crimson', 'red', 'orange', 'gold', 'yellow', 'magenta', 'purple', 'lime', 'green', 'cyan', 'blue'];

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
    // 1. El servicio se encarga de todo lo relacionado con mapas
    await this.offlineMapService.refreshMapsList();
    
    // 2. El lenguaje es lo único que el componente gestiona directamente
    this.selectedLanguage = this.languages.find(
      lang => lang.code === this.languageService.currentLangValue
    ) || { name: 'English', code: 'en' };
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ==========================================================================
  // GESTIÓN DE MAPAS (Conexión con el Servicio)
  // ==========================================================================

  private setupMapActions() {
    this.mapUploadSubject.pipe(debounceTime(500), takeUntil(this.destroy$))
      .subscribe(name => this.offlineMapService.downloadMap(name));

    this.mapRemoveSubject.pipe(debounceTime(500), takeUntil(this.destroy$))
      .subscribe(name => this.offlineMapService.removeMap(name));
  }

  onMapUploadChange(mapName: string) {
    if (mapName) this.mapUploadSubject.next(mapName);
  }

  onMapRemoveChange(mapName: string) {
    if (mapName) this.mapRemoveSubject.next(mapName);
  }

  async onMapChange(map: string) {
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
  // OTROS AJUSTES (Lenguaje, Color, Alertas)
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

  async openColorPopover(ev: Event, type: 'current' | 'archived') {
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
  // BACKUP (Export / Import) - REFACTORED
  // ==========================================================================

  async doExport() {
    const loading = await this.loadingCtrl.create({ 
      message: this.translate.instant('SETTINGS.BACKUP_PACKING'),
      spinner: 'crescent'
    });
    await loading.present();

    try {
      const success = await this.backupService.runFullExport();
      await loading.dismiss();

      if (success) {
        this.showAlert(
          this.translate.instant('SETTINGS.BACKUP_SUCCESS_TITLE'), 
          this.translate.instant('SETTINGS.BACKUP_SUCCESS_DESC')
        );
      }
    } catch (e) {
      await loading.dismiss();
      this.showAlert(this.translate.instant('SETTINGS.BACKUP_ERROR_TITLE'), this.translate.instant('SETTINGS.BACKUP_ERROR_DESC'));
    }
  }

  async doImport() {
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

      const success = await this.backupService.runFullImport(file.path);
      await loading.dismiss();

      if (success) {
        this.fs.displayToast(this.translate.instant('SETTINGS.RESTORE_SUCCESS_TITLE'), 'success');
        setTimeout(() => window.location.replace('/'), 1500);
      } else {
        this.showAlert(this.translate.instant('SETTINGS.INVALID_FILE_TITLE'), this.translate.instant('SETTINGS.INVALID_FILE_DESC'));
      }
    } catch (e: any) {
      if (e.message !== 'Pick files canceled.') {
        this.showAlert(this.translate.instant('SETTINGS.BACKUP_ERROR_TITLE'), this.translate.instant('SETTINGS.RESTORE_ERROR_DESC'));
      }
    }
  }

  private async showAlert(header: string, message: string) {
    const alert = await this.alertCtrl.create({ header, message, buttons: ['OK'], cssClass: 'glass-island-alert' });
    await alert.present();
  }

}