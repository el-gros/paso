import { Component } from '@angular/core';
import { ActionSheetController, IonicModule } from '@ionic/angular';
import { TrackDefinition, Waypoint } from '../../globald';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { FunctionsService } from '../services/functions.service';
import { ReferenceService } from '../services/reference.service';
import { MapService } from '../services/map.service';
import { MenuController } from '@ionic/angular';
import { LanguageService } from '../services/language.service';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { SocialSharing } from '@awesome-cordova-plugins/social-sharing/ngx';
import JSZip from "jszip";
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GeographyService } from '../services/geography.service';
import { LocationManagerService } from '../services/location-manager.service';

@Component({
    standalone: true,
    selector: 'app-archive',
    templateUrl: 'archive.page.html',
    imports: [
      [IonicModule, CommonModule, FormsModule, TranslateModule]
    ],
    styleUrls: ['archive.page.scss']
})
export class ArchivePage {

  numChecked: number = 0;
  isConfirmDeletionOpen: boolean = false;
  index: number = NaN;
  slidingItem: any = undefined;

  constructor(
    public fs: FunctionsService,
    public mapService: MapService,
    private menu: MenuController,
    private languageService: LanguageService,
    private translate: TranslateService,
    private socialSharing: SocialSharing,
    public reference: ReferenceService,
    public geography: GeographyService,
    public location: LocationManagerService,
    private actionSheetCtrl: ActionSheetController,
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

    15. onInit()
    16. prepareImageExport()
    17. shareImages()
    18. cleanupGpxFiles()
  */

  // 1. ON VIEW DID ENTER ////////////
  async ionViewDidEnter() {
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


  // 5. DISPLAY TRACK ///////////////////////////
  async displayTrack(active: boolean) {
    if (active) {
      // retrieve archived track
      console.log('active?',active)
      this.reference.archivedTrack = await this.fs.retrieveTrack() ?? this.reference.archivedTrack;
      if (this.reference.archivedTrack) await this.reference.displayArchivedTrack();
    }
    else {
      this.reference.archivedTrack = undefined;
      this.geography.archivedLayer?.getSource()?.clear();
    }
    await this.location.sendReferenceToPlugin()
    this.fs.uncheckAll();
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
    await this.fs.uncheckAll();
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

  /*
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
    this.menu.close();
  }
  */  

  // 9. DISPLAY ALL TRACKS ///////////////////////
  async displayAllTracks(active: boolean) {
    this.reference.archivedTrack = undefined;
    await this.location.sendReferenceToPlugin()
    this.geography.archivedLayer?.getSource()?.clear();
    this.fs.uncheckAll();
    this.fs.gotoPage('tab1');
    if (active) await this.mapService.displayAllTracks();
  }

  // 10. ION VIEW WILL LEAVE
  async ionViewWillLeave() {
    await this.fs.storeSet('collection', this.fs.collection);
  }

  // 11. REMOVE SEARCH LAYER
  removeSearch() {
    this.geography.searchLayer?.getSource()?.clear();
    this.fs.uncheckAll();
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

  // 15. ON INIT //////////////////////////////////////
  onInit() {
    const lang = this.languageService.getCurrentLanguage();
  }

  // 16. PREPARE IMAGE EXPORT //////////////////////////////
  async prepareImageExport() {
    // Inform tab1 on action to do
    this.fs.buildTrackImage = true;
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

  // Helper to toggle checkbox if user clicks the label text
  toggleCheck(item: any) {
    item.isChecked = !item.isChecked;
    this.onChange();
  }

  async displaySpecificTrack(item: any, slidingItem: any) {
    slidingItem.close(); // Close the swipe menu
    
    // Logic: Uncheck everything else, check this one, and show it
    this.fs.collection.forEach(t => t.isChecked = false);
    item.isChecked = true;
    this.onChange();
    
    await this.displayTrack(true);
  }

  async editSpecificTrack(index: number, slidingItem: any) {
    slidingItem.close();
    // Call your existing edit function directly using the index
    await this.fs.editTrack(index, '#ffffbb', false);
  }

  async deleteSpecificTrack(index: number, slidingItem: any) {
    slidingItem.close();
    // You can show a confirmation alert here before deleting
    this.fs.collection.splice(index, 1);
    await this.fs.storeSet('collection', this.fs.collection);
    this.onChange();
  }

  async hideSpecificTrack(slidingItem: any) {
    if (slidingItem) slidingItem.close();
    
    // Change this line from null to undefined
    this.reference.archivedTrack = undefined; 
    
    const source = this.geography.archivedLayer?.getSource();
    if (source) {
      source.clear();
    }
    
    this.onChange();
  }

  isTrackVisible(item: any): boolean {
    // 1. Safety check: Is there even an archived track loaded?
    if (!this.reference.archivedTrack) return false;

    // 2. Extract the dates safely
    const activeDate = this.reference.archivedTrack.features?.[0]?.properties?.date;
    const itemDate = item.date;

    // 3. Type Guard: If either date is missing, they can't be a match
    if (!activeDate || !itemDate) return false;

    // 4. Compare timestamps (this works whether the input is a string or Date object)
    return new Date(activeDate).getTime() === new Date(itemDate).getTime();
  }

  async toggleVisibility(item: any, slidingItem: any) {
    if (this.isTrackVisible(item)) {
      await this.hideSpecificTrack(slidingItem);
    } else {
      await this.displaySpecificTrack(item, slidingItem);
    }
  }

  confirmDeletion(index: number, slidingItem: any) {
    this.isConfirmDeletionOpen = true;
    this.index = index;
    this.slidingItem = slidingItem;
  }

  async deleteTrack() {
    await this.deleteSpecificTrack(this.index, this.slidingItem);
  }

  /**
   * Export Options (File vs Description)
   */
  async presentExportOptions(item: any, slidingItem: any) {
    slidingItem.close();
    
    const actionSheet = await this.actionSheetCtrl.create({
      header: this.translate.instant('ARCHIVE.EXPORT_TITLE'),
      buttons: [
        {
          text: this.translate.instant('ARCHIVE.EXPORT_FILE'),
          icon: 'document-outline',
          handler: () => { this.exportTrackFile(item); }
        },
        {
          text: this.translate.instant('ARCHIVE.EXPORT_DESCRIPTION'),
          icon: 'text-outline',
          handler: () => { this.exportTrackDescription(item); }
        },
        {
          text: this.translate.instant('COMMON.CANCEL'),
          role: 'cancel'
        }
      ]
    });
    await actionSheet.present();
  }

  exportTrackFile(index: number) {}

  exportTrackDescription(index: number) {}

}


