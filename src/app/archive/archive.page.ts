/**
 * Archive page component for managing archived tracks.
 *
 * Provides functionality to view, edit, delete, export, and display archived tracks,
 * including conversion to GPX format and sharing via device capabilities.
 * Integrates with translation, language, and storage services, and supports menu actions.
 * Handles UI state for checked tracks and layer visibility.
 */

import { Component } from '@angular/core';
import { IonicModule, AlertController } from '@ionic/angular';
import { TrackDefinition, Waypoint } from '../../globald';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { global } from '../../environments/environment';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { FunctionsService } from '../services/functions.service';
import { MenuController } from '@ionic/angular';
import { LanguageService } from '../services/language.service';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

@Component({
    selector: 'app-archive',
    templateUrl: 'archive.page.html',
    styleUrls: ['archive.page.scss'],
    imports: [CommonModule, IonicModule, FormsModule, TranslateModule]
})
export class Tab2Page {

  numChecked: number = 0;
  get layerVisibility(): string { return global.layerVisibility; }
  get presentSearch(): boolean { return global.presentSearch; }
  get archivedPresent(): boolean { return global.archivedPresent; }
  get collection(): TrackDefinition[] { return global.collection}

  constructor(
    public fs: FunctionsService,
    private alertController: AlertController,
    private menu: MenuController,
    private languageService: LanguageService,
    private translate: TranslateService
  ) {  }

  /* FUNCTIONS
    1. ionViewDidEnter()
    2. onChange()
    3. editTrack()
    4. deleteTracks()
    5. displayTrack()
    6. yesDeleteTracks()
    7. geoJsonToGpx()
    8.  exportTrack()
    9. displayAllTracks()
    10. ionViewWillLeave()
    11. removeSearch()
    12. openMenu()
    13. selectOption()
    14. resetSelection()
    15. onInit()
  */

  // 1. ON VIEW DID ENTER ////////////
  async ionViewDidEnter() {
    try {
      if (global.collection.length <= 0) {
        const collection = await this.fs.storeGet('collection');
        global.collection = collection || [];
      }
      this.resetSelection();
    } catch (error) {
      await this.fs.displayToast(this.translate.instant('ARCHIVE.TOAST4'));
      console.error('ionViewDidEnter error:', error);
    }
    if (global.buildTrackImage) await this.shareImages();
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

  // 4. DELETE TRACKS /////////////////////////////
  async deleteTracks() {
    const cancel = this.translate.instant('ARCHIVE.CANCEL');
    const header = this.translate.instant('ARCHIVE.HEADER');
    const message = this.translate.instant('ARCHIVE.MESSAGE');
    // create alert control
    const alert = await this.alertController.create({
      cssClass: 'alert redAlert',
      header,
      message,
      buttons: [{
        text: cancel,
        role: 'cancel',
        cssClass: 'alert-cancel-button',
        handler: () => { this.resetSelection(); }
      }, {
        text: 'OK',
        cssClass: 'alert-ok-button',
        handler: () => { this.yesDeleteTracks(); }
      }]
    });    await alert.present();
  }

  // 5. DISPLAY TRACK ///////////////////////////
  async displayTrack(active: boolean) {
    if (active) global.layerVisibility = 'archived'
    else global.layerVisibility = 'none'
    this.fs.gotoPage('tab1');
  }

  // 6. CONFIRM, YES, DELETE TRACKS ////////////////////////
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
    await this.fs.displayToast(this.translate.instant('ARCHIVE.TOAST3'));
  }

  // 7. GEOJSON TO GPX //////////////////////
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
      const escapeXml = (unsafe: string | undefined) =>
        (unsafe ?? '').replace(/[<>&'"]/g, c => ({
          '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;'
        }[c] as string));
      feature.waypoints.forEach((wp: Waypoint) => {
        const { latitude, longitude, altitude = '', name = '', comment = '' } = wp;
        gpxText += `
          <wpt lat="${latitude}" lon="${longitude}">
            <ele>${escapeXml(String(altitude))}</ele>
            <name><![CDATA[${name.replace(/]]>/g, ']]]]><![CDATA[>')}]]></name>
            <cmt><![CDATA[${comment.replace(/]]>/g, ']]]]><![CDATA[>')}]]></cmt>
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

  // 8. EXPORT TRACK //////////////////////////
  async exportTrackFile() {
    // Helper to sanitize file names for cross-platform compatibility
    const sanitizeFilename = (name: string): string =>
      (name ?? 'track').replace(/[^a-zA-Z0-9_\-\.]/g, '_');
    const dialog_title = this.translate.instant('ARCHIVE.DIALOG_TITLE');
    const track = await this.fs.retrieveTrack();
    if (!track) {
      await this.fs.displayToast(this.translate.instant('ARCHIVE.TOAST5'));
      return;
    }
    await this.fs.uncheckAll();
    var gpxText = await this.geoJsonToGpx(track.features?.[0]);
    const sanitizedName = sanitizeFilename(track.features?.[0]?.properties?.name.replaceAll(' ', '_'));
    const file: string = `${sanitizedName}.gpx`;
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
        title: this.translate.instant('ARCHIVE.TITLE'),
        text: this.translate.instant('ARCHIVE.TEXT'),
        url: fileUri.uri,
        dialogTitle: dialog_title
      });
      // Show success toast
      await this.fs.displayToast(this.translate.instant('ARCHIVE.TOAST1'));
    } catch (e) {
      // Show error toast
      await this.fs.displayToast(this.translate.instant('ARCHIVE.TOAST2'));
    }
  }

  // 9. DISPLAY ALL TRACKS ///////////////////////
  async displayAllTracks(active: boolean) {
    if (active) global.layerVisibility = 'multi'
    else global.layerVisibility = 'none'
    this.fs.gotoPage('tab1');
  }

  // 10. ION VIEW WILL LEAVE
  async ionViewWillLeave() {
    await this.fs.storeSet('collection', global.collection);
  }

  // 11. REMOVE SEARCH LAYER
  removeSearch() {
    global.removeSearch = true;
    this.fs.gotoPage('tab1');
  }

  // 12. OPEN MENU ///////////////////////
  openMenu() {
    this.menu.open();
  }

  // 13. SELECT OPTION FROM MENU ////////////
  selectOption(option: string) {
    console.log('Selected:', option);
    this.menu.close();
  }

  // 14. RESET SELECTION ///////////////
  async resetSelection() {
    await this.fs.uncheckAll();
    this.numChecked = 0;
    global.key = "null";
  }

  // 15. ON INIT //////////////////////////////////////
  onInit() {
    const lang = this.languageService.getCurrentLanguage();
  }

  async prepareImageExport() {
    // Inform tab1 on action to do
    global.buildTrackImage = true;
    // Display archived track
    await this.displayTrack(true);
  }

  async shareImages() {
    try {
      // Get file URIs from cache
      const mapFile = await Filesystem.getUri({
        path: 'map.png',
        directory: Directory.Cache,
      });
      const slideFile = await Filesystem.getUri({
        path: 'data.png',
        directory: Directory.Cache,
      });
      // Share both
      await Share.share({
        title: this.translate.instant('ARCHIVE.TITLE'),
        text: this.translate.instant('ARCHIVE.TEXT'),
        dialogTitle: 'Share images',
        files: [mapFile.uri, slideFile.uri], // send both files
      });
      // Cleanup (optional, if you don’t need them afterwards)
      await Filesystem.deleteFile({ path: 'map.png', directory: Directory.Cache });
      await Filesystem.deleteFile({ path: 'data.png', directory: Directory.Cache });
    } catch (err) {
      console.error('Failed to share images:', err);
    }
  }

}
