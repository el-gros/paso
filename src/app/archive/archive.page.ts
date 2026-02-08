import { Component } from '@angular/core';
import { ActionSheetController, PopoverController, IonicModule } from '@ionic/angular';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { FunctionsService } from '../services/functions.service';
import { ReferenceService } from '../services/reference.service';
import { MapService } from '../services/map.service';
import { LanguageService } from '../services/language.service';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { SocialSharing } from '@awesome-cordova-plugins/social-sharing/ngx';
import JSZip from "jszip";
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GeographyService } from '../services/geography.service';
import { LocationManagerService } from '../services/location-manager.service';
import { jsPDF } from "jspdf";
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

  isConfirmDeletionOpen: boolean = false;
  index: number = NaN;
  slidingItem: any = undefined;

  constructor(
    public fs: FunctionsService,
    public mapService: MapService,
    private languageService: LanguageService,
    private translate: TranslateService,
    private socialSharing: SocialSharing,
    public reference: ReferenceService,
    public geography: GeographyService,
    public location: LocationManagerService,
  ) {  }

  /* FUNCTIONS
    1. ionViewDidEnter()
    2. editSpecificTrack()
    3. displayTrack()
    4. geoJsonToGpx()
    5. exportTrack()
    6. onInit()
    7. prepareImageExport()
    8. shareImages()    
    9. geojsonToKmz()
    10. displaySpecificTrack()
    11. deleteSpecificTrack()
    12. hideSpecificTrack()
    13. isTrackVisible()
    14. toggleVisibility()
    15. confirmDeletion()
    16. deleteTrack()
    17. displayAllTracks()
  */

  // 1. ON VIEW DID ENTER ////////////
  async ionViewDidEnter() {
    if (this.fs.buildTrackImage) await this.shareImages();
  }

  // 2. EDIT TRACK DETAILS //////////////////////////////
  async editSpecificTrack(index: number, slidingItem: any) {
    if (slidingItem) slidingItem.close();
    await this.reference.editTrack(index);
  }

  // 3. DISPLAY TRACK ///////////////////////////
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
      this.reference.clearArchivedTrack();
    }
    await this.location.sendReferenceToPlugin()
    this.fs.gotoPage('tab1');
  }

  // 4. GEOJSON TO GPX //////////////////////
  async geoJsonToGpx(feature: any): Promise<string> {
    // Formateador de fecha ISO
    const formatDate = (timestamp: number): string => new Date(timestamp).toISOString();
    // Helper para escapar caracteres XML prohibidos
    const escapeXml = (unsafe: string | undefined) =>
      (unsafe ?? '').replace(/[<>&'"]/g, c => ({
        '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;'
      }[c] as string));
    // Cabecera estándar GPX 1.1
    let gpxText = `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
    <gpx version="1.1" creator="elGros"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xmlns="http://www.topografix.com/GPX/1/1"
    xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">`;
    // 1. WAYPOINTS (Opcionales)
    if (feature.waypoints && feature.waypoints.length > 0) {
      feature.waypoints.forEach((wp: any) => {
        const { latitude, longitude, altitude, name = '', comment = '' } = wp;
        gpxText += `\n  <wpt lat="${latitude}" lon="${longitude}">`;
        // Solo añadimos la etiqueta <ele> si hay un valor válido
        if (altitude !== undefined && altitude !== null && altitude !== '') {
          gpxText += `\n    <ele>${altitude}</ele>`;
        }
        gpxText += `\n    <name><![CDATA[${name.replace(/]]>/g, ']]]]><![CDATA[>')}]]></name>`;
        gpxText += `\n    <cmt><![CDATA[${comment.replace(/]]>/g, ']]]]><![CDATA[>')}]]></cmt>`;
        gpxText += `\n  </wpt>`;
      });
    }
    // 2. TRACK
    const trackName = escapeXml(feature.properties?.name || 'Track');
    gpxText += `\n  <trk>\n    <name>${trackName}</name>\n    <trkseg>`;
    // 3. PUNTOS DEL TRACK (trkpt)
    feature.geometry.coordinates.forEach((coordinate: number[], index: number) => {
      // Mantenemos tu ruta específica de datos
      const dataPoint = feature.geometry.properties?.data?.[index];
      const time = dataPoint?.time || Date.now();
      const altitude = dataPoint?.altitude;
      gpxText += `\n      <trkpt lat="${coordinate[1]}" lon="${coordinate[0]}">`;
      // Etiqueta de altitud condicional para los puntos del track
      if (altitude !== undefined && altitude !== null) {
        gpxText += `\n        <ele>${altitude}</ele>`;
      }
      gpxText += `\n        <time>${formatDate(time)}</time>`;
      gpxText += `\n      </trkpt>`;
    });
    gpxText += `\n    </trkseg>\n  </trk>\n</gpx>`;
    return gpxText;
  }

  // 5. EXPORT TRACK ////////////////////////// BO
  async exportTrackFile(item: any, slidingItem: { close: () => void; }) {
    if (!item) return;
    const sanitize = (name: string) => (name ?? 'track').replace(/[^a-zA-Z0-9_\-\.]/g, '_');
    try {
      // 1. RECUPERAR LOS DATOS REALES (Puntos GPS)
      // Usamos la fecha como clave tal como indicas
      const storageKey = item.date.toISOString();
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
    // 1. Limpieza de UI
    if (slidingItem) slidingItem.close();
  }

  // 6. ON INIT //////////////////////////////////////
  onInit() {
    const lang = this.languageService.getCurrentLanguage();
  }

  // 7. PREPARE IMAGE EXPORT //////////////////////////////
  async prepareImageExport() {
    // Inform tab1 on action to do
    this.fs.buildTrackImage = true;
    // Display archived track
    await this.displayTrack(true);
  }

  // 8. SHARE IMAGES
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

    // 9. GEOJSON TO KMZ //////////////////////
  async geoJsonToKmz(feature: any): Promise<string> {
    // Nota: Eliminamos formatDate si no lo usamos en LineString estándar, 
    // o lo usamos en la descripción si quieres conservar el tiempo de inicio.
    const escapeXml = (unsafe: string | undefined) =>
      (unsafe ?? '').replace(/[<>&'"]/g, c => ({
        '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;'
      }[c] as string));
    let kmlText = `<?xml version="1.0" encoding="UTF-8"?>
  <kml xmlns="http://www.opengis.net/kml/2.2">
    <Document>
      <name>${escapeXml(feature.properties?.name ?? "Track")}</name>
      <Style id="lineStyle">
        <LineStyle>
          <color>ff0000ff</color>
          <width>4</width>
        </LineStyle>
      </Style>`;
    // 1. Waypoints (Opcional, igual que tenías)
    if (feature.waypoints && feature.waypoints.length > 0) {
      feature.waypoints.forEach((wp: any) => {
        const { latitude, longitude, altitude = 0, name = '', comment = '' } = wp;
        kmlText += `
      <Placemark>
        <name><![CDATA[${name}]]></name>
        <description><![CDATA[${comment}]]></description>
        <Point>
          <coordinates>${longitude},${latitude},${altitude}</coordinates>
        </Point>
      </Placemark>`;
      });
    }
    // 2. Track usando LineString (El estándar que Paso sí entenderá)
    kmlText += `
      <Placemark>
        <name>${escapeXml(feature.properties?.name ?? "Track")}</name>
        <styleUrl>#lineStyle</styleUrl>
        <LineString>
          <tessellate>1</tessellate>
          <altitudeMode>clampToGround</altitudeMode>
          <coordinates>`;
    // Importante: El formato de coordinates en KML es "lon,lat,alt" separado por espacios
    feature.geometry.coordinates.forEach((coordinate: number[], index: number) => {
      const altitude = feature.geometry.properties?.data?.[index]?.altitude ?? 0;
      kmlText += `${coordinate[0]},${coordinate[1]},${altitude} `;
    });
    kmlText += `</coordinates>
        </LineString>
      </Placemark>
    </Document>
  </kml>`;
    const zip = new JSZip();
    zip.file("doc.kml", kmlText);
    // Generamos el base64
    return await zip.generateAsync({ 
      type: "base64", 
      compression: "DEFLATE",
      compressionOptions: { level: 9 }
    });
  }

  // 10. DISPLAY SPECIFIC TRACK ///////////////////////////////
  async displaySpecificTrack(item: any, slidingItem: any) {
    // 1. Limpieza de UI
    if (slidingItem) slidingItem.close();
    // 2. Carga de datos (Esto es rápido, se queda aquí)
    const trackData = await this.fs.storeGet(item.date.toISOString());
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

  // 11. DELETE SPECIFIC TRACK ////////////////////////////
  async deleteSpecificTrack(index: number, slidingItem: any) {
    slidingItem.close();
    // delete it
    const trackToRemove = this.fs.collection[index];
    const key = trackToRemove.date?.toISOString()
    if (key) this.fs.storeRem(key);
    // You can show a confirmation alert here before deleting
    this.fs.collection.splice(index, 1);
    await this.fs.storeSet('collection', this.fs.collection);
    //this.onChange();
  }

  // 12. HEIDE SPECIFIC TRACK //////////////////
  async hideSpecificTrack(slidingItem: any) {
    if (slidingItem) slidingItem.close();
    this.reference.clearArchivedTrack();
    await this.location.sendReferenceToPlugin()
    this.fs.gotoPage('tab1');    
  }

  // 13. IS TRACK VISIBLE() //////////////////////////// 
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

  // 14. TOGGLE VISIBILITY ///////////////////////////
  async toggleVisibility(item: any, slidingItem: any) {
    if (this.isTrackVisible(item)) {
      await this.hideSpecificTrack(slidingItem);
    } else {
      await this.displaySpecificTrack(item, slidingItem);
    }
  }

  // 15. CONFIRM DELETION ////////////////////////////
  confirmDeletion(index: number, slidingItem: any) {
    this.isConfirmDeletionOpen = true;
    this.index = index;
    this.slidingItem = slidingItem;
  }

  // 16. DELETE TRACK ///////////////////////////////////////
  async deleteTrack() {
    await this.deleteSpecificTrack(this.index, this.slidingItem);
  }

  // 17. DISPLAY ALL TRACKS ///////////////////////////////
  async displayAllTracks(show: boolean) {
    try {
      if (show) {
        // 1. Limpieza de seguridad: Si hay un track individual abierto, se cierra
        if (this.reference.archivedTrack) {
          this.reference.clearArchivedTrack();
          // Avisamos al mapa/plugin nativo que la referencia individual ha muerto
          await this.location.sendReferenceToPlugin();
        }

        // 2. Activamos el estado global
        this.mapService.visibleAll = true;

        // 3. Navegamos a la pestaña del mapa
        await this.fs.gotoPage('tab1');

        // 4. Ejecutamos la carga con un pequeño delay para asegurar que el mapa de Tab1 despertó
        setTimeout(async () => {
          await this.mapService.displayAllTracks();
          this.fs.displayToast(this.translate.instant('ARCHIVE.ALL_DISPLAYED'));
        }, 200);

      } else {
        // Lógica para ocultar
        this.mapService.visibleAll = false;
        const source = this.geography.archivedLayer?.getSource();
        if (source) source.clear();
        
        this.fs.displayToast(this.translate.instant('ARCHIVE.ALL_HIDDEN'));
        await this.fs.gotoPage('tab1');
      }
    } catch (error) {
      console.error("Error en el flujo de visualización de tracks:", error);
    }
  }

  // 2. FUNCIÓN PRINCIPAL DE EXPORTACIÓN (REWRITTEN)
  async exportFullReport(item: any) {
    try {
      // A. Recuperar datos
      const storageKey = item.date.toISOString();
      const trackData = await this.fs.storeGet(storageKey);
      
      if (!trackData) {
        this.fs.displayToast(this.translate.instant('ARCHIVE.TOAST5'));
        return;
      }

      // B. Crear PDF
      const doc = new jsPDF();
      const margin = 20;
      
      // Title & Metadata
      doc.setFontSize(18);
      doc.text(this.translate.instant('REPORT.TITLE'), margin, 20);
      
      doc.setFontSize(12);
      doc.text(`${this.translate.instant('REPORT.ROUTE_NAME')}: ${item.name}`, margin, 35);
      doc.text(`${this.translate.instant('REPORT.DATE')}: ${new Date(item.date).toLocaleDateString()}`, margin, 45);
      doc.text(`${this.translate.instant('REPORT.DISTANCE')}: ${item.stats?.distance || '--'} km`, margin, 55);

      // C. Intentar añadir la imagen del mapa (Opcional)
      try {
        const mapImg = await this.generateMapImage(trackData);
        if (mapImg && mapImg !== '') {
          // addImage(imageData, format, x, y, width, height)
          doc.addImage(mapImg, 'JPEG', margin, 65, 170, 120);
        }
      } catch (imgErr) {
        console.warn("Could not include map image in PDF", imgErr);
      }
      
      const pdfBase64 = doc.output('datauristring').split(',')[1];
      const safeName = `Report_${item.name.replace(/\s+/g, '_')}_${Date.now()}`;

      // D. Escribir archivo
      const savedPdf = await Filesystem.writeFile({
        path: `${safeName}.pdf`,
        data: pdfBase64,
        directory: Directory.ExternalCache
      });

      // E. Compartir
      await this.socialSharing.share(
        this.translate.instant('REPORT.SHARE_BODY'), // Message
        this.translate.instant('REPORT.SHARE_SUBJECT'), // Subject
        [savedPdf.uri] // Files
      );

    } catch (err) {
      console.error("ERROR CRÍTICO:", err);
      this.fs.displayToast(this.translate.instant('ARCHIVE.TOAST2'));
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