import { Component } from '@angular/core';
import { IonicModule, AlertController } from '@ionic/angular';
import { ExploreContainerComponent } from '../explore-container/explore-container.component';
import { Track, TrackDefinition } from '../../globald';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Storage } from '@ionic/storage-angular';
//import { global } from '../../environments/environment';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
//import { FunctionsService } from '../functions.service';

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
  info: string | undefined = undefined;
  archivedVisible: boolean = false;
  num: number = 0;

  constructor(
    private alertController: AlertController,
    private router: Router,
    private storage: Storage,
    //public fs: FunctionsService,
  ) { }

  goHome() {
    this.router.navigate(['tab1']);
  }

  // ON VIEW WILL ENTER ////////////
  async ionViewDidEnter() {
    this.archivedVisible = true;
    this.archivedVisible = await this.check(this.archivedVisible, 'archivedVisible')
    this.info = undefined;
    // retrieve tracks definition
    this.collection = await this.storage.get('collection');
    if (!this.collection) this.collection = [];
    this.num = this.collection.length;
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
      if (this.collection[i].isChecked) { index = i; break; }
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
    track.features[0].properties.name = name;
    track.features[0].properties.place = place;
    track.features[0].properties.description = description;
    await this.storage.set(JSON.stringify(track.features[0].properties.date), track);
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
    await this.storage.set('all', false)
    this.router.navigate(['tab1']);
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

  async geoJsonToGpx(feature: any) {
    var gpxText: string =
      '<?xml version="1.0" encoding="UTF-8" standalone="no" ?>'
      + '<gpx version="1.1" creator="elGros" '
      + 'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" '
      + 'xmlns="http://www.topografix.com/GPX/1/1" '
      + 'xsi:schemaLocation="http://www.topografix.com/GPX/1/1 '
      + 'http://www.topografix.com/GPX/1/1/gpx.xsd">'
      + '<trk><name>'
      + feature.properties.name
      + '</name><trkseg>'
    for (var i in feature.geometry.coordinates) {
      const date = new Date(feature.geometry.properties.data[i].time);
      const year = date.getUTCFullYear();
      const month = String(date.getUTCMonth() + 1).padStart(2, '0'); // Months are zero-based
      const day = String(date.getUTCDate()).padStart(2, '0');
      const hours = String(date.getUTCHours()).padStart(2, '0');
      const minutes = String(date.getUTCMinutes()).padStart(2, '0');
      const seconds = String(date.getUTCSeconds()).padStart(2, '0');
      var date2 = `${year}-${month}-${day}T${hours}:${minutes}:${seconds}Z`;
      var prov: string =
        '<trkpt lat="' + feature.geometry.coordinates[i][1].toString() + '" '
        + 'lon="' + feature.geometry.coordinates[i][0].toString() + '">'
        + '<ele>' + feature.geometry.properties.data[i].altitude + '</ele>'
        + '<time>' + date2 + '</time>'
        + '</trkpt>'
      gpxText += prov
    }
    gpxText += '</trkseg></trk></gpx>'
    return gpxText;
  }

  async exportTrack() {
    var track: Track | undefined;
    track = await this.retrieveTrack();
    if (!track) return;
    var gpxText = await this.geoJsonToGpx(track.features[0])
    var file: string = track.features[0].properties.name.replaceAll(' ', '_') +'.gpx' 
    try {
      // Write the file to the Data directory
      const result = await Filesystem.writeFile({
        path: file, // Specify the path to the Downloads folder
        data: gpxText,
        directory: Directory.External, // Use Directory.Documents for cross-platform compatibility
        encoding: Encoding.UTF8,
      });
      this.info = file + ' is ready to export';
    } catch (e) {
      this.info = 'exportation of ' + file + ' failed';
    }
  }

  // RETRIEVE ARCHIVED TRACK //////////////////////////
  async retrieveTrack() {
    var track: Track | undefined;
    // get collection
    var collection: TrackDefinition[] = await this.storage.get('collection') ?? [];
    // compute number of checked tracks
    var numChecked = 0;
    for (var item of collection) {
      if (item.isChecked) numChecked = numChecked + 1;
      if (numChecked > 1) break;
    }
    // if more than one track is checked, uncheck all
    if (numChecked > 1) {
      for (var item of collection) { item.isChecked = false; }
      numChecked = 0;
    }
    // if no checked items
    if (numChecked == 0) return undefined;
    // find key
    var key: any;
    for (var item of collection) {
      if (item.isChecked) {
        key = item.date;
        break;
      }
    }
    // uncheck all
    for (var item of collection) {
      item.isChecked = false;
    }
    await this.storage.set('collection', collection);
    // retrieve track
    track = await this.storage.get(JSON.stringify(key));
    return track
  }

  // CHECK IN STORAGE //////////////////////////
  async check(variable: any, key: string) {
    try {
      const result = await this.storage.get(key);
      if (result !== null && result !== undefined) {
        variable = result;
      } else { }
    } catch { }
    return variable
  }

  async displayAllTracks() {
    await this.storage.set('all', true);
    this.collection = await this.storage.get('collection');
    if (!this.collection) this.collection = [];
    // uncheck all items
    await this.uncheckAll();
    await this.storage.set('collection', this.collection);
    this.router.navigate(['tab1']);
  }

}
