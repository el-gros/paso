import { FunctionsService } from '../functions.service';
import { Component, ViewChild, ElementRef } from '@angular/core';
import { IonicModule, AlertController, LoadingController, AlertInput } from '@ionic/angular';
import { ExploreContainerComponent } from '../explore-container/explore-container.component';
import { CommonModule, DecimalPipe, DatePipe } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
import { Storage } from '@ionic/storage-angular';
import { FormsModule } from '@angular/forms'
import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { global } from '../../environments/environment';
import { Filesystem, Directory, Encoding, ReadFileResult } from '@capacitor/filesystem';
import { register } from 'swiper/element/bundle';
import { App } from '@capacitor/app';
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
  //@ViewChild('fileInput', { static: false }) fileInput!: ElementRef<HTMLInputElement>;
  archivedColor: string = 'green';
  currentColor: string = 'orange'
  styleChecked: boolean = false;
  uploaded: string = ''; 
  lag: number = global.lag; // 8
    
  constructor(
    public fs: FunctionsService,
    private alertController: AlertController,
    //private loadingController: LoadingController,
    private router: Router,
    private storage: Storage,
    private route: ActivatedRoute
  ) {}

  /*
  goHome
  selectColor
  confirm
  ionViewWillEnter
  */


  // GO HOME ///////////////////////////////
  goHome() {
    this.router.navigate(['tab1']);
  }
 
  // SELECT COLOR ////////////////////////////////////////
  async selectColor(currArch: string) {
    const colors: string[] = ['crimson', 'red', 'orange', 'gold', 'yellow', 'magenta', 'purple', 'lime', 'green', 'cyan', 'blue'];
    const inputs: AlertInput[] = colors.map(color => ({
      name: color,
      type: 'radio' as const,  // Explicitly specify "radio" as the type
      label: color,
      value: color,
      checked: currArch === 'Current' ? this.currentColor === color : this.archivedColor === color
    }));
    const alert = await this.alertController.create({
      cssClass: 'alert primaryAlert',
      header: `${currArch} Track`,
      message: 'Kindly set the track color',
      inputs,
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel',
          cssClass: 'alert-cancel-button',
        },
        {
          text: 'Ok',
          cssClass: 'alert-button',
          handler: (data) => {
            if (currArch === 'Current') {
              this.currentColor = data;
            } else if (currArch === 'Archived') {
              this.archivedColor = data;
            }
          }
        }
      ]
    });
    await alert.present();
  }    

  // CONFIRM COLOR SELECTION /////////////////////////////
  async confirm(curArch: string) {
    switch (curArch) {
      case 'Archived':
        await this.storage.set('archivedColor', this.archivedColor);
        break;
      case 'Current':
        await this.storage.set('currentColor', this.currentColor);
        break;
      default:
        console.warn(`Unexpected value for curArch: ${curArch}`);
        break;
    }
    this.goHome(); // Ensure goHome only runs after storage has been set
  }
  
  // IONVIEWWILLENTER
  async ionViewWillEnter() {
    try {
      // Initialize storage
      await this.storage.create();
      // Check the colors
      this.archivedColor = await this.check(this.archivedColor ?? 'defaultArchivedColor', 'archivedColor');
      this.currentColor = await this.check(this.currentColor ?? 'defaultCurrentColor', 'currentColor');
    } catch (error) {
      console.error("Failed to initialize storage:", error);
    }
  }

   // CHECK IN STORAGE //////////////////////////
   async check(variable: any, key: string) {
     try {
       const result = await this.storage.get(key);
       if (result !== null && result !== undefined) {
         variable = result;
       } else {}
     } catch {}
     return variable
   }
 
   ionViewWillLeave() {
    this.uploaded = '';
   }
 

 }
 
 
 