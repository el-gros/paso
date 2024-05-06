import { Component } from '@angular/core';
import { IonicModule, AlertController } from '@ionic/angular';
import { ExploreContainerComponent } from '../explore-container/explore-container.component';
import { Track, TrackDefinition } from '../../globald';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Storage } from '@ionic/storage-angular';
import { global } from '../../environments/environment';

@Component({
  selector: 'app-tab2',
  templateUrl: 'tab2.page.html',
  styleUrls: ['tab2.page.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule, ExploreContainerComponent, FormsModule]
})
export class Tab2Page {

  collection: TrackDefinition[] = [];
  numChecked: number = 0;
  output: any; 

  constructor(
    private alertController: AlertController,
    private router: Router,
    private storage: Storage
  ) {}

  // ON VIEW WILL ENTER ////////////
  async ionViewDidEnter() {
    // retrieve tracks definition
    this.collection = await this.storage.get('collection'); 
    if (!this.collection) this.collection = [];
    // uncheck all items
    for (var item of this.collection) item.isChecked = false;
    await this.storage.set('collection', this.collection);
    this.numChecked = 0;
  }
  ///////////////////////////////////   

  ////// ON CHANGE, COUNT CHECKED ITEMS
  async onChange() {
    this.numChecked = 0;
    for (const item of this.collection) {
      if (item.isChecked) this.numChecked = this.numChecked + 1
    }   
    await this.storage.set('collection', this.collection) 
  }  
  ///////////////////////////////////////


  async editTrack() {
    // compute index
    var index: number = -1; 
    for (var i = 0; i < this.collection.length; i++) {
      if (this.collection[i].isChecked) {index = i; break;}
    }
    if (index == -1) return;
    const alert = await this.alertController.create({
      cssClass: 'alert greenAlert',
      header: 'Track Details',
      message: 'You may modify the track details',
      inputs: [
        {
          name: 'name',
          type: 'text',
          id: 'name-id',
          value: this.collection[index].name,
        },
        {
          name: 'place',
          type: 'text',
          id: 'place-id',
          value: this.collection[index].place,
        },
        {
          name: 'description',
          type: 'textarea',
          id: 'description-id',
          value: this.collection[index].description,
        },
      ],
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel',
          cssClass: 'alert-cancel-button',
          handler: () => {
          }
        }, 
        {
          text: 'OK',
          cssClass: 'alert-button',
          handler: (data) => {
            this.saveFile(index, data.name, data.place, data.description);
          }
        }
      ]
    });
    alert.present();
  }

  async saveFile(i: number, name: string, place: string, description: string) {
    this.collection[i].name = name;
    this.collection[i].place = place;
    this.collection[i].description = description;
    await this.storage.set('collection', this.collection);
    var track: Track
    track = await this.storage.get(JSON.stringify(this.collection[i].date));
    if (!track) return;
    track.name = name;
    track.place = place;
    track.description = description;
    await this.storage.set(JSON.stringify(track.date), track);
  }

  async deleteTracks() {
    // create alert control
    const alert = await this.alertController.create({
      cssClass: 'alert greenAlert',
      // header and message
      header: 'Confirm deletion',
      message: 'The checked track(s) will be definitely removed',
      // buttons
      buttons: [{
        // cancel button
        text: 'Cancel',
        role: 'cancel',
        cssClass: 'alert-cancel-button',
        handler: async () => { await this.uncheckAll(); }
      }, {
        // proceed button
        text: 'OK',
        cssClass: 'alert-button',
        handler: () => { this.yesDeleteTracks(); }
      }]
    });
    await alert.present();  
  }


  async displayTrack() {
    this.router.navigate(['./tabs/tab3']);
  }

  async uncheckAll() {
    for (var item of this.collection) {
      item.isChecked = false;
    }
    this.numChecked = 0;
  }

  async yesDeleteTracks() {
    var remove = this.collection.filter(item => item.isChecked == true);
    this.collection = this.collection.filter(item => item.isChecked == false);
    await this.storage.set('collection', this.collection)
    for (var element of remove) {
      await this.storage.remove(JSON.stringify(element.date));
    }
  }


}
