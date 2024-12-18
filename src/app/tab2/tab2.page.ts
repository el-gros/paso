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
import { EditModalComponent } from '../edit-modal/edit-modal.component';
import { ModalController } from '@ionic/angular';

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
  num: number = 0;
  archivedPresent: boolean = global.archivedPresent
  translations = {
    title: ['Trajectes','Trayectos', 'Tracks'],
    export: ['EXPORTAR TRAJECTE','EXPORTAR TRAYECTO','EXPORT TRACK'],
    all: ['MOSTRAR TOTS','MOSTRAR TODOS','DISPLAY ALL'],
    hideAll: ['AMAGAR TOTS','ESCONDER TODOS','HIDE ALL'],
    remove: ['ESBORRAR TRAJECTES','ELIMINAR TRAYECTOS','REMOVE TRACKS'],
    edit: ['EDITAR TRAJECTE','EDITAR TRAYECTO','EDIT TRACK'],
    hide: ['AMAGAR REFERÈNCIA','ESCONDER REFERENCIA','HIDE REFERENCE'],
    display: ['MOSTRAR REFERÈNCIA','MOSTRAR REFERENCIA','SHOW REFERENCE'],
  }
  get title(): string { return this.translations.title[global.languageIndex]; }
  get export(): string { return this.translations.export[global.languageIndex]; }
  get all(): string { return this.translations.all[global.languageIndex]; }
  get hideAll(): string { return this.translations.hideAll[global.languageIndex]; }
  get remove(): string { return this.translations.remove[global.languageIndex]; }
  get edit(): string { return this.translations.edit[global.languageIndex]; }
  get hide(): string { return this.translations.hide[global.languageIndex]; }
  get display(): string { return this.translations.display[global.languageIndex]; }
  get layerVisibility(): string { return global.layerVisibility; }
  
  constructor(
    public fs: FunctionsService,
    private alertController: AlertController,
    private router: Router,
    private socialSharing: SocialSharing,
    private modalController: ModalController,
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
  */

  // 1. ON VIEW DID ENTER ////////////
  async ionViewDidEnter() {
    // Initialize variables
    //this.layerVisibility = global.layerVisibility;
    this.archivedPresent = global.archivedPresent
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
    const name = this.collection[index].name || ''
    const place = this.collection[index].place || ''
    let description = this.collection[index].description || ''
    description = description.replace("<![CDATA[", "").replace("]]>", "").replace(/\n/g, '<br>');
    const modalEdit = {name: name, place: place, description: description}
    const modal = await this.modalController.create({
      component: EditModalComponent,
      componentProps: { modalEdit },
      cssClass: 'description-modal-class',
      backdropDismiss: true, // Allows dismissal by tapping the backdrop
    });
    await modal.present();
    modal.onDidDismiss().then(async (result) => {
      if (result.data) {
        const { action, name, place, description } = result.data;
        if (action === 'ok' ) {
          this.collection[index].name = result.data.name;
          this.collection[index].place = result.data.place;
          this.collection[index].description = result.data.description;
          const key = this.collection[index].date
          await this.fs.storeSet('collection', this.collection)
          const track = await this.fs.storeGet(JSON.stringify(key));
          if (track) {
            track.features[0].properties.name = result.data.name;
            track.features[0].properties.place = result.data.place;
            track.features[0].properties.descriprion = result.data.description;
            await this.fs.storeSet(JSON.stringify(key), track);
          }
        }
      }
    });
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
    const cancel = ['Cancel.lar', 'Cancelar', 'Cancel']; 
    const headers = ["Confirma l'esborrat", "Confirma el borrado","Confirm deletion"];
    const messages = ["S'esborraran definitivament els trajectes marcats", "Se borrarán definitivamente los trayectos marcados",
      "The selected track(s) will be definitely removed"];
    // create alert control
    const alert = await this.alertController.create({
      cssClass: 'alert greenAlert',
      // header and message
      header: headers[global.languageIndex],
      message: messages[global.languageIndex],
      // buttons
      buttons: [{
        // cancel button
        text: cancel[global.languageIndex],
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
    if (active) global.layerVisibility = 'archived'
    else global.layerVisibility = 'none' 
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
    const toast = ["S'han esborrat els trajectes seleccionats",'Se han borrado los trayectos seleccionados','The selected tracks have been removed'];
    await this.fs.displayToast(toast[global.languageIndex]);
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
    const dialogTitles = ['Compartiu només per Gmail','Compartir sólo por Gail','Share with Gmail only']
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
      const titles = ['Compartir un trajecte', 'Compartir un trayexto', 'Share a track'];
      const texts = ['Aquí teniu el trajecte sol.licitat', 'Este es el trayecto solicitado', 'Here is the file you requested']
      await Share.share({
        title: titles[global.languageIndex],
        text: texts[global.languageIndex],
        url: fileUri.uri,
        dialogTitle: dialogTitles[global.languageIndex],
      });
      // Show success toast
      const toast = ["S'ha compartit correctament el trajecte",'El trayecto se ha compartido correctamente','Track exported and shared successfully!']
      await this.fs.displayToast(toast[global.languageIndex]);
    } catch (e) {
      // Show error toast
      const toast = ["L'exportació ha fallat", 'Ha fallado la exportación','Exportation failed']
      await this.fs.displayToast(toast[global.languageIndex]);
    }
  }

  // 10. DISPLAY ALL TRACKS ///////////////////////
  async displayAllTracks(active: boolean) {
    if (active) global.layerVisibility = 'multi'
    else global.layerVisibility = 'none'
    this.router.navigate(['tab1']);
  }

  }
