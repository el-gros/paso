import { Component } from '@angular/core';
import { ActionSheetController, PopoverController, IonicModule } from '@ionic/angular';
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
import { SaveTrackPopover } from '../save-track-popover.component';
import { jsPDF } from "jspdf";
import polyline from '@mapbox/polyline';
import { global } from '../../environments/environment';
import Map from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import OSM from 'ol/source/OSM';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import GeoJSON from 'ol/format/GeoJSON';
import { Style, Stroke } from 'ol/style';

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
    private popoverCtrl: PopoverController,
  ) {  }

  /* FUNCTIONS
    1. ionViewDidEnter()
    3. editTrack()
    5. displayTrack()

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

  // 3. EDIT TRACK DETAILS //////////////////////////////
  async editSpecificTrack(index: number, slidingItem: any) {
    if (slidingItem) slidingItem.close();
    await this.reference.editTrack(index);
  }


  // 5. DISPLAY TRACK ///////////////////////////
  async displayTrack(active: boolean) {
    if (active) {
      // retrieve archived track
      console.log('active?',active)
      this.reference.archivedTrack = await this.fs.retrieveTrack() ?? this.reference.archivedTrack;
      if (this.reference.archivedTrack) {
        await this.reference.displayArchivedTrack();
        await this.geography.setMapView(this.reference.archivedTrack);
      }
        
    }
    else {
      this.reference.archivedTrack = undefined;
      this.geography.archivedLayer?.getSource()?.clear();
    }
    await this.location.sendReferenceToPlugin()
    this.fs.gotoPage('tab1');
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

  // 8. EXPORT TRACK ////////////////////////// BO
  async exportTrackFile(item: any) {
    if (!item) return;

    const sanitize = (name: string) => (name ?? 'track').replace(/[^a-zA-Z0-9_\-\.]/g, '_');
    
    try {
      // 1. RECUPERAR LOS DATOS REALES (Puntos GPS)
      // Usamos la fecha como clave tal como indicas
      const storageKey = JSON.stringify(item.date);
      const trackData = await this.fs.storeGet(storageKey);

      if (!trackData) {
        await this.fs.displayToast(this.translate.instant('ARCHIVE.TOAST5'));
        return;
      }

      // 2. PREPARAR ARCHIVOS
      const safeName = sanitize(item.name || 'track');
      const gpxName = `${safeName}.gpx`;
      const kmzName = `${safeName}.kmz`;

      // 3. GENERAR CONTENIDOS
      // Asegúrate de pasar la feature (normalmente trackData.features[0])
      const featureToExport = trackData.features ? trackData.features[0] : trackData;
      
      const gpxText = await this.geoJsonToGpx(featureToExport);
      const base64Kmz = await this.geoJsonToKmz(featureToExport);

      // 4. GUARDAR EN CACHÉ TEMPORAL
      const savedGpx = await Filesystem.writeFile({
        path: gpxName,
        data: gpxText,
        directory: Directory.ExternalCache,
        encoding: Encoding.UTF8,
      });

      const savedKmz = await Filesystem.writeFile({
        path: kmzName,
        data: base64Kmz, 
        directory: Directory.ExternalCache,
      });

      // 5. COMPARTIR
      await this.socialSharing.shareWithOptions({
        files: [savedGpx.uri, savedKmz.uri],
        chooserTitle: this.translate.instant('ARCHIVE.DIALOG_TITLE')
      });

      await this.fs.displayToast(this.translate.instant('ARCHIVE.TOAST1'));

      // 6. LIMPIEZA
      setTimeout(async () => {
        try {
          await Filesystem.deleteFile({ path: gpxName, directory: Directory.ExternalCache });
          await Filesystem.deleteFile({ path: kmzName, directory: Directory.ExternalCache });
        } catch (err) { console.warn('Clean error', err); }
      }, 5000); // 5 segundos para dar tiempo extra a apps lentas

    } catch (e) {
      console.error('Export error:', e);
      await this.fs.displayToast(this.translate.instant('ARCHIVE.TOAST2'));
    }
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

  async displaySpecificTrack(item: any, slidingItem: any) {
    // 1. Limpieza de UI
    if (slidingItem) slidingItem.close();
    // 2. Carga de datos (Esto es rápido, se queda aquí)
    const trackData = await this.fs.storeGet(JSON.stringify(item.date));
    this.reference.archivedTrack = trackData;
    // 3. NAVEGAR PRIMERO
    this.fs.gotoPage('tab1');
    // 4. PEQUEÑA ESPERA (Crucial en Ionic/Capacitor)
    // Damos 150-200ms para que la animación de la pestaña termine
    await new Promise(r => setTimeout(r, 200));
    // 5. RENDERIZAR Y CENTRAR
    this.reference.displayArchivedTrack();
    await this.geography.setMapView(this.reference.archivedTrack);
    // 6. Sincronizar plugin en segundo plano
    await this.location.sendReferenceToPlugin();
  }

  async deleteSpecificTrack(index: number, slidingItem: any) {
    slidingItem.close();
    // You can show a confirmation alert here before deleting
    this.fs.collection.splice(index, 1);
    await this.fs.storeSet('collection', this.fs.collection);
    //this.onChange();
  }

  async hideSpecificTrack(slidingItem: any) {
    if (slidingItem) slidingItem.close();
    // Change this line from null to undefined
    this.reference.archivedTrack = undefined; 
    const source = this.geography.archivedLayer?.getSource();
    if (source) {
      source.clear();
    }
    await this.location.sendReferenceToPlugin()
    this.fs.gotoPage('tab1');    
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

  exportTrackDescription(index: number) {}

  async displayAllTracks(show: boolean) {
    try {
      if (show) {
        // Hide reference track (if it exists)
        if (this.reference.archivedTrack) {
          this.reference.archivedTrack = undefined;
          await this.location.sendReferenceToPlugin()
          this.geography.archivedLayer?.getSource()?.clear();
        }
        this.mapService.displayAllTracks(); 
        this.fs.displayToast(this.translate.instant('ARCHIVE.ALL_DISPLAYED'));
      } else {
        // Hide everything
        this.geography.archivedLayer?.getSource()?.clear();      
        this.fs.displayToast(this.translate.instant('ARCHIVE.ALL_HIDDEN'));
      }
      this.fs.gotoPage('tab1');
    }
    catch {
      console.error("Failed to update track display:", Error);
      // Optionally show an error toast to the user
    }
  }

  // 2. FUNCIÓN PRINCIPAL DE EXPORTACIÓN
async exportFullReport(item: any) {
  console.log("1. Iniciando exportación para:", item.name);
  try {
    // A. Recuperar datos (Punto crítico)
    const storageKey = JSON.stringify(item.date);
    const trackData = await this.fs.storeGet(storageKey);
    
    if (!trackData) {
      console.error("No hay datos en el storage para la clave:", storageKey);
      this.fs.displayToast("Error: No hay datos de GPS");
      return;
    }
    console.log("2. Datos recuperados con éxito");

    // B. Crear PDF básico (Sin imagen para descartar errores)
    const doc = new jsPDF();
    doc.text(`Ruta: ${item.name}`, 20, 20);
    doc.text(`Distancia: ${item.stats?.distance || '--'} km`, 20, 30);
    
    const pdfBase64 = doc.output('datauristring').split(',')[1];
    const safeName = "test_paso_" + Date.now();

    // C. Escribir archivo (Punto crítico)
    console.log("3. Escribiendo archivo PDF...");
    const savedPdf = await Filesystem.writeFile({
      path: `${safeName}.pdf`,
      data: pdfBase64,
      directory: Directory.ExternalCache
    });
    console.log("4. Archivo escrito en:", savedPdf.uri);

    // D. Compartir (Sin GPX de momento, solo el PDF)
    console.log("5. Intentando abrir Social Sharing...");
    await this.socialSharing.share(
      "Informe de mi ruta",
      "App Paso",
      [savedPdf.uri]
    );
    console.log("6. Selector de compartir abierto");

  } catch (err) {
    // Esto nos dirá exactamente qué línea falla
    console.error("ERROR CRÍTICO:", err);
    this.fs.displayToast("Error interno: " + err);
  }
}

  // 3. GENERADOR DE IMAGEN (OPENLAYERS)
private async generateMapImage(trackData: any): Promise<string> {
  return new Promise((resolve) => {
    try {
      const vectorSource = new VectorSource({
        features: new GeoJSON().readFeatures(trackData, {
          featureProjection: 'EPSG:3857'
        })
      });

      const mapExport = new Map({
        target: 'map-export',
        layers: [
          new TileLayer({ 
            // ESTO ES LO MÁS IMPORTANTE PARA QUE NO FALLE EL PDF
            source: new OSM({ crossOrigin: 'anonymous' }) 
          }),
          new VectorLayer({
            source: vectorSource,
            style: new Style({ stroke: new Stroke({ color: '#ff0000', width: 4 }) })
          })
        ],
        view: new View({ padding: [30, 30, 30, 30] })
      });

      mapExport.getView().fit(vectorSource.getExtent());

      mapExport.once('rendercomplete', () => {
        const size = mapExport.getSize();
        const mapCanvas = document.createElement('canvas');
        if (!size) { resolve(''); return; }
        
        mapCanvas.width = size[0];
        mapCanvas.height = size[1];
        const mapContext = mapCanvas.getContext('2d');
        if (!mapContext) { resolve(''); return; }

        // Recogemos todos los canvas generados por OpenLayers
        const canvases = document.querySelectorAll('#map-export .ol-layer canvas');
        canvases.forEach((canvas: any) => {
          mapContext.drawImage(canvas, 0, 0);
        });

        const data = mapCanvas.toDataURL('image/jpeg', 0.7); // Bajamos calidad a 0.7 para que el archivo sea más ligero
        mapExport.setTarget(undefined);
        resolve(data);
      });
    } catch (e) {
      resolve('');
    }
  });
}

}