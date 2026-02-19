import { Injectable } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { FunctionsService } from './functions.service';
import JSZip from 'jszip';
import { jsPDF } from 'jspdf';
import { TrackFeature, TrackDefinition, Track } from '../../globald';

@Injectable({
  providedIn: 'root'
})
export class TrackExportService {

  constructor(
    private translate: TranslateService,
    private fs: FunctionsService
  ) {}

  // --- 1. GEOJSON TO KMZ ---
  async geoJsonToKmz(feature: TrackFeature): Promise<string> {
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

    // Waypoints
    if (feature.waypoints && feature.waypoints.length > 0) {
      feature.waypoints.forEach((wp) => {
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

    // Track Line
    kmlText += `
    <Placemark>
      <name>${escapeXml(feature.properties?.name ?? "Track")}</name>
      <styleUrl>#lineStyle</styleUrl>
      <LineString>
        <tessellate>1</tessellate>
        <altitudeMode>clampToGround</altitudeMode>
        <coordinates>`;

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

    return await zip.generateAsync({
      type: "base64",
      compression: "DEFLATE",
      compressionOptions: { level: 9 }
    });
  }

  // --- 2. GEOJSON TO GPX ---
  async geoJsonToGpx(feature: TrackFeature): Promise<string> {
    const formatDate = (timestamp: number | string): string => new Date(timestamp).toISOString();
    
    const escapeXml = (unsafe: string | undefined) =>
      (unsafe ?? '').replace(/[<>&'"]/g, c => ({
        '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;'
      }[c] as string));

    let gpxText = `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
<gpx version="1.1" creator="PasoApp"
xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
xmlns="http://www.topografix.com/GPX/1/1"
xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">`;

    if (feature.waypoints && feature.waypoints.length > 0) {
      feature.waypoints.forEach((wp) => {
        const { latitude, longitude, altitude, name = '', comment = '' } = wp;
        gpxText += `\n  <wpt lat="${latitude}" lon="${longitude}">`;
        if (altitude !== undefined && altitude !== null) {
          gpxText += `\n    <ele>${altitude}</ele>`;
        }
        gpxText += `\n    <name><![CDATA[${name.replace(/]]>/g, ']]]]><![CDATA[>')}]]></name>`;
        gpxText += `\n    <cmt><![CDATA[${comment.replace(/]]>/g, ']]]]><![CDATA[>')}]]></cmt>`;
        gpxText += `\n  </wpt>`;
      });
    }

    const trackName = escapeXml(feature.properties?.name || 'Track');
    gpxText += `\n  <trk>\n    <name>${trackName}</name>\n    <trkseg>`;

    feature.geometry.coordinates.forEach((coordinate: number[], index: number) => {
      const dataPoint = feature.geometry.properties?.data?.[index];
      const time = dataPoint?.time || Date.now();
      const altitude = dataPoint?.altitude;

      gpxText += `\n      <trkpt lat="${coordinate[1]}" lon="${coordinate[0]}">`;
      if (altitude !== undefined && altitude !== null) {
        gpxText += `\n        <ele>${altitude}</ele>`;
      }
      gpxText += `\n        <time>${formatDate(time)}</time>`;
      gpxText += `\n      </trkpt>`;
    });
    gpxText += `\n    </trkseg>\n  </trk>\n</gpx>`;
    return gpxText;
  }

  // --- 3. CREATE PDF ---
  async createPdfContent(
    item: TrackDefinition, 
    trackData: Track, 
    mapImg: string, 
    altImg?: string
  ): Promise<string> {
    
    const pdf = new jsPDF();
    const props = trackData.features[0].properties;

    // --- CABECERA ---
    pdf.setFontSize(18);
    pdf.text(item.name || 'Track Report', 10, 20);
    
    pdf.setFontSize(10);
    pdf.setTextColor(100);
    const dateStr = item.date ? new Date(item.date).toLocaleDateString() : '';
    pdf.text(dateStr, 10, 28);

    // --- 1. MAPA (Posición fija) ---
    if (mapImg) {
      pdf.addImage(mapImg, 'JPEG', 10, 35, 190, 90);
    }

    // --- 2. PERFIL DE ALTITUD ---
    let nextY = 135; // Punto de inicio tras el mapa
    if (altImg) {
      pdf.setFontSize(14);
      pdf.setTextColor(0);
      pdf.addImage(altImg, 'JPEG', 10, nextY, 190, 50);
      nextY += 70; // Espacio que ocupa el gráfico + margen
    }

    // --- 3. ESTADÍSTICAS (Recuperadas) ---
    pdf.setFontSize(12);
    pdf.setTextColor(0);
    
    // Columna 1
    pdf.text(`${this.translate.instant('REPORT.DISTANCE')}: ${props.totalDistance.toFixed(2)} km`, 10, nextY);
    
    // Usamos el formateador de tiempo del servicio de funciones
    const timeStr = this.fs.formatMillisecondsToUTC(props.totalTime);
    pdf.text(`${this.translate.instant('REPORT.TIME')}: ${timeStr}`, 10, nextY + 10);

    // Columna 2 (Desniveles)
    const gainStr = `+${Math.round(props.totalElevationGain)} m`;
    const lossStr = `-${Math.round(props.totalElevationLoss)} m`;
    
    pdf.text(`${this.translate.instant('REPORT.ELEVATION_GAIN')}: ${gainStr}`, 110, nextY);
    pdf.text(`${this.translate.instant('REPORT.ELEVATION_LOSS')}: ${lossStr}`, 110, nextY + 10);

    // --- 4. DESCRIPCIÓN (Si existe) ---
    if (item.description) {
      pdf.setFontSize(10);
      pdf.setTextColor(100);
      const splitDesc = pdf.splitTextToSize(item.description, 180);
      pdf.text(splitDesc, 10, nextY + 25);
    }

    return pdf.output('datauristring').split(',')[1];
  }

}