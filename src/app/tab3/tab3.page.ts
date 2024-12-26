import { FunctionsService } from '../services/functions.service';
import { Component, ViewChild, ElementRef } from '@angular/core';
import { IonicModule, AlertController, LoadingController, AlertInput } from '@ionic/angular';
//import { ExploreContainerComponent } from '../explore-container/explore-container.component';
import { CommonModule, DecimalPipe, DatePipe } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms'
import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { global } from '../../environments/environment';
import { register } from 'swiper/element/bundle';
register();

@Component({      
  selector: 'app-tab3',
  templateUrl: 'tab3.page.html',
  styleUrls: ['tab3.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule], 
  providers: [DecimalPipe, DatePipe],
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
})

export class Tab3Page {
  archivedColor: string = global.archivedColor;
  currentColor: string = global.currentColor;
  styleChecked: boolean = false;
  lag: number = global.lag; // 8
  baseMaps = [
    {
      name: 'OpenStreetMap',
      image: '/assets/maps/osm.jpg',
    },
    {
      name: 'OpenTopoMap',
      image: '/assets/maps/otm.jpg',
    },
    //  {
  //    name: 'Institut Cartografic de Catalunya',
  //    image: '',
  //  },
  ];
  selectedLanguage: 'ca' | 'es' | 'other' = global.language;  
  title: any = [
    ['Trajecte actual', 'Trayecto actual', 'Current track'],
    ['Trajecte de referència', 'Trayecto de referencia','Reference track'],
    ['Mapa base','Mapa base', 'Base map'],
    ['Idioma','Idioma', 'Language'],
    ['CANVIAR COLOR','CAMBIAR COLOR','CHANGE COLOR']
  ]
  language: 'ca' | 'es' | 'other' = global.language;  
  languageIndex: 0 | 1 | 2 = global.languageIndex

  constructor(
    public fs: FunctionsService,
    private alertController: AlertController,
    private router: Router,
  ) {
      this.archivedColor = global.archivedColor;
      this.currentColor = global.currentColor
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
            //global.currentColor = this.currentColor
            global.currentColor = data;
            await this.fs.storeSet('currentColor', global.currentColor);
          } else if (currArch === 'Archived') {
            this.archivedColor = data;
            //global.archivedColor = this.archivedColor;
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
    const mapProvider = baseMap.name;
    // Store the map provider
    await this.fs.storeSet('mapProvider', mapProvider);
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
    // translate
    //this.title = await this.translate(this.title) 
  }

  /*
  async translate(variable: string[][]) {
    for (let i in variable) {
      variable[i][0] = variable[i][global.languageIndex+1]
    }
    return variable
  }
  */  
 
  async ionViewWillLeave() {
    await this.fs.storeSet('language', global.language) 
  } 

}
 
 
 