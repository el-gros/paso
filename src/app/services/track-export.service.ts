import { Injectable } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import JSZip from 'jszip';
import { jsPDF } from 'jspdf';
import { TrackFeature, TrackDefinition, Track } from '../../globald';

@Injectable({
  providedIn: 'root'
})
export class TrackExportService {

  constructor(private translate: TranslateService) {}

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
  async createPdfContent(item: TrackDefinition, trackData: Track, mapImageBase64: string): Promise<string> {
    return new Promise((resolve) => {
      try {
        const doc = new jsPDF();
        const margin = 20;
        const firstFeatureProps = trackData.features?.[0]?.properties;

        // Formats
        const formatMsec = (ms: number) => {
             const s = Math.floor(ms / 1000);
             return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60]
                .map(v => v.toString().padStart(2, '0')).join(':');
        };

        // Data Prep
        let rawDistance = firstFeatureProps?.totalDistance ?? 0;
        const distStr = rawDistance > 0 ? rawDistance.toFixed(2) : '--';

        let totalTime = firstFeatureProps?.totalTime ?? 0;
        const timeStr = totalTime > 0 ? formatMsec(totalTime) : '--';

        const elevationGain = Math.round(firstFeatureProps?.totalElevationGain ?? 0);
        const elevationLoss = Math.round(firstFeatureProps?.totalElevationLoss ?? 0);

        // Header
        doc.setFontSize(18);
        const name = item.name || firstFeatureProps?.name || 'Track';
        const label = this.translate.instant('REPORT.ROUTE_NAME') || 'Route Name';
        
        // Wrap text
        const maxWidth = 150;
        const textLines = doc.splitTextToSize(`${label}: ${name}`, maxWidth);
        doc.text(textLines, margin, 30);

        // Body
        const startY = 30 + (textLines.length * 10);
        const dateStr = item.date ? new Date(item.date).toLocaleDateString() : '--';

        doc.setFontSize(12);
        doc.text(`${this.translate.instant('REPORT.DATE') || 'Date'}: ${dateStr}`, margin, startY);
        doc.text(`${this.translate.instant('REPORT.DISTANCE') || 'Distance'}: ${distStr} km`, margin, startY + 6);
        doc.text(`${this.translate.instant('REPORT.TIME') || 'Time'}: ${timeStr}`, margin, startY + 12);
        doc.text(`${this.translate.instant('REPORT.ELEVATION_GAIN') || 'Gain'}: ${elevationGain} m`, margin, startY + 18);
        doc.text(`${this.translate.instant('REPORT.ELEVATION_LOSS') || 'Loss'}: ${elevationLoss} m`, margin, startY + 24);

        // Map Image
        if (mapImageBase64 && mapImageBase64.length > 100) {
          doc.addImage(mapImageBase64, 'JPEG', margin, startY + 30, 170, 120);
        }

        const output = doc.output('datauristring');
        resolve(output.split(',')[1]);
      } catch (error) {
        console.error("PDF Generation Error", error);
        resolve('');
      }
    });
  }
}