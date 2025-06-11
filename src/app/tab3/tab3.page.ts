/**
 * Tab3Page manages the settings and preferences for the application, including language selection,
 * base map selection, color customization for tracks, and offline map management (uploading and removing MBTiles files).
 * Integrates with FunctionsService and ServerService for storage and file operations, and uses modals and popovers
 * for user interactions. Handles download progress display and updates the UI accordingly.
 */
import { FunctionsService } from '../services/functions.service';
import { Component, ViewChild, ElementRef, OnDestroy } from '@angular/core';
import { IonicModule, AlertController, LoadingController, AlertInput } from '@ionic/angular';
import { CommonModule, DecimalPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms'
import { global } from '../../environments/environment';
import { register } from 'swiper/element/bundle';
import { ServerService } from '../services/server.service';
import { Subscription } from 'rxjs';
import { ModalController, PopoverController } from '@ionic/angular';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { ColorPopoverComponent } from '../color-popover/color-popover.component';
import { debounce } from 'lodash';

register();

@Component({
    selector: 'app-tab3',
    templateUrl: 'tab3.page.html',
    styleUrls: ['tab3.page.scss'],
    imports: [IonicModule, CommonModule, FormsModule],
    providers: [DecimalPipe, DatePipe],
})

export class Tab3Page implements OnDestroy {
  downloadProgress = 0; // To show download progress
  isDownloading = false; // 🔹 Controls progress bar
  private progressSubscription?: Subscription; // 🔹 Store subscription
  title: any = [
    ['Trajecte actual', 'Trayecto actual', 'Current track'],
    ['Trajecte de referència', 'Trayecto de referencia','Reference track'],
    ['Mapa base','Mapa base', 'Base map'],
    ['Idioma','Idioma', 'Language'],
    ['CANVIAR COLOR','CAMBIAR COLOR','CHANGE COLOR'],
    ['Carregar mapes', 'Cargar mapas', 'Upload maps'],
    ['Eliminar mapes', 'Eliminar mapas', 'Remove maps'],
  ];
  // Language
  languages: any = [
    {name: 'Català', code:'ca', index: 0},
    {name: 'Español', code: 'es', index: 1},
    {name:'English', code:'en', index:2}
  ];
  selectedLanguage: any = {name:'English', code:'en', index:2}
  onlineMaps: string[] = ['OpenStreetMap', 'OpenTopoMap', 'IGN'];
  missingOfflineMaps: string[] = [];
  availableOfflineMaps: string[] = [];
  selectedMap: string = '';
  baseMaps: string[] = [];
  // Colors
  archivedColor: string = global.archivedColor;
  currentColor: string = global.currentColor;
  colors: string[] = ['crimson', 'red', 'orange', 'gold', 'yellow', 'magenta', 'purple', 'lime', 'green', 'cyan', 'blue']

  constructor(
    public fs: FunctionsService,
    public server: ServerService,
    public modalController: ModalController,
    private popoverController: PopoverController
  ) {}

  /*
  2. selectColor
  3. ionViewWillEnter
  4. selectBaseMap
  5. onLanguageChange
  6. onMapChange
  7. openColorPopover
  8. onCurrentChange
  9. onArchivedChange
  10. onMapUploadChange
  11. onMapRemoveChange
  12. mapUpload
  13. cleanupSubscription
  14. checkMaps
  15. removeMapFile
  16. ngOnDestroy
  17. updateColor
  */

  // 2. SELECT COLOR ////////////////////////////////////////
  async selectColor(currArch: string) {
    // Define variables
    const messages = ['Tria el color del trajecte','Elige el color del trayecto', 'Set the track color']
    const currHeader = ['Trajecte actual','Trayecto actual', 'Current Track']
    const archHeader = ['Trajecte de referència','Trayecto de referencia', 'Reference Track']
    const colors2: string[][] = [
      ['carmesí', 'vermell', 'taronja', 'daurat', 'groc', 'magenta', 'morat', 'llima', 'verd', 'cian', 'blau'],
      ['carmesí', 'rojo', 'naranja', 'oro', 'amarillo', 'magenta', 'púrpura', 'lima', 'verde', 'cian', 'azul'],
      ['crimson', 'red', 'orange', 'gold', 'yellow', 'magenta', 'purple', 'lime', 'green', 'cyan', 'blue']
    ]
    const inputs: AlertInput[] = colors2[2].map((color, index) => ({
      name: color,
      type: 'radio' as const,
      label: colors2[global.languageIndex][index], // Use the label from the selected language
      value: color, // Value comes from colors2[2]
      checked: currArch === 'Current' ? global.currentColor === color : global.archivedColor === color,
      cssClass: `color-option-${color}` // Style based on the value from colors2[2]
    }));
    const cssClass = 'alert primaryAlert';
    const header = currArch === 'Current' ? currHeader[global.languageIndex] : archHeader[global.languageIndex]
    const message = messages[global.languageIndex]
    const buttons = [
      global.cancelButton,
      {
        text: 'Ok',
        cssClass: 'alert-button',
        handler: async (data: string) => {
          if (currArch === 'Current') {
            this.currentColor = data;
            global.currentColor = data;
            await this.fs.storeSet('currentColor', global.currentColor);
          } else if (currArch === 'Archived') {
            this.archivedColor = data;
            global.archivedColor = data;
            await this.fs.storeSet('archivedColor', global.archivedColor);
          }
        }
      }
    ];
    await this.fs.showAlert(cssClass, header, message, inputs, buttons, '');
  }

  // 3. IONVIEWWILLENTER /////////////////////////////
  async ionViewWillEnter() {
    // Check maps
    await this.checkMaps();
    // Set language in radio group
    this.selectedLanguage.code = global.languageCode;
    this.selectedLanguage.index = global.languageIndex;
    if (global.languageIndex == 0) this.selectedLanguage.name = 'Català'
    else if (global.languageIndex == 1) this.selectedLanguage.name = 'Español'
    else this.selectedLanguage.name = 'English';
    console.log(this.selectedLanguage)
    // Set map in radio group
    this.selectedMap = await this.fs.storeGet('mapProvider') || ''
    // Set colors
    this.archivedColor = global.archivedColor;
    this.currentColor = global.currentColor;
  }

  // 4. SELECT MAP ////////////////////////////////
  async selectBaseMap(baseMap: any) {
    console.log(baseMap)
    // Store the map provider
    await this.fs.storeSet('mapProvider', baseMap.name);
    // Go to map
    this.fs.gotoPage('tab1')
  }

  // 5. LANGUAGE CHANGE ///////////////////////////////////////
  async onLanguageChange(code: string) {
    this.selectedLanguage.code = code;
    const picked = this.languages.find((l: { code: string; }) => l.code === code);
    if (picked) {
      this.selectedLanguage.index = picked.index;
      this.selectedLanguage.name  = picked.name;
      global.languageIndex = this.selectedLanguage.index
      global.languageCode = this.selectedLanguage.code
    }
    await this.fs.storeSet('language', this.selectedLanguage.code)
  }

  // 6. MAP CHANGE ///////////////////////////////////////
  async onMapChange(map: string) {
    this.selectedMap = map;
    await this.fs.storeSet('mapProvider', this.selectedMap)
  }

  // 7. COLOR POPOVER ///////////////////////////////////////
  async openColorPopover(ev: Event, type: 'current' | 'archived') {
    const popover = await this.popoverController.create({
      component: ColorPopoverComponent,
      componentProps: {
        colors: this.colors,
        currentColor: type === 'current' ? this.currentColor : this.archivedColor,
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

  // 8. CURRENT COLOR CHANGE /////////////////////
  async onCurrentChange(color: string) {
    this.currentColor = color;
    global.currentColor = color;
    await this.fs.storeSet('currentColor', color);
  }

  // 9. ARCHIVED COLOR CHANGE ///////////////////////////////////////
  async onArchivedChange(color: string) {
    this.archivedColor = color;
    global.archivedColor = color;
    await this.fs.storeSet('archivedColor', global.archivedColor);
  }

  // 10. MAP UPLOAD //////////////////////////////////////////
  async onMapUploadChange(map: string) {
    this.debouncedMapUploadChange(map);
  }

  // Debounced versions
  private debouncedMapUploadChange = debounce(async (map: string) => {
    const mapWithExtension = map + '.mbtiles';
    const match = global.offlineMaps.find((item: any) => item.filename === mapWithExtension);
    if (match) await this.mapUpload(match.url, match.filename);
    else {
      console.log('No matching map found.');
      return;
    }
  }, 500);

  // 11. MAP REMOVE //////////////////////////////////////////
  async onMapRemoveChange(map: string) {
    this.debouncedMapRemoveChange(map);
  }

  private debouncedMapRemoveChange = debounce(async (map: string) => {
    const mapWithExtension = map + '.mbtiles';
    const match = global.offlineMaps.find((item: any) => item.filename === mapWithExtension);
    if (match) await this.removeMapFile(match.filename);
    else {
      console.log('No matching map found.');
      return;
    }
  }, 500);

 // 12. MAP UPLOAD /////////////////////////////////////////
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
      // Toast
      const toast = ["El mapa s'ha carregat correctament",'El mapa se ha cargado con éxito','Map successfully uploaded']
      this.fs.displayToast(toast[global.languageIndex]);
      // Refresh
      await this.checkMaps();
    }).catch((err) => {
      console.error('Download failed:', err);
      this.cleanupSubscription();
    });
  }

  // 13. CLEAN SUBSCRIPTION ////////////////////////
  private cleanupSubscription() {
    if (this.progressSubscription) {
      this.progressSubscription.unsubscribe();
      this.progressSubscription = undefined;
    }
    this.isDownloading = false; // 🔹 Hide progress bar
    this.downloadProgress = 0; // Reset progress
  }

  // 14. CHECK MAPS //////////////////////////
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
    console.log('Missing offline maps:', this.missingOfflineMaps);
    console.log('Available offline maps:', this.availableOfflineMaps);
    console.log('Base maps', this.baseMaps);
  }

  // 15. REMOVE MAP /////////////////////////////////
  async removeMapFile(filename: string) {
    try {
      await Filesystem.deleteFile({
        path: filename,
        directory: Directory.Data,
      });
      console.log(`File ${filename} removed successfully.`);
      // Refresh the maps list
      await this.checkMaps();
    } catch (error) {
      console.error(`Error removing file ${filename}:`, error);
    }
  }

  // 16. ON DESTROY //////////////////////////////
  ngOnDestroy() {
    if (this.progressSubscription) {
      this.progressSubscription.unsubscribe();
      this.progressSubscription = undefined;
    }
  }

  // 17. UPDATE COLOR ////////////////////////////////
  async updateColor(type: 'current' | 'archived', color: string) {
    if (type === 'current') {
      this.currentColor = color;
      global.currentColor = color;
      await this.fs.storeSet('currentColor', color);
    } else {
      this.archivedColor = color;
      global.archivedColor = color;
      await this.fs.storeSet('archivedColor', color);
    }
  }



}

