import { Injectable } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import JSZip from 'jszip';
import { jsPDF } from 'jspdf';
import { Filesystem, Directory } from '@capacitor/filesystem'; // <-- AÑADIDO PARA LA IMAGEN
import Map from 'ol/Map'; // <-- AÑADIDO PARA LA IMAGEN

// --- INTERNAL IMPORTS ---
import { FunctionsService } from './functions.service';
import { GeographyService } from './geography.service'; // <-- AÑADIDO PARA LA IMAGEN
import { TrackFeature, TrackDefinition, Track } from '../../globald';

@Injectable({
  providedIn: 'root'
})
export class TrackExportService {

  constructor(
    private translate: TranslateService,
    private fs: FunctionsService,
    private geography: GeographyService // <-- INYECTADO AQUÍ
  ) {}

  // ==========================================================================
  // 1. GENERACIÓN DE IMAGEN DEL MAPA (El Fotógrafo)
  // ==========================================================================

  /**
   * Captura la vista actual del mapa (archivedLayer), oculta la currentLayer y guarda
   * la imagen en la caché externa del dispositivo.
   */
  public async generateAndSaveMapImage(map: Map): Promise<boolean> {
    try {
      // 1. Preparación de la UI
      await new Promise(resolve => setTimeout(resolve, 150));
      this.geography.currentLayer?.setVisible(false); // Ocultar capa GPS/Tracking
      
      const mapWrapper = document.getElementById('map-wrapper');
      if (mapWrapper) mapWrapper.style.transform = `scale(1)`; // reset zoom

      // 2. Esperar a que OpenLayers termine de renderizar
      await this.waitForMapRender(map);

      // 3. Crear el Canvas compuesto
      const size = map.getSize() || [window.innerWidth, window.innerHeight];
      const mapCanvas = document.createElement('canvas');
      mapCanvas.width = size[0];
      mapCanvas.height = size[1];
      const ctx = mapCanvas.getContext('2d');
      if (!ctx) {
        this.geography.currentLayer?.setVisible(true); // Restaurar UI
        return false;
      }

      // 4. Dibujar todas las capas de OL en nuestro canvas
      document.querySelectorAll<HTMLCanvasElement>('.ol-layer canvas').forEach((canvas) => {
        if (canvas.width > 0) {
          const opacity = (canvas.parentNode as HTMLElement)?.style.opacity || '1';
          ctx.globalAlpha = Number(opacity);
          const tr = canvas.style.transform;
          
          if (tr && tr.startsWith('matrix')) {
            const m = tr.match(/^matrix\(([^)]+)\)$/)?.[1].split(',').map(Number);
            if (m) ctx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
          } else {
            ctx.setTransform(1, 0, 0, 1, 0, 0);
          }
          ctx.drawImage(canvas, 0, 0);
        }
      });

      // 5. Generar Base64 y guardar en disco
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const dataUrl = mapCanvas.toDataURL('image/jpeg', 0.8); // JPEG con compresión del 80%

      await Filesystem.writeFile({
        path: 'map.jpg',
        data: dataUrl.split(',')[1],
        directory: Directory.ExternalCache,
      });

      // 6. Restaurar la UI y finalizar
      this.geography.currentLayer?.setVisible(true);
      return true;

    } catch (err) {
      console.error('[TrackExportService] Error capturando imagen del mapa:', err);
      this.geography.currentLayer?.setVisible(true); // Restaurar UI incluso si falla
      return false;
    }
  }

  // ==========================================================================
  // 2. EXPORTACIÓN A KMZ (Google Earth)
  // ==========================================================================

  public async geoJsonToKmz(feature: TrackFeature): Promise<string> {
    try {
      const trackName = this.escapeXml(feature.properties?.name || "Track");

      let kmlText = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${trackName}</name>
    <Style id="lineStyle">
      <LineStyle>
        <color>ff0000ff</color>
        <width>4</width>
      </LineStyle>
    </Style>`;

      // --- Waypoints ---
      if (feature.waypoints && feature.waypoints.length > 0) {
        feature.waypoints.forEach((wp) => {
          const altitude = wp.altitude || 0;
          const name = wp.name || '';
          const comment = wp.comment || '';
          
          kmlText += `
    <Placemark>
      <name><![CDATA[${name}]]></name>
      <description><![CDATA[${comment}]]></description>
      <Point>
        <coordinates>${wp.longitude},${wp.latitude},${altitude}</coordinates>
      </Point>
    </Placemark>`;
        });
      }

      // --- Track Line ---
      kmlText += `
    <Placemark>
      <name>${trackName}</name>
      <styleUrl>#lineStyle</styleUrl>
      <LineString>
        <tessellate>1</tessellate>
        <altitudeMode>clampToGround</altitudeMode>
        <coordinates>`;

      feature.geometry.coordinates.forEach((coordinate: number[], index: number) => {
        const altitude = feature.geometry.properties?.data?.[index]?.altitude || 0;
        kmlText += `${coordinate[0]},${coordinate[1]},${altitude} `;
      });

      kmlText += `</coordinates>
      </LineString>
    </Placemark>
  </Document>
</kml>`;

      // Empaquetar KML en un archivo ZIP (KMZ)
      const zip = new JSZip();
      zip.file("doc.kml", kmlText);

      return await zip.generateAsync({
        type: "base64",
        compression: "DEFLATE",
        compressionOptions: { level: 9 }
      });

    } catch (error) {
      console.error('[TrackExportService] Error generando KMZ:', error);
      throw error;
    }
  }

  // ==========================================================================
  // 3. EXPORTACIÓN A GPX (Estándar GPS)
  // ==========================================================================

  public async geoJsonToGpx(feature: TrackFeature): Promise<string> {
    try {
      const trackName = this.escapeXml(feature.properties?.name || 'Track');

      let gpxText = `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
<gpx version="1.1" creator="PasoApp"
xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
xmlns="http://www.topografix.com/GPX/1/1"
xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">`;

      // --- Waypoints ---
      if (feature.waypoints && feature.waypoints.length > 0) {
        feature.waypoints.forEach((wp) => {
          const name = (wp.name || '').replace(/]]>/g, ']]]]><![CDATA[>');
          const comment = (wp.comment || '').replace(/]]>/g, ']]]]><![CDATA[>');
          
          gpxText += `\n  <wpt lat="${wp.latitude}" lon="${wp.longitude}">`;
          if (wp.altitude !== undefined && wp.altitude !== null) {
            gpxText += `\n    <ele>${wp.altitude}</ele>`;
          }
          gpxText += `\n    <name><![CDATA[${name}]]></name>`;
          gpxText += `\n    <cmt><![CDATA[${comment}]]></cmt>`;
          gpxText += `\n  </wpt>`;
        });
      }

      // --- Track Line ---
      gpxText += `\n  <trk>\n    <name>${trackName}</name>\n    <trkseg>`;

      feature.geometry.coordinates.forEach((coordinate: number[], index: number) => {
        const dataPoint = feature.geometry.properties?.data?.[index];
        const time = dataPoint?.time || Date.now();
        const altitude = dataPoint?.altitude;

        gpxText += `\n      <trkpt lat="${coordinate[1]}" lon="${coordinate[0]}">`;
        if (altitude !== undefined && altitude !== null) {
          gpxText += `\n        <ele>${altitude}</ele>`;
        }
        gpxText += `\n        <time>${new Date(time).toISOString()}</time>`;
        gpxText += `\n      </trkpt>`;
      });
      
      gpxText += `\n    </trkseg>\n  </trk>\n</gpx>`;
      return gpxText;

    } catch (error) {
      console.error('[TrackExportService] Error generando GPX:', error);
      throw error;
    }
  }

  // ==========================================================================
  // 4. EXPORTACIÓN A PDF (Reporte)
  // ==========================================================================

  public async createPdfContent(
    item: TrackDefinition, 
    trackData: Track, 
    mapImg: string, 
    altImg?: string
  ): Promise<string> {
    try {
      const pdf = new jsPDF();
      const props = trackData.features[0].properties;

      // --- CABECERA ---
      pdf.setFontSize(18);
      pdf.text(item.name || 'Track Report', 10, 20);
      
      pdf.setFontSize(10);
      pdf.setTextColor(100);
      const dateStr = item.date ? new Date(item.date).toLocaleDateString() : '';
      pdf.text(dateStr, 10, 28);

      // --- 1. IMAGEN DEL MAPA ---
      if (mapImg) {
        pdf.addImage(mapImg, 'JPEG', 10, 35, 190, 90);
      }

      // --- 2. PERFIL DE ALTITUD ---
      let nextY = 135; 
      if (altImg) {
        pdf.setFontSize(14);
        pdf.setTextColor(0);
        pdf.addImage(altImg, 'JPEG', 10, nextY, 190, 50);
        nextY += 70; 
      }

      // --- 3. ESTADÍSTICAS ---
      pdf.setFontSize(12);
      pdf.setTextColor(0);
      
      // Columna 1
      pdf.text(`${this.translate.instant('REPORT.DISTANCE')}: ${(props.totalDistance || 0).toFixed(2)} km`, 10, nextY);
      
      const timeStr = this.fs.formatMillisecondsToUTC(props.totalTime || 0);
      pdf.text(`${this.translate.instant('REPORT.TIME')}: ${timeStr}`, 10, nextY + 10);

      // Columna 2
      const gainStr = `+${Math.round(props.totalElevationGain || 0)} m`;
      const lossStr = `-${Math.round(props.totalElevationLoss || 0)} m`;
      
      pdf.text(`${this.translate.instant('REPORT.ELEVATION_GAIN')}: ${gainStr}`, 110, nextY);
      pdf.text(`${this.translate.instant('REPORT.ELEVATION_LOSS')}: ${lossStr}`, 110, nextY + 10);

      // --- 4. DESCRIPCIÓN ---
      if (item.description) {
        pdf.setFontSize(10);
        pdf.setTextColor(100);
        const splitDesc = pdf.splitTextToSize(item.description, 180);
        pdf.text(splitDesc, 10, nextY + 25);
      }

      return pdf.output('datauristring').split(',')[1];
      
    } catch (error) {
      console.error('[TrackExportService] Error generando PDF:', error);
      throw error;
    }
  }

  // ==========================================================================
  // 5. MÉTODOS PRIVADOS (Helpers)
  // ==========================================================================

  private escapeXml(unsafe: string | undefined): string {
    return (unsafe ?? '').replace(/[<>&'"]/g, c => ({
      '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;'
    }[c] as string));
  }

  /**
   * Promesa que se resuelve cuando OpenLayers ha terminado el renderizado síncrono.
   */
  private waitForMapRender(map: Map): Promise<void> {
    return new Promise((r) => {
      map.once('rendercomplete', () => setTimeout(() => r(), 300));
      map.renderSync();
    });
  }
}