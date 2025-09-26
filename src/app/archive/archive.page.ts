/**
 * Archive page component for managing archived tracks.
 *
 * Provides functionality to view, edit, delete, export, and display archived tracks,
 * including conversion to GPX format and sharing via device capabilities.
 * Integrates with translation, language, and storage services, and supports menu actions.
 * Handles UI state for checked tracks and layer visibility.
 */

import { Component } from '@angular/core';
import { AlertController } from '@ionic/angular';
import { TrackDefinition, Waypoint } from '../../globald';
import { SharedImports } from '../shared-imports';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { FunctionsService } from '../services/functions.service';
import { MapService } from '../services/map.service';
import { MenuController } from '@ionic/angular';
import { LanguageService } from '../services/language.service';
import { TranslateService } from '@ngx-translate/core';
import { SocialSharing } from '@awesome-cordova-plugins/social-sharing/ngx';
import JSZip from "jszip";

@Component({
    selector: 'app-archive',
    templateUrl: 'archive.page.html',
    imports: [SharedImports],
    styleUrls: ['archive.page.scss']
})
export class Tab2Page {

  numChecked: number = 0;
  visibleSearch: boolean = false;

  constructor(
    public fs: FunctionsService,
    public mapService: MapService,
    private alertController: AlertController,
    private menu: MenuController,
    private languageService: LanguageService,
    private translate: TranslateService,
    private socialSharing: SocialSharing,
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
    16. prepareImageExport()
    17. shareImages()
    18. cleanupGpxFiles()
  */

  // 1. ON VIEW DID ENTER ////////////
  async ionViewDidEnter() {
    this.visibleSearch = this.fs.searchLayer?.getVisible() || false;
    if (this.fs.buildTrackImage) await this.shareImages();
  }

  // 2. ON CHANGE, COUNT CHECKED ITEMS AND SAVE
  async onChange() {
    // Copute numChecked
    this.numChecked = this.fs.collection.filter((item: { isChecked: any; }) => item.isChecked).length;
    // Find the first checked item
    const firstCheckedItem = this.fs.collection.find((item: { isChecked: any; }) => item.isChecked);
    // Extract the date, or set to null if no checked item is found
    const firstCheckedDate = firstCheckedItem ? firstCheckedItem.date : null;
    this.fs.key = JSON.stringify(firstCheckedDate)
    console.log(this.numChecked)
  }

  // 3. EDIT TRACK DETAILS //////////////////////////////
  async editTrack() {
    // Find the index of the selected track
    const selectedIndex = this.fs.collection.findIndex((item: { isChecked: boolean }) => item.isChecked);
    if (selectedIndex >= 0) this.fs.editTrack(selectedIndex, '#ffbbbb', true);
  }

  // 4. DELETE TRACKS /////////////////////////////
  async deleteTracks() {
    //const cancel = this.translate.instant('ARCHIVE.CANCEL');
    const header = this.translate.instant('ARCHIVE.HEADER');
    const message = this.translate.instant('ARCHIVE.MESSAGE');
    // create alert control
    const alert = await this.alertController.create({
      cssClass: 'alert redAlert',
      header,
      message,
      buttons: [{
        text: this.translate.instant('SETTINGS.CANCEL'),
        role: 'cancel',
        cssClass: 'alert-cancel-button',
        handler: () => { this.resetSelection(); }
      }, {
        text: 'OK',
        cssClass: 'alert-ok-button',
        handler: () => { this.yesDeleteTracks(); }
      }]
    });
    await alert.present();
  }

  // 5. DISPLAY TRACK ///////////////////////////
  async displayTrack(active: boolean) {
    if (active) this.fs.layerVisibility = 'archived';
    else {
      this.fs.layerVisibility = 'none';
      await this.fs.uncheckAll();
    }
    this.fs.gotoPage('tab1');
  }

  // 6. CONFIRM, YES, DELETE TRACKS ////////////////////////
  async yesDeleteTracks() {
    // Separate items into "to-remove" and "to-keep" categories
    const { toRemove, toKeep } = this.fs.collection.reduce(
      (acc: { toRemove: any[]; toKeep: any[]; }, item: { isChecked: any; }) => {
        item.isChecked ? acc.toRemove.push(item) : acc.toKeep.push(item);
        return acc;
      },
      { toRemove: [] as typeof this.fs.collection, toKeep: [] as typeof this.fs.collection }
    );
    // Update the collection and save the updated list
    this.fs.collection = toKeep;
    await this.fs.storeSet('collection', this.fs.collection);
    // Remove the selected items (batch operation if supported)
    for (const item of toRemove) {
      await this.fs.storeRem(JSON.stringify(item.date));
    }
    // Reset the count of checked items
    this.numChecked = 0;
    this.fs.key = "null"
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

    // Generate KMZ file using geoJsonToKmz
    const base64Kmz = await this.geoJsonToKmz(track.features?.[0]);
    const kmzFile: string = `${sanitizedName}.kmz`;
    try {
      // Save gpx file into public Downloads folder
      const savedFile = await Filesystem.writeFile({
        path: file,       // 👈 goes into /storage/emulated/0/Download
        data: gpxText,
        directory: Directory.ExternalCache,
        recursive: true,
        encoding: Encoding.UTF8,
      });
      // Save kmz file into public Downloads folder
      const savedKmzFile = await Filesystem.writeFile({
        path: kmzFile,
        data: base64Kmz,
        directory: Directory.ExternalCache,
        recursive: true,
      });
      await this.socialSharing.shareWithOptions({
        //message: this.translate.instant('ARCHIVE.TEXT'),
        files: [savedFile.uri, savedKmzFile.uri],
        chooserTitle: this.translate.instant('ARCHIVE.DIALOG_TITLE')
      });
      // Cleanup files
      await this.cleanupGpxFiles(file);
      // Show success toast
      await this.fs.displayToast(this.translate.instant('ARCHIVE.TOAST1'));
    } catch (e) {
      // Show error toast
      await this.fs.displayToast(this.translate.instant('ARCHIVE.TOAST2'));
    }
  }

  // 9. DISPLAY ALL TRACKS ///////////////////////
  async displayAllTracks(active: boolean) {
    if (active) {
      // display all tracks
      await this.mapService.displayAllTracks({
        fs: this.fs,
        collection: this.fs.collection,
        multiFeature: this.fs.multiFeature,
        multiMarker: this.fs.multiMarker,
        greenPin: this.fs.greenPin,
        multiLayer: this.fs.multiLayer,
      });
      this.fs.layerVisibility = 'multi';
    }
    else this.fs.layerVisibility = 'none';
    this.fs.gotoPage('tab1');
  }

  // 10. ION VIEW WILL LEAVE
  async ionViewWillLeave() {
    await this.fs.storeSet('collection', this.fs.collection);
  }

  // 11. REMOVE SEARCH LAYER
  removeSearch() {
    this.fs.searchLayer?.setVisible(false);
    this.fs.gotoPage('tab1');
  }

  // 12. OPEN MENU ///////////////////////
  openMenu() {
    this.menu.open();
  }

  // 13. SELECT OPTION FROM MENU ////////////
  selectOption(option: string) {
    this.menu.close();
  }

  // 14. RESET SELECTION ///////////////
  async resetSelection() {
    await this.fs.uncheckAll();
    this.numChecked = 0;
    this.fs.key = "null";
  }

  // 15. ON INIT //////////////////////////////////////
  onInit() {
    const lang = this.languageService.getCurrentLanguage();
  }

  // 16. PREPARE IMAGE EXPORT //////////////////////////////
  async prepareImageExport() {
    // Inform tab1 on action to do
    this.fs.buildTrackImage = true;
    // Save current map provider
    this.fs.savedProvider = this.fs.mapProvider
    // Set map to avoid CORS
    await this.fs.storeSet('mapProvider', 'MapTiler_outdoor');
    // Display archived track
    await this.displayTrack(true);
  }

  // 17. SHARE IMAGES
  async shareImages() {
    try {
      // 1. Get file URIs from cache
      const mapFile = await Filesystem.getUri({
        path: 'map.png',
        directory: Directory.ExternalCache,
      });
      const slideFile = await Filesystem.getUri({
        path: 'data.png',
        directory: Directory.ExternalCache,
      });
      const mapUri = mapFile.uri;       // ✅ keep as-is
      const slideUri = slideFile.uri;   // ✅ keep as-is
      // 3. Try sharing both files with Capacitor Share
      try {
        await this.socialSharing.share(
          undefined,
          this.translate.instant('ARCHIVE.TEXT'),
          [mapUri, slideUri],
          undefined
        );
      } catch (shareErr) {
        console.warn('Multi-file share failed, falling back:', shareErr);
        //this.fs.buildTrackImage = false;
      }
      this.fs.buildTrackImage = false; // finish exportation
    } catch (err) {
      console.error('Failed to share images:', err);
    }
  }

  // 18. CLEANUP GPX FILES
  async cleanupGpxFiles(fileName: string) {
    try {
      const result = await Filesystem.readdir({
        path: '',
        directory: Directory.ExternalCache,
      });
      for (const file of result.files) {
        if (file.name.endsWith('.gpx') || file.name.endsWith('.GPX')) {
          if (file.name !== fileName) {
            await Filesystem.deleteFile({
              path: file.name,
              directory: Directory.ExternalCache,
            });
          }
        }
      }
      console.log('Cleanup finished.');
    } catch (err) {
      console.error('Error cleaning GPX files:', err);
    }
  }

  // GEOJSON TO KMZ //////////////////////
  async geoJsonToKmz(feature: any): Promise<string> {
    // Format timestamp into ISO 8601 format
    const formatDate = (timestamp: number): string => {
      const date = new Date(timestamp);
      return date.toISOString();
    };
    // Escape unsafe XML characters
    const escapeXml = (unsafe: string | undefined) =>
      (unsafe ?? '').replace(/[<>&'"]/g, c => ({
        '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;'
      }[c] as string));
    // Initialize KML text
    let kmlText = `<?xml version="1.0" encoding="UTF-8"?>
      <kml xmlns="http://www.opengis.net/kml/2.2">
        <Document>
          <name>${escapeXml(feature.properties?.name ?? "Track")}</name>`;
    console.log('kmltext ', kmlText)
    // Add waypoints
    if (feature.waypoints && feature.waypoints.length > 0) {
      feature.waypoints.forEach((wp: Waypoint) => {
        const { latitude, longitude, altitude = '', name = '', comment = '' } = wp;
        kmlText += `
          <Placemark>
            <name><![CDATA[${name.replace(/]]>/g, ']]]]><![CDATA[>')}]]></name>
            <description><![CDATA[${comment.replace(/]]>/g, ']]]]><![CDATA[>')}]]></description>
            <Point>
              <coordinates>${longitude},${latitude},${altitude}</coordinates>
            </Point>
          </Placemark>`;
      });
    }
    // Add track (LineString with timestamps as gx:Track if desired)
    kmlText += `
      <Placemark>
        <name>${escapeXml(feature.properties?.name ?? "Track")}</name>
        <LineString>
          <tessellate>1</tessellate>
          <coordinates>`;
    feature.geometry.coordinates.forEach((coordinate: number[], index: number) => {
      const altitude = feature.geometry.properties.data[index]?.altitude || 0;
      kmlText += `
        ${coordinate[0]},${coordinate[1]},${altitude}`;
    });
    kmlText += `
          </coordinates>
        </LineString>
      </Placemark>`;
    kmlText += `
        </Document>
      </kml>`;
    // Wrap into KMZ (ZIP)
    const zip = new JSZip();
    zip.file("doc.kml", kmlText);
    // return base64 string
    return await zip.generateAsync({ type: "base64" });
  }

}


