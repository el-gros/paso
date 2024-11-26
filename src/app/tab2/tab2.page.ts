import { Component, Injectable } from '@angular/core';
import { IonicModule, AlertController } from '@ionic/angular';
import { ExploreContainerComponent } from '../explore-container/explore-container.component';
import { Track, TrackDefinition } from '../../globald';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { global } from '../../environments/environment';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { FunctionsService } from '../functions.service';
import { SocialSharing } from '@awesome-cordova-plugins/social-sharing/ngx';
import { Capacitor } from '@capacitor/core';

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
  layerVisibility: string = global.layerVisibility;
  num: number = 0;
  archivedPresent: boolean = global.archivedPresent

  constructor(
    public fs: FunctionsService,
    private alertController: AlertController,
    private router: Router,
    private socialSharing: SocialSharing
  ) { }

  /* FUNCTIONS
    1. ionViewDidEnter
    2. onChange
    3. editTrack
    4. saveFile
    5. deleteTracks
    6. displayTrack
    7. yesDeleteTracks
    8. geoJsonToGpx
    9.  exportTrack
    10. displayAllTracks
    11. ionViewWillLeave
  */

  // 1. ON VIEW DID ENTER ////////////
  async ionViewDidEnter() {
    // Initialize variables
    this.layerVisibility = global.layerVisibility;
    this.archivedPresent = global.archivedPresent
    this.info = undefined;
    // retrieve collection and uncheck all tracks
    this.collection = await this.fs.storeGet('collection') ?? [];
    for (const item of this.collection) item.isChecked = false;
    await this.fs.storeSet('collection', this.collection);
    this.numChecked = 0;
  }

  // 2. ON CHANGE, COUNT CHECKED ITEMS AND SAVE
  async onChange() {
    this.numChecked = this.collection.filter(item => item.isChecked).length;
    await this.fs.storeSet('collection', this.collection)
  }
  
  // 3. EDIT TRACK DETAILS //////////////////////////////
  async editTrack() {
    // Find the index of the selected track
    const index = this.collection.findIndex(item => item.isChecked);
    if (index === -1) return; // Exit if no track is selected
    // Define the custom class, header, and message for the alert
    const cssClass = 'alert greenAlert';
    const header = 'Edit Track Details';
    const message = 'Modify the fields below:';
    // Prepare inputs with field labels and existing values
    const inputs = [
      this.fs.createReadonlyLabel('Name','Name:'),
      {
        name: 'name',
        type: 'text',
        value: this.collection[index].name,
        cssClass: 'alert-edit'
      },
      this.fs.createReadonlyLabel('Place','Place:'),
      {
        name: 'place',
        type: 'text',
        value: this.collection[index].place,
        cssClass: 'alert-edit'
      },
      this.fs.createReadonlyLabel('Description','Description:'),
      {
        name: 'description',
        type: 'textarea',
        value: this.collection[index].description,
        cssClass: 'alert-edit'
      }
    ];
    // Buttons for the alert dialog
    const buttons = [
      global.cancelButton,
      {
        text: 'OK',
        cssClass: 'alert-button',
        handler: async (data: any) => {
          if (!data.name) return; // Ensure the 'name' field is not empty
          await this.saveFile(index, data.name, data.place, data.description);
        }
      }
    ];
    // Show the alert with the customized inputs
    await this.fs.showAlert(cssClass, header, message, inputs, buttons, '');
  }

  // 4. SAVE FILE ////////////////////////////////////////////
  async saveFile(i: number, name: string, place: string, description: string) {
    try {
      // Update the collection item with the new details
      const updatedTrack = { ...this.collection[i], name, place, description };
      // Update the collection in storage
      this.collection[i] = updatedTrack;
      await this.fs.storeSet('collection', this.collection);
      // Retrieve the corresponding track
      const track = await this.fs.storeGet(JSON.stringify(updatedTrack.date));
      if (!track) {
        console.error('Track not found');
        return;
      }  
      // Update track details
      const { properties } = track.features[0];
      properties.name = name;
      properties.place = place;
      properties.description = description;
      // Save the updated track back to storage
      await this.fs.storeSet(JSON.stringify(track.features[0].properties.date), track);
    } catch (error) {
      console.error('Error saving track details:', error);
    }
  }

  // 5. DELETE TRACK(S) //////////////////////////
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
        handler: async () => { 
          for (var item of this.collection) {
            item.isChecked = false;
          }
          this.numChecked = 0;
        }
      }, {
        // proceed button
        text: 'OK',
        cssClass: 'alert-button',
        handler: () => { this.yesDeleteTracks(); }
      }]
    });
    await alert.present();
  }

  // 6. DISPLAY TRACK ///////////////////////////
  async displayTrack(active: boolean) {
    if (active) this.layerVisibility = 'archived'
    else this.layerVisibility = 'none' 
    this.router.navigate(['tab1']);
  }

  // 7. CONFIRM, YES, DELETE TRACKS ////////////////////////
  async yesDeleteTracks() {
    // Separate items into "to-remove" and "to-keep" categories
    const { toRemove, toKeep } = this.collection.reduce(
      (acc, item) => {
        item.isChecked ? acc.toRemove.push(item) : acc.toKeep.push(item);
        return acc;
      },
      { toRemove: [] as typeof this.collection, toKeep: [] as typeof this.collection }
    );
    // Update the collection and save the updated list
    this.collection = toKeep;
    await this.fs.storeSet('collection', this.collection);
    // Remove the selected items (batch operation if supported)
    for (const item of toRemove) {
      await this.fs.storeRem(JSON.stringify(item.date));
    }
    // Reset the count of checked items
    this.numChecked = 0;
    // inform
    await this.fs.displayToast('The selected tracks have been removed');
  }

  // 8. GEOJSON TO GPX //////////////////////
  async geoJsonToGpx(feature: any): Promise<string> {
    const formatDate = (timestamp: number): string => {
      const date = new Date(timestamp);
      const year = date.getUTCFullYear();
      const month = String(date.getUTCMonth() + 1).padStart(2, '0');
      const day = String(date.getUTCDate()).padStart(2, '0');
      const hours = String(date.getUTCHours()).padStart(2, '0');
      const minutes = String(date.getUTCMinutes()).padStart(2, '0');
      const seconds = String(date.getUTCSeconds()).padStart(2, '0');
      return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}Z`;
    };
    let gpxText = `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
      <gpx version="1.1" creator="elGros" 
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" 
        xmlns="http://www.topografix.com/GPX/1/1" 
        xsi:schemaLocation="http://www.topografix.com/GPX/1/1 
        http://www.topografix.com/GPX/1/1/gpx.xsd">
      <trk>
      <name>${feature.properties.name}</name>
      <trkseg>`;
    feature.geometry.coordinates.forEach((coordinate: number[], index: number) => {
      const time = feature.geometry.properties.data[index]?.time || Date.now();
      const altitude = feature.geometry.properties.data[index]?.altitude || 0;
      gpxText += `
        <trkpt lat="${coordinate[1]}" lon="${coordinate[0]}">
        <ele>${altitude}</ele>
        <time>${formatDate(time)}</time>
        </trkpt>`;
    });
    gpxText += `
      </trkseg>
      </trk>
      </gpx>`;
    return gpxText;
  }

  // 9. EXPORT TRACK //////////////////////////
  async exportTrack() {
    var track: Track | undefined;
    track = await this.fs.retrieveTrack();
    if (!track) return;
    await this.fs.uncheckAll();
    var gpxText = await this.geoJsonToGpx(track.features[0]);
    var file: string = track.features[0].properties.name.replaceAll(' ', '_') + '.gpx';
    try {
      // Write the file to the Data directory
      const result = await Filesystem.writeFile({
        path: file,
        data: gpxText,
        directory: Directory.External,
        encoding: Encoding.UTF8,
      });
      // Find file URI
      const fileUri = await Filesystem.getUri({
        path: file,
        directory: Directory.External,
      });
      await Share.share({
        title: 'Share a track',
        text: 'Here is the file you requested',
        url: fileUri.uri,
        dialogTitle: 'Share with Gmail only',
      });
      // Show success toast
      await this.fs.displayToast('Track exported and shared successfully!');
    } catch (e) {
      // Show error toast
      await this.fs.displayToast('Exportation failed.');
    }
  }

  // 10. DISPLAY ALL TRACKS ///////////////////////
  async displayAllTracks(active: boolean) {
    if (active) this.layerVisibility = 'multi'
    else this.layerVisibility = 'none'
    this.router.navigate(['tab1']);
  }

  // 11. ION VIEW WILL LEAVE
  ionViewWillLeave() {
    global.layerVisibility = this.layerVisibility
  }

  }
