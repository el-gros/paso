import { Component, Injectable } from '@angular/core';
import { IonicModule, AlertController } from '@ionic/angular';
import { Track, TrackDefinition, Waypoint } from '../../globald';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { global } from '../../environments/environment';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { FunctionsService } from '../services/functions.service';
import { Capacitor } from '@capacitor/core';
import { MenuController } from '@ionic/angular';

@Component({
    selector: 'app-tab2',
    templateUrl: 'tab2.page.html',
    styleUrls: ['tab2.page.scss'],
    imports: [CommonModule, IonicModule, FormsModule]
})
export class Tab2Page {

  numChecked: number = 0;
  num: number = 0;
  title = ['Trajectes','Trayectos', 'Tracks'];
  export = ['EXPORTAR TRAJECTE','EXPORTAR TRAYECTO','EXPORT TRACK'];
  all = ['MOSTRAR TOTS','MOSTRAR TODOS','DISPLAY ALL'];
  hideAll = ['AMAGAR TOTS','ESCONDER TODOS','HIDE ALL'];
  remove = ['ESBORRAR TRAJECTES','ELIMINAR TRAYECTOS','REMOVE TRACKS'];
  edit = ['EDITAR TRAJECTE','EDITAR TRAYECTO','EDIT TRACK'];
  hide = ['AMAGAR REFERÈNCIA','ESCONDER REFERENCIA','HIDE REFERENCE'];
  display = ['MOSTRAR REFERÈNCIA','MOSTRAR REFERENCIA','SHOW REFERENCE'];
  search = ['ESBORRAR CERCA', 'BORRAR BÚSQUEDA', 'REMOVE SEARCH'];
  get languageIndex(): number { return global.languageIndex; }
  get layerVisibility(): string { return global.layerVisibility; }
  get presentSearch(): boolean { return global.presentSearch; }
  get archivedPresent(): boolean { return global.archivedPresent; }
  get collection(): TrackDefinition[] { return global.collection}

  constructor(
    public fs: FunctionsService,
    private alertController: AlertController,
    private router: Router,
    private menu: MenuController
  ) {  }

  /* FUNCTIONS
    1. ionViewDidEnter()
    2. onChange()
    3. editTrack()
    4. -----
    5. deleteTracks()
    6. displayTrack()
    7. yesDeleteTracks()
    8. geoJsonToGpx()
    9.  exportTrack()
    10. displayAllTracks()
    11. ionViewWillLeave()
    12. removeSearch()
  */

  // 1. ON VIEW DID ENTER ////////////
  async ionViewDidEnter() {
    // retrieve collection (just in case)
    if (global.collection.length <= 0) global.collection = await this.fs.storeGet('collection') || [];
    // retrieve collection and uncheck all tracks
    for (const item of global.collection) item.isChecked = false;
    this.numChecked = 0;
    global.key = "null"
  }

  // 2. ON CHANGE, COUNT CHECKED ITEMS AND SAVE
  async onChange() {
    // Copute numChecked
    this.numChecked = global.collection.filter((item: { isChecked: any; }) => item.isChecked).length;
    // Find the first checked item
    const firstCheckedItem = global.collection.find((item: { isChecked: any; }) => item.isChecked);
    // Extract the date, or set to null if no checked item is found
    const firstCheckedDate = firstCheckedItem ? firstCheckedItem.date : null;
    global.key = JSON.stringify(firstCheckedDate)
  }

  // 3. EDIT TRACK DETAILS //////////////////////////////
  async editTrack() {
    // Find the index of the selected track
    const selectedIndex = global.collection.findIndex((item: { isChecked: boolean }) => item.isChecked);
    if (selectedIndex >= 0) this.fs.editTrack(selectedIndex, '#ffbbbb', true);
  }

  // 5. DELETE TRACK(S) //////////////////////////
  async deleteTracks() {
    const cancel = ['Cancel.lar', 'Cancelar', 'Cancel'];
    const headers = ["Confirma l'esborrat", "Confirma el borrado","Confirm deletion"];
    const messages = ["S'esborraran definitivament els trajectes marcats", "Se borrarán definitivamente los trayectos marcados",
      "The selected track(s) will be definitely removed"];
    // create alert control
    const alert = await this.alertController.create({
      cssClass: 'alert redAlert',
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
          for (var item of global.collection) {
            item.isChecked = false;
          }
          this.numChecked = 0;
          global.key = "null"
        }
      }, {
        // proceed button
        text: 'OK',
        cssClass: 'alert-ok-button',
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
    const { toRemove, toKeep } = global.collection.reduce(
      (acc: { toRemove: any[]; toKeep: any[]; }, item: { isChecked: any; }) => {
        item.isChecked ? acc.toRemove.push(item) : acc.toKeep.push(item);
        return acc;
      },
      { toRemove: [] as typeof global.collection, toKeep: [] as typeof global.collection }
    );
    // Update the collection and save the updated list
    global.collection = toKeep;
    //this.collection = global.collection;
    await this.fs.storeSet('collection', global.collection);
    // Remove the selected items (batch operation if supported)
    for (const item of toRemove) {
      await this.fs.storeRem(JSON.stringify(item.date));
    }
    // Reset the count of checked items
    this.numChecked = 0;
    global.key = "null"
    // informretrievetrack
    const toast = ["S'han esborrat els trajectes seleccionats",'Se han borrado los trayectos seleccionados','The selected tracks have been removed'];
    await this.fs.displayToast(toast[global.languageIndex]);
  }

  // 8. GEOJSON TO GPX //////////////////////
  async geoJsonToGpx(feature: any): Promise<string> {
    // Format timestamp into ISO 8601 format
    const formatDate = (timestamp: number): string => {
      const date = new Date(timestamp);
      return date.toISOString();
    };
    // Initialize GPX text
    let gpxText = `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
      <gpx version="1.1" creator="elGros"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xmlns="http://www.topografix.com/GPX/1/1"
        xsi:schemaLocation="http://www.topografix.com/GPX/1/1
        http://www.topografix.com/GPX/1/1/gpx.xsd">`
    // Add waypoints
    if (feature.waypoints && feature.waypoints.length > 0) {
      feature.waypoints.forEach((wp: Waypoint) => {
        const { latitude, longitude, altitude = '', name = '', comment = '' } = wp;
        gpxText += `
          <wpt lat="${latitude}" lon="${longitude}">
            <ele>${altitude}</ele>
            <name><![CDATA[${name}]]></name>
            <cmt><![CDATA[${comment}]]></cmt>
          </wpt>`;
      });
    }
    gpxText += `
      <trk><name>${feature.properties.name}</name><trkseg>`;
    feature.geometry.coordinates.forEach((coordinate: number[], index: number) => {
      const time = feature.geometry.properties.data[index]?.time || Date.now();
      const altitude = feature.geometry.properties.data[index]?.altitude || 0;
      gpxText += `<trkpt lat="${coordinate[1]}" lon="${coordinate[0]}">
        <ele>${altitude}</ele><time>${formatDate(time)}</time></trkpt>`;
    });
    gpxText += `</trkseg></trk></gpx>`;
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

  // 11. ION VIEW WILL LEAVE
  async ionViewWillLeave() {
    await this.fs.storeSet('collection', global.collection);
  }

  // 12. REMOVE SEARCH LAYER
  removeSearch() {
    global.removeSearch = true;
    this.router.navigate(['tab1']);
  }

  openMenu() {
    this.menu.open();
  }

  selectOption(option: string) {
    console.log('Selected:', option);
    this.menu.close();
  }

}
