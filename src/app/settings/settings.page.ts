/**
 * SettingsPage manages the settings and preferences for the application, including language selection,
 * base map selection, color customization for tracks, and offline map management (uploading and removing MBTiles files).
 * Integrates with FunctionsService and ServerService for storage and file operations, and uses modals and popovers
 * for user interactions. Handles download progress display and updates the UI accordingly.
 */

import { FunctionsService } from '../services/functions.service';
import { Component, ViewChild, ElementRef, OnDestroy } from '@angular/core';
import { AlertController, LoadingController, AlertInput, IonicModule } from '@ionic/angular';
import { DecimalPipe, DatePipe, CommonModule } from '@angular/common';
import { global } from '../../environments/environment';
import { register } from 'swiper/element/bundle';
import { ServerService } from '../services/server.service';
import { MapService } from '../services/map.service';
import { ModalController, PopoverController } from '@ionic/angular';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { ColorPopoverComponent } from '../color-popover/color-popover.component';
import { Subscription, Subject } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { LanguageService } from '../services/language.service';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { LanguageOption } from '../../globald';
import { FormsModule } from '@angular/forms';
import { ReferenceService } from '../services/reference.service';
import { GeographyService } from '../services/geography.service';
import { PresentService } from '../services/present.service';
import { AudioService } from '../services/audio.service';

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
    { name: 'English', code: 'en' }
  ];
  selectedLanguage: any = {name:'English', code:'en'}
  onlineMaps: string[] = ['OpenStreetMap', 'OpenTopoMap', 'German_OSM', 'MapTiler_streets', 'MapTiler_outdoor', 'MapTiler_hybrid', 'MapTiler_v_outdoor', 'IGN'];
  missingOfflineMaps: string[] = [];
  availableOfflineMaps: string[] = [];
  baseMaps: string[] = [];
  colors: string[] = ['crimson', 'red', 'orange', 'gold', 'yellow', 'magenta', 'purple', 'lime', 'green', 'cyan', 'blue']
  // Alert
  alerts: string[] = ['on', 'off'];
  // Audio alert
  audioAlerts: string[] = ['on', 'off'];
  // Geocoding service
  geocodingServices: string[] = ['maptiler']
  // Altitudes
  altitudes: string[] = ['GPS', 'DEM'];

  // Subjects for debouncing map upload/remove actions
  private mapUploadSubject = new Subject<string>();
  private mapRemoveSubject = new Subject<string>();
  private mapUploadSubscription?: Subscription;
  private mapRemoveSubscription?: Subscription;

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
    public audio: AudioService,
  ) {

    // Debounced map upload
    this.mapUploadSubscription = this.mapUploadSubject.pipe(debounceTime(500)).subscribe(async (map: string) => {
      const mapWithExtension = map + '.mbtiles';
      const match = global.offlineMaps.find((item: any) => item.filename === mapWithExtension);
      if (match) await this.mapUpload(match.url, match.filename);
      else {
        console.log('No matching map found.');
        return;
      }
    });

    // Debounced map remove
    this.mapRemoveSubscription = this.mapRemoveSubject.pipe(debounceTime(500)).subscribe(async (map: string) => {
      const mapWithExtension = map + '.mbtiles';
      const toast_removeMap = this.translate.instant('SETTINGS.TOAST_REMOVEMAP');
      const match = global.offlineMaps.find((item: any) => item.filename === mapWithExtension);
      if (match) {
        await this.removeMapFile(match.filename);
        this.fs.displayToast(toast_removeMap);
      }
      else {
        console.log('No matching map found.');
        return;
      }
    });
  }

  /*
  1. ionViewWillEnter
  2. selectColor

  4. onLanguageChange
  5. onMapChange
  6. openColorPopover

  9. onAltitudeChange
  10. onAlertChange
  11. onMapUploadChange
  12. onMapRemoveChange
  13. mapUpload
  14. cleanupSubscription
  15. checkMaps
  16. removeMapFile
  17. ngOnDestroy
  18. updateColor
  */

    // 1. IONVIEWWILLENTER /////////////////////////////
  async ionViewWillEnter() {
    // Check maps
    await this.checkMaps();
    // Set language
    const code = this.languageService.getCurrentLangValue();
    this.selectedLanguage = this.languages.find(lang => lang.code === code);
  }

  // 2. SELECT COLOR ////////////////////////////////////////
  async selectColor(currArch: string) {
    // Define variables
    const message = this.translate.instant('SETTINGS.MESSAGE');
    const color_list = this.translate.instant('SETTINGS.COLOR_LIST');
    const current_header = this.translate.instant('SETTINGS.CIRRENT_HEADER');
    const archived_header = this.translate.instant('SETTINGS.ARCHIVED_HEADER');
    const inputs: AlertInput[] = color_list.map((color: any, index: string | number) => ({
      name: color,
      type: 'radio' as const,
      label: color_list[index], // Use the label from the selected language
      value: color, // Value comes from colors2[2]
      checked: currArch === 'Current' ? this.present.currentColor === color : this.reference.archivedColor === color,
      cssClass: `color-option-${color}` // Style based on the value from colors2[2]
    }));
    const cssClass = 'alert primaryAlert';
    const header = currArch === 'Current' ? current_header : archived_header
    const buttons = [
      {
        text: this.translate.instant('SETTINGS.CANCEL'),
        role: 'cancel',
        cssClass: 'alert-cancel-button'
      },
      {
        text: 'Ok',
        cssClass: 'alert-button',
        handler: async (data: string) => {
          if (currArch === 'Current') {
            this.present.currentColor = data;
            await this.fs.storeSet('currentColor', this.present.currentColor);
          } else if (currArch === 'Archived') {
            this.reference.archivedColor = data;
            await this.fs.storeSet('archivedColor', this.reference.archivedColor);
          }
        }
      }
    ];
    await this.fs.showAlert(cssClass, header, message, inputs, buttons, '');
  }

  // 4. LANGUAGE CHANGE ///////////////////////////////////////
  async onLanguageChange(code: string) {
    await this.languageService.setLanguage(code);
    this.selectedLanguage = this.languages.find((l) => l.code === code);
  }

  // 5. MAP CHANGE ///////////////////////////////////////
  async onMapChange(map: string) {
    this.geography.mapProvider = map;
    await this.fs.storeSet('mapProvider', this.geography.mapProvider)
    await this.mapService.loadMap();
    this.fs.gotoPage('tab1');
  }

  // 6. COLOR POPOVER ///////////////////////////////////////
  async openColorPopover(ev: Event, type: 'current' | 'archived') {
    const popover = await this.popoverController.create({
      component: ColorPopoverComponent,
      componentProps: {
        colors: this.colors,
        currentColor: type === 'current' ? this.present.currentColor : this.reference.archivedColor,
        onSelect: (selectedColor: string) => {
          this.updateColor(type, selectedColor);
        },
      },
      event: ev,
      showBackdrop: true,
      translucent: true,
    });
    await popover.present();
  }

  // 9. ALTITUDE METHOD CHANGE /////////////////////////
  async onAltitudeChange(method: string) {
    this.fs.selectedAltitude = method;
    await this.fs.storeSet('altitude', this.fs.selectedAltitude);
  }

  // 9 bis. ALERT CHANGE /////////////////////////
  async onAlertChange(position: string) {
    this.audio.alert = position;
    await this.fs.storeSet('alert', this.audio.alert);
    // on alert change, audioAlert also changes
    this.audio.audioAlert = position;
    await this.fs.storeSet('audioAlert', this.audio.audioAlert);
  }

  // 10. AUDIO ALERT CHANGE /////////////////////////
  async onAudioAlertChange(position: string) {
    this.audio.audioAlert = position;
    await this.fs.storeSet('audioAlert', this.audio.audioAlert);
  }

  // 10bis. AUDIO ALERT CHANGE /////////////////////////
  async onGeocodingServiceChange(position: string) {
    this.fs.geocoding = position;
    await this.fs.storeSet('geocoding', this.fs.geocoding);
  }

  // 11. MAP UPLOAD //////////////////////////////////////////
  async onMapUploadChange(map: string) {
    this.mapUploadSubject.next(map);
  }

  // 12. MAP REMOVE //////////////////////////////////////////
  async onMapRemoveChange(map: string) {
    this.mapRemoveSubject.next(map);
  }

 // 13. MAP UPLOAD /////////////////////////////////////////
 async mapUpload(url:string, filePath: string) {
    this.isDownloading = true; // 🔹 Show progress bar
    // Subscribe to progress updates
    this.progressSubscription = this.server.getDownloadProgress().subscribe((progress) => {
      this.downloadProgress = progress;
    });
    // Start download
    this.server.downloadBinaryFile(url, filePath, (progress) => {
      this.downloadProgress = progress;
    }).then( async() => {
      console.log('Download complete!');
      this.cleanupSubscription();
      // Refresh
      await this.checkMaps();
    }).catch((err) => {
      console.error('Download failed:', err);
      this.cleanupSubscription();
    });
  }

  // 14. CLEAN SUBSCRIPTION ////////////////////////
  private cleanupSubscription() {
    if (this.progressSubscription) {
      this.progressSubscription.unsubscribe();
      this.progressSubscription = undefined;
    }
    this.isDownloading = false; // 🔹 Hide progress bar
    this.downloadProgress = 0; // Reset progress
    // Toast
    this.fs.displayToast(this.translate.instant('SETTINGS.TOAST_UPLOADMAP'));
  }

  // 15. CHECK MAPS //////////////////////////
  async checkMaps() {
    // Files in Data directory
    const filesInDataDirectory = await this.server.listFilesInDataDirectory();
    // Missing maps (available to be downloaded)
    this.missingOfflineMaps = global.offlineMaps
      .filter((map: { filename: string }) => !filesInDataDirectory.includes(map.filename))
      .map((map: { filename: string }) => map.filename.replace(/\.mbtiles$/i, ''));
    // Available maps
    this.availableOfflineMaps = global.offlineMaps
      .filter((map: { filename: string }) => filesInDataDirectory.includes(map.filename))
      .map((map: { filename: string }) => map.filename.replace(/\.mbtiles$/i, ''));
    // Build the final map list
    this.baseMaps = [...this.onlineMaps, ...this.availableOfflineMaps];
    // Selected online - remove
    console.log('Missing offline maps:', this.missingOfflineMaps);
    console.log('Available offline maps:', this.availableOfflineMaps);
    console.log('Base maps', this.baseMaps);
  }

  // 16. REMOVE MAP /////////////////////////////////
  async removeMapFile(filename: string) {
    try {
      await Filesystem.deleteFile({
        path: filename,
        directory: Directory.Data,
      });
      // Toast for success
      const toast_removeMap = this.translate.instant('SETTINGS.TOAST_REMOVEMAP');
      this.fs.displayToast(toast_removeMap);
      await this.checkMaps();
    } catch (error) {
      // Toast for error
      const toast_failed_removeMap = this.translate.instant('SETTINGS.TOAST_FAILED_REMOVEMAP');
      this.fs.displayToast(toast_failed_removeMap);
      console.error(`Error removing file ${filename}:`, error);
    }
  }

  // 17. ON DESTROY //////////////////////////////
  ngOnDestroy() {
    if (this.progressSubscription) {
      this.progressSubscription.unsubscribe();
      this.progressSubscription = undefined;
    }
    if (this.mapUploadSubscription) {
      this.mapUploadSubscription.unsubscribe();
      this.mapUploadSubscription = undefined;
    }
    if (this.mapRemoveSubscription) {
      this.mapRemoveSubscription.unsubscribe();
      this.mapRemoveSubscription = undefined;
    }
  }

  // 18. UPDATE COLOR ////////////////////////////////
  async updateColor(type: 'current' | 'archived', color: string) {
    // Only allow colors from the predefined list
    if (!this.colors.includes(color)) {
      console.warn(`Invalid color selected: ${color}`);
      return;
    }
    // Tell tab1 to update
    this.fs.reDraw = true;
    // Current or archived
    if (type === 'current') {
      this.present.currentColor = color;
      await this.fs.storeSet('currentColor', color);
    } else {
      this.reference.archivedColor = color;
      await this.fs.storeSet('archivedColor', color);
    }
  }

}
