import { FunctionsService } from '../functions.service';
import { Component, ViewChild, ElementRef } from '@angular/core';
import { IonicModule, AlertController, LoadingController, AlertInput } from '@ionic/angular';
import { ExploreContainerComponent } from '../explore-container/explore-container.component';
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
  imports: [IonicModule, ExploreContainerComponent, CommonModule, FormsModule], 
  providers: [DecimalPipe, DatePipe],
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
})

export class Tab3Page {
  archivedColor: string = 'green';
  currentColor: string = 'orange'
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
  
  constructor(
    public fs: FunctionsService,
    private alertController: AlertController,
    private router: Router,
  ) {}

  /*
  1. selectColor
  2. ionViewWillEnter
  3. selectBaseMap
  */

  // 2. SELECT COLOR ////////////////////////////////////////
  async selectColor(currArch: string) {
    const colors: string[] = ['crimson', 'red', 'orange', 'gold', 'yellow', 'magenta', 'purple', 'lime', 'green', 'cyan', 'blue'];
    const inputs: AlertInput[] = colors.map(color => ({
      name: color,
      type: 'radio' as const,  // Explicitly specify "radio" as the type
      label: `${color}`, // Use a colored block character with the name
      value: color,
      checked: currArch === 'Current' ? this.currentColor === color : this.archivedColor === color,
      cssClass: `color-option-${color}` // Assign a class to style the label
    }));
    const cssClass = 'alert primaryAlert';
    const header = `${currArch} Track`;
    const message = 'Kindly set the track color';
    const buttons = [
      global.cancelButton,
      {
        text: 'Ok',
        cssClass: 'alert-button',
        handler: async (data: string) => {
          if (currArch === 'Current') {
            this.currentColor = data;
            await this.fs.storeSet('currentColor', this.currentColor);
          } else if (currArch === 'Archived') {
            this.archivedColor = data;
            await this.fs.storeSet('archivedColor', this.archivedColor);
          }
        }
      }
    ];
    await this.fs.showAlert(cssClass, header, message, inputs, buttons, '');
  }

  // 2. IONVIEWWILLENTER /////////////////////////////
  async ionViewWillEnter() {
    try {
      // Check the colors
      this.archivedColor = await this.fs.check(this.archivedColor ?? 'defaultArchivedColor', 'archivedColor');
      this.currentColor = await this.fs.check(this.currentColor ?? 'defaultCurrentColor', 'currentColor');
    } catch (error) {
      console.error("Failed to initialize storage:", error);
    }
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

 }
 
 
 