import { Injectable } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import JSZip from 'jszip';
import { jsPDF } from 'jspdf';
import { Filesystem, Directory } from '@capacitor/filesystem'; 
import Map from 'ol/Map'; 
import * as htmlToImage from 'html-to-image'; // <-- AÑADIDO PARA LA GRÁFICA

// --- INTERNAL IMPORTS ---
import { FunctionsService } from './functions.service';
import { GeographyService } from './geography.service'; 
import { TrackFeature, TrackDefinition, Track } from '../../globald';

@Injectable({
  providedIn: 'root'
})
export class TrackExportService {

  constructor(
    private translate: TranslateService,
    private fs: FunctionsService,
    private geography: GeographyService 
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
  // 1.5. GENERACIÓN DE IMAGEN DE DATOS (Gráfica de Altitud)
  // ==========================================================================
  
  /**
   * Captura un elemento HTML (como la gráfica de CanvasComponent) y lo guarda
   * en la caché externa del dispositivo.
   */
  public async generateAndSaveDataImage(elementId: string): Promise<boolean> {
    try {
      const exportArea = document.getElementById(elementId);
      if (!exportArea) return false;
      
      await document.fonts.ready;
      
      const dataUrl = await htmlToImage.toPng(exportArea, { backgroundColor: '#ffffff' });
      
      await Filesystem.writeFile({
        path: 'data.png',
        data: dataUrl.split(',')[1],
        directory: Directory.ExternalCache,
      });
      
      return true;
    } catch (err) {
      console.error('[TrackExportService] Error exportando gráfica a imagen:', err);
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

  // ==========================================================================
  // 6. GENERADORES PARA PDF (Mapas invisibles y Gráficas de Altitud)
  // ==========================================================================

  public async generateInvisibleMapImage(trackData: any): Promise<string> {
    return new Promise((resolve) => {
      try {
        const GeoJSONFormat = require('ol/format/GeoJSON').default;
        const VectorSource = require('ol/source/Vector').default;
        const VectorLayer = require('ol/layer/Vector').default;
        const OSM = require('ol/source/OSM').default;
        const TileLayer = require('ol/layer/Tile').default;
        const View = require('ol/View').default;
        const Style = require('ol/style/Style').default;
        const Stroke = require('ol/style/Stroke').default;

        const features = new GeoJSONFormat().readFeatures(trackData);
        if(!features.length) { resolve(''); return; }

        const vectorSource = new VectorSource({ features });
        const extent = vectorSource.getExtent();
        if (!extent || !isFinite(extent[0])) { resolve(''); return; }

        const centerX = (extent[0] + extent[2]) / 2;
        const centerY = (extent[1] + extent[3]) / 2;

        const mapDiv = document.getElementById('map-export');
        if (mapDiv) {
          mapDiv.style.width = '1000px';
          mapDiv.style.height = '800px';
        }

        const mapExport = new Map({
          target: 'map-export',
          layers: [
            new TileLayer({ source: new OSM({ crossOrigin: 'anonymous' }) }),
            new VectorLayer({
              source: vectorSource,
              style: new Style({ stroke: new Stroke({ color: '#FF0000', width: 6 }) }),
              zIndex: 999 
            })
          ],
          controls: [], 
          interactions: [],
          view: new View({ center: [centerX, centerY], zoom: 14, enableRotation: false })
        });

        mapExport.updateSize();
        mapExport.getView().fit(extent, { padding: [100, 100, 100, 100], size: [1000, 800] });

        mapExport.once('rendercomplete', () => {
          const size = mapExport.getSize();
          if (!size) { mapExport.dispose(); resolve(''); return; }

          const mapCanvas = document.createElement('canvas');
          mapCanvas.width = size[0];
          mapCanvas.height = size[1];
          const mapContext = mapCanvas.getContext('2d');
          
          if (!mapContext) { mapExport.dispose(); resolve(''); return; }

          mapContext.fillStyle = '#FFFFFF';
          mapContext.fillRect(0, 0, mapCanvas.width, mapCanvas.height);

          const layers = document.querySelectorAll<HTMLCanvasElement>('#map-export .ol-layer canvas');
          layers.forEach((canvas) => {
            if (canvas.width > 0) {
              const parent = canvas.parentNode as HTMLElement;
              mapContext.globalAlpha = Number(parent?.style.opacity || '1');
              const transform = canvas.style.transform;
              let matrix = [1, 0, 0, 1, 0, 0];
              if (transform) {
                const match = transform.match(/^matrix\(([^\(]*)\)$/);
                if (match && match[1]) matrix = match[1].split(',').map(Number);
              }
              mapContext.setTransform(matrix[0], matrix[1], matrix[2], matrix[3], matrix[4], matrix[5]);
              mapContext.drawImage(canvas, 0, 0);
            }
          });

          mapContext.setTransform(1, 0, 0, 1, 0, 0);
          const data = mapCanvas.toDataURL('image/jpeg', 0.8);
          mapExport.setTarget(undefined);
          mapExport.dispose(); 
          resolve(data);
        });
      } catch (e) {
        console.error('[TrackExportService] Error in generateInvisibleMapImage:', e);
        resolve('');
      }
    });
  }

  public async generateAltitudeCanvasImage(track: Track): Promise<string> {
    const data = track.features[0]?.geometry?.properties?.data;
    if (!data || data.length < 2) return '';

    const width = 1000;
    const height = 400;
    const margin = 60;
    
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, height);

    const alts = data.map(d => d.compAltitude);
    const minAlt = Math.min(...alts);
    const maxAlt = Math.max(...alts);
    const rangeAlt = (maxAlt - minAlt) || 20;
    
    const totalDist = data[data.length - 1].distance;
    const scaleX = (width - 2 * margin) / totalDist;
    const scaleY = (height - 2 * margin) / rangeAlt;

    ctx.beginPath();
    ctx.moveTo(margin, height - margin);
    data.forEach(p => ctx.lineTo(margin + p.distance * scaleX, height - margin - (p.compAltitude - minAlt) * scaleY));
    ctx.lineTo(margin + totalDist * scaleX, height - margin);
    ctx.closePath();

    const grad = ctx.createLinearGradient(0, margin, 0, height - margin);
    grad.addColorStop(0, 'rgba(255, 215, 0, 0.4)');
    grad.addColorStop(1, 'rgba(255, 215, 0, 0.05)');
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.beginPath();
    ctx.strokeStyle = '#FFD700';
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    data.forEach((p, i) => {
      const x = margin + p.distance * scaleX;
      const y = height - margin - (p.compAltitude - minAlt) * scaleY;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();

    ctx.strokeStyle = '#999';
    ctx.fillStyle = '#666';
    ctx.font = 'bold 16px Arial';
    ctx.lineWidth = 1;
    
    ctx.beginPath();
    ctx.moveTo(margin, height - margin);
    ctx.lineTo(width - margin, height - margin);
    ctx.stroke();
    ctx.textAlign = 'right';
    ctx.fillText(`${totalDist.toFixed(1)} km`, width - margin, height - margin + 25);

    ctx.textAlign = 'right';
    ctx.fillText(`${Math.round(maxAlt)} m`, margin - 10, margin + 5);
    ctx.fillText(`${Math.round(minAlt)} m`, margin - 10, height - margin + 5);

    return canvas.toDataURL('image/jpeg', 0.8);
  }
  
}