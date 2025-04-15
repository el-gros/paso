import { FunctionsService } from '../services/functions.service';
import { Component, ViewChild, ElementRef } from '@angular/core';
import { IonicModule, AlertController, LoadingController, AlertInput } from '@ionic/angular';
import { CommonModule, DecimalPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms'
import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { global } from '../../environments/environment';
import { register } from 'swiper/element/bundle';
import { ServerService } from '../services/server.service';
import { Subscription } from 'rxjs';
import { UpdateModalComponent } from '../update-modal/update-modal.component';
import { ModalController } from '@ionic/angular';
import { Map } from '../../globald';
import { Filesystem, Directory } from '@capacitor/filesystem';

register();

@Component({
    selector: 'app-tab3',
    templateUrl: 'tab3.page.html',
    styleUrls: ['tab3.page.scss'],
    imports: [IonicModule, CommonModule, FormsModule],
    providers: [DecimalPipe, DatePipe],
    schemas: [CUSTOM_ELEMENTS_SCHEMA]
})

export class Tab3Page {
  private db: any;

  missingOfflineMaps: Map[] = [];
  availableOfflineMaps: Map[] = [];
  downloadProgress = 0;
  isDownloading = false; // 🔹 Controls visibility
  private progressSubscription?: Subscription; // 🔹 Store subscription
  archivedColor: string = global.archivedColor;
  currentColor: string = global.currentColor;
  styleChecked: boolean = false;
  lag: number = global.lag; // 8
  allowLocation: boolean = true;
  baseMaps: Map[] = [
    {
      name: 'OpenStreetMap',
      image: '/assets/maps/osm.jpg',
    },
    {
      name: 'OpenTopoMap',
      image: '/assets/maps/otm.jpg',
    },
    {
      name: 'IGN',
      image: '/assets/maps/ign.jpg',
    },
  ];
  finalBaseMaps: Map[] = []
  selectedLanguage: 'ca' | 'es' | 'other' = global.language;
  title: any = [
    ['Trajecte actual', 'Trayecto actual', 'Current track'],
    ['Trajecte de referència', 'Trayecto de referencia','Reference track'],
    ['Mapa base','Mapa base', 'Base map'],
    ['Idioma','Idioma', 'Language'],
    ['CANVIAR COLOR','CAMBIAR COLOR','CHANGE COLOR'],
    ['Sense una ruta activa...','Sin una ruta activa...', 'Without any active route...'],
    ['Mostrar posició?', '¿Mostrar posición?', 'Show location?'],
    ['Carregar mapes', 'Cargar mapas', 'Upload maps'],
    ['Eliminar mapes', 'Eliminar mapas', 'Remove maps'],
  ]
  language: 'ca' | 'es' | 'other' = global.language;
  languageIndex: 0 | 1 | 2 = global.languageIndex;

  constructor(
    public fs: FunctionsService,
    public server: ServerService,
    public modalController: ModalController
  ) {
    this.initialize();
  }

  async initialize() {
    this.archivedColor = global.archivedColor;
    this.currentColor = global.currentColor;
    this.checkMaps();
  }

  /*
  1. selectColor
  2. ionViewWillEnter
  3. selectBaseMap
  */

  // 1. SELECT COLOR ////////////////////////////////////////
  async selectColor(currArch: string) {
    // Define variables
    const messages = ['Tria el color del trajecte','Elige el color del trayecto', 'Set the track color']
    const currHeader = ['Trajecte actual','Trayecto actual', 'Current Track']
    const archHeader = ['Trajecte de referència','Trayecto de referencia', 'Reference Track']
    const colors: string[][] = [
      ['carmesí', 'vermell', 'taronja', 'daurat', 'groc', 'magenta', 'morat', 'llima', 'verd', 'cian', 'blau'],
      ['carmesí', 'rojo', 'naranja', 'oro', 'amarillo', 'magenta', 'púrpura', 'lima', 'verde', 'cian', 'azul'],
      ['crimson', 'red', 'orange', 'gold', 'yellow', 'magenta', 'purple', 'lime', 'green', 'cyan', 'blue']
    ]
    const inputs: AlertInput[] = colors[2].map((color, index) => ({
      name: color,
      type: 'radio' as const,
      label: colors[global.languageIndex][index], // Use the label from the selected language
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

  // 2. IONVIEWWILLENTER /////////////////////////////
  async ionViewWillEnter() {
    // Set language in radio group
    this.language = global.language;
    this.languageIndex = global.languageIndex;
  }

  // 3. SELECT MAP
  async selectBaseMap(baseMap: any) {
    console.log(baseMap)
    // Open database
    //if (global.offlineMaps.some((map: { name: string; }) => map.name === baseMap.name)) await this.server.openMbtiles(baseMap.filename);
    // Store the map provider
    await this.fs.storeSet('mapProvider', baseMap.name);
    // Go to map
    this.fs.goHome();
  }

  async onLanguageChange() {
    global.language = this.language;
    // Map the selected language to an index
    switch (this.language) {
      case 'ca':
        this.languageIndex = 0;
        break;
      case 'es':
        this.languageIndex = 1;
        break;
      default:
        this.languageIndex = 2;
    }
    global.language = this.language;
    global.languageIndex = this.languageIndex
    console.log('Language:', global.language);
    console.log('Language Index:', global.languageIndex);
  }

  async ionViewWillLeave() {
    await this.fs.storeSet('language', global.language)
  }

 async mapDownload(url:string, filePath: string) {
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

  private cleanupSubscription() {
    if (this.progressSubscription) {
      this.progressSubscription.unsubscribe();
      this.progressSubscription = undefined;
    }
    this.isDownloading = false; // 🔹 Hide progress bar
    this.downloadProgress = 0; // Reset progress
  }

  async checkMaps() {
    // Files in Data directory
    const filesInDataDirectory = await this.server.listFilesInDataDirectory();
    // Missing maps (available to be downloaded)
    this.missingOfflineMaps = global.offlineMaps.filter((map: { filename: string; }) => !filesInDataDirectory.includes(map.filename));
    // Available maps (already downloaded)
    this.availableOfflineMaps = global.offlineMaps.filter((map: { filename: string; }) => filesInDataDirectory.includes(map.filename));
    // Build the final map list
    this.finalBaseMaps = [...this.baseMaps, ...this.availableOfflineMaps];
  }

  async mapsToUploadRemove(action: string) {
    //console.log('Action:', action);
    const availableOfflineMaps = this.availableOfflineMaps;
    const missingOfflineMaps = this.missingOfflineMaps;
    const cssClass = ['modal-class','blue-class']
    if (action === 'upload') {
      const upload: boolean = true;
      // Open the modal for uploading
      const modal = await this.modalController.create({
        component: UpdateModalComponent,
        componentProps: { missingOfflineMaps, availableOfflineMaps, upload },
        cssClass: cssClass,
        backdropDismiss: true, // Allow dismissal by tapping the backdrop
      });
      // Present modal
      await modal.present();
      const { data } = await modal.onDidDismiss();
      if (data) {
        let { action, selectedMap } = data;
        if (action === 'ok') {
          console.log('Selected map:', selectedMap);
          const url = selectedMap.url;
          const filePath = selectedMap.filename;
          await this.mapDownload(url, filePath);
        }
      }
      console.log('potential uploads: ', this.missingOfflineMaps)
    }
    else if (action === 'remove') {
      const upload: boolean = false;
      // Open the modal for editing
      const modal = await this.modalController.create({
        component: UpdateModalComponent,
        componentProps: { missingOfflineMaps, availableOfflineMaps, upload },
        cssClass: cssClass,
        backdropDismiss: true, // Allow dismissal by tapping the backdrop
      });
      // Present modal
      await modal.present();
      const { data } = await modal.onDidDismiss();
      if (data) {
        let { action, selectedMap } = data;
        if (action === 'ok') {
          console.log('Selected map:', selectedMap);
          await this.removeMapFile(selectedMap.filename);
        }
      }
    }
  }

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

  async getMbtilesPath() {
    const fileUri = await Filesystem.getUri({
      path: 'catalonia.mbtiles',
      directory: Directory.Data
    });
    console.log('MBTiles path:', fileUri.uri);
    return fileUri.uri;
  }

}

