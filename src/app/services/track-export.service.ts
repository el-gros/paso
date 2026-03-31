import { Injectable } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import JSZip from 'jszip';
import { jsPDF } from 'jspdf';
import { Filesystem, Directory } from '@capacitor/filesystem'; 
import * as htmlToImage from 'html-to-image';

import { Map, View } from 'ol';
import { GeoJSON } from 'ol/format';
import { Vector as VectorSource, OSM } from 'ol/source';
import { Vector as VectorLayer, Tile as TileLayer } from 'ol/layer';
import { Style, Stroke } from 'ol/style';

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

  public async generateAndSaveMapImage(map: Map): Promise<boolean> {
    try {
      await new Promise(resolve => setTimeout(resolve, 150));
      this.geography.currentLayer?.setVisible(false); 
      
      const mapWrapper = document.getElementById('map-wrapper');
      if (mapWrapper) mapWrapper.style.transform = `scale(1)`; 

      await this.waitForMapRender(map);

      const size = map.getSize() || [window.innerWidth, window.innerHeight];
      const mapCanvas = document.createElement('canvas');
      mapCanvas.width = size[0];
      mapCanvas.height = size[1];
      const ctx = mapCanvas.getContext('2d');
      
      if (!ctx) {
        this.geography.currentLayer?.setVisible(true);
        return false;
      }

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

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const dataUrl = mapCanvas.toDataURL('image/jpeg', 0.8);

      await Filesystem.writeFile({
        path: 'map.jpg',
        data: dataUrl.split(',')[1],
        directory: Directory.ExternalCache,
      });

      this.geography.currentLayer?.setVisible(true);
      return true;

    } catch (err) {
      console.error('[TrackExportService] Error capturando imagen:', err);
      this.geography.currentLayer?.setVisible(true); 
      return false;
    }
  }

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
      console.error('[TrackExportService] Error exportando gráfica:', err);
      return false;
    }
  }

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

  public async geoJsonToGpx(feature: TrackFeature): Promise<string> {
    try {
      const trackName = this.escapeXml(feature.properties?.name || 'Track');
      // 1. Capturamos y escapamos la descripción
      const trackDesc = this.escapeXml(feature.properties?.description || ''); 

      let gpxText = `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
<gpx version="1.1" creator="PasoApp"
xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
xmlns="http://www.topografix.com/GPX/1/1"
xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">`;

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

      // 2. Añadimos el nombre
      gpxText += `\n  <trk>\n    <name>${trackName}</name>`;
      
      // 3. Añadimos la descripción si existe, justo antes del <trkseg>
      if (trackDesc) {
        gpxText += `\n    <desc>${trackDesc}</desc>`;
      }
      
      gpxText += `\n    <trkseg>`;

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
  // 5. MÉTODOS PRIVADOS (Helpers)
  // ==========================================================================

  private escapeXml(unsafe: string | undefined): string {
    return (unsafe ?? '').replace(/[<>&'"]/g, c => ({
      '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;'
    }[c] as string));
  }

  private waitForMapRender(map: Map): Promise<void> {
    return new Promise((r) => {
      map.once('rendercomplete', () => setTimeout(() => r(), 300));
      map.renderSync();
    });
  }

  // ==========================================================================
  // 6. GENERADOR HTML (OpenLayers + Tarjeta Flotante + Gráfica Perfil)
  // ==========================================================================

  public generateStandaloneHtml(trackData: Track, routeName: string = 'Ruta Exportada'): string {
    try {
      const geoJsonString = JSON.stringify(trackData);
      const safeTitle = this.escapeXml(routeName);

      const props = trackData.features[0]?.properties || {};
      
      const distLabel = this.translate.instant('REPORT.DISTANCE');
      const timeLabel = this.translate.instant('REPORT.TIME');
      const gainLabel = this.translate.instant('REPORT.ELEVATION_GAIN');
      const lossLabel = this.translate.instant('REPORT.ELEVATION_LOSS');
      const altLabel = this.translate.instant('REPORT.ALTITUDE') !== 'REPORT.ALTITUDE' ? this.translate.instant('REPORT.ALTITUDE') : 'Altitud';

      const distVal = (props.totalDistance || 0).toFixed(2);
      const timeVal = this.fs.formatMillisecondsToUTC(props.totalTime || 0);
      const gainVal = Math.round(props.totalElevationGain || 0);
      const lossVal = Math.round(props.totalElevationLoss || 0);

      const htmlContent = `<!DOCTYPE html>
<html lang="${this.translate.currentLang || 'es'}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>${safeTitle} - Visor de Ruta</title>
  
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/ol@v8.2.0/ol.css">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap" rel="stylesheet">
  
  <style>
    body, html { margin: 0; padding: 0; width: 100%; height: 100%; font-family: 'Inter', sans-serif; background-color: #121212; overflow: hidden; display: flex; flex-direction: column; }
    
    #map-container { flex: 1 1 75vh; position: relative; width: 100%; }
    #map { width: 100%; height: 100%; position: absolute; top: 0; left: 0; }

    /* TARJETA COLAPSABLE MEJORADA */
    #info-card {
      position: absolute; bottom: 15px; left: 50%; transform: translateX(-50%);
      width: 92%; max-width: 420px; background: rgba(255, 255, 255, 0.95);
      backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
      border-radius: 20px; box-shadow: 0 8px 30px rgba(0, 0, 0, 0.3);
      padding: 15px; box-sizing: border-box; z-index: 1000;
      transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
    }
    .title-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
    .title { font-size: 1rem; font-weight: 800; color: #1a1a1a; margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; text-align: left; }
    .toggle-btn { background: rgba(0,0,0,0.05); border: none; border-radius: 50%; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; font-size: 0.8rem; cursor: pointer; color: #555; transition: background 0.2s; }
    .toggle-btn:active { background: rgba(0,0,0,0.15); }
    
    .stats-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; transition: max-height 0.3s ease, opacity 0.3s ease; max-height: 200px; opacity: 1; overflow: hidden; }
    .stat-box { background: rgba(0,0,0,0.04); padding: 8px; border-radius: 12px; text-align: center; }
    .stat-label { font-size: 0.55rem; font-weight: 800; text-transform: uppercase; color: #888; display: block; margin-bottom: 2px; }
    .stat-val { font-size: 1rem; font-weight: 700; color: #ff3b30; }
    .stat-unit { font-size: 0.65rem; color: #999; }
    .color-gain { color: #2dd36f; }

    /* Estado minimizado */
    #info-card.minimized .stats-grid { max-height: 0; opacity: 0; margin-top: 0; }
    #info-card.minimized .title-row { margin-bottom: 0; }
    #info-card.minimized .toggle-btn { transform: rotate(180deg); }

    /* GRÁFICA */
    #chart-container { flex: 0 0 25vh; background-color: white; padding: 10px 15px 15px 5px; box-sizing: border-box; position: relative; z-index: 100; box-shadow: 0 -4px 10px rgba(0,0,0,0.1); }
  </style>
</head>
<body>

  <div id="map-container">
      <div id="map"></div>
      
      <div id="info-card" class="minimized"> <div class="title-row" onclick="toggleCard()">
          <h2 class="title" id="r-name">${safeTitle}</h2>
          <button class="toggle-btn" id="t-btn">▼</button>
        </div>
        <div class="stats-grid">
          <div class="stat-box"><span class="stat-label">${distLabel}</span><span class="stat-val">${distVal} <span class="stat-unit">km</span></span></div>
          <div class="stat-box"><span class="stat-label">${timeLabel}</span><span class="stat-val">${timeVal}</span></div>
          <div class="stat-box"><span class="stat-label">${gainLabel}</span><span class="stat-val color-gain">+${gainVal} <span class="stat-unit">m</span></span></div>
          <div class="stat-box"><span class="stat-label">${lossLabel}</span><span class="stat-val">-${lossVal} <span class="stat-unit">m</span></span></div>
        </div>
      </div>
  </div>

  <div id="chart-container"><canvas id="elevationChart"></canvas></div>

  <script src="https://cdn.jsdelivr.net/npm/ol@v8.2.0/dist/ol.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  
  <script>
    ol.proj.useGeographic(); 

    // LÓGICA DE LA TARJETA
    function toggleCard() {
      const card = document.getElementById('info-card');
      card.classList.toggle('minimized');
    }

    const routeGeoJSON = ${geoJsonString};

    function createPinStyle(color) {
      return new ol.style.Style({
        image: new ol.style.Icon({
          anchor: [0.5, 1], scale: 1.2,
          src: 'data:image/svg+xml;utf8,' + encodeURIComponent(\`
            <svg width="30" height="30" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="\${color}"/>
              <circle cx="12" cy="9" r="2.5" fill="white"/>
            </svg>\`)
        })
      });
    }

    const features = new ol.format.GeoJSON().readFeatures(routeGeoJSON);
    const feature = features[0];

    const map = new ol.Map({
      target: 'map',
      layers: [
        new ol.layer.Tile({
            source: new ol.source.XYZ({
                url: 'https://{a-c}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
                attributions: '&copy; OpenStreetMap | &copy; CARTO'
            })
        })
      ],
      view: new ol.View({ center: [0, 0], zoom: 2 }),
      controls: []
    });

    feature.setStyle(new ol.style.Style({ stroke: new ol.style.Stroke({ color: '#ff3b30', width: 6, lineCap: 'round' }) }));

    const coords = feature.getGeometry().getCoordinates();
    const startPoint = new ol.Feature({ geometry: new ol.geom.Point(coords[0]) });
    const endPoint = new ol.Feature({ geometry: new ol.geom.Point(coords[coords.length - 1]) });

    startPoint.setStyle(createPinStyle('#2dd36f')); 
    endPoint.setStyle(createPinStyle('#ff3b30'));   

    const source = new ol.source.Vector({ features: [feature, startPoint, endPoint] });
    map.addLayer(new ol.layer.Vector({ source }));
    
    // Encuadramos con padding ajustable
    map.getView().fit(source.getExtent(), { padding: [50, 50, 100, 50] });

    // GRÁFICA
    const trackData = routeGeoJSON.features[0]?.geometry?.properties?.data;
    if (trackData && trackData.length > 1) {
        const chartData = trackData.map(p => ({ x: parseFloat(p.distance || 0), y: Math.round(p.compAltitude || p.altitude || 0) }));
        const maxDist = chartData[chartData.length - 1].x;
        let dynamicStep = 1; 
        if (maxDist > 100) dynamicStep = 20;
        else if (maxDist > 50) dynamicStep = 10;
        else if (maxDist > 20) dynamicStep = 5;
        else if (maxDist > 10) dynamicStep = 2;
        else if (maxDist < 2) dynamicStep = 0.5; 

        new Chart(document.getElementById('elevationChart').getContext('2d'), {
            type: 'line',
            data: { datasets: [{ label: '${altLabel}', data: chartData, borderColor: '#ff3b30', backgroundColor: 'rgba(255, 59, 48, 0.2)', fill: true, pointRadius: 0, pointHitRadius: 15, borderWidth: 2, tension: 0.1 }] },
            options: {
                responsive: true, maintainAspectRatio: false,
                interaction: { mode: 'nearest', intersect: false, axis: 'x' },
                plugins: { legend: { display: false }, tooltip: { callbacks: { title: function(c) { return '${distLabel}: ' + Number(c[0].parsed.x).toFixed(2) + ' km'; }, label: function(c) { return '${altLabel}: ' + c.parsed.y + ' m'; } } } },
                scales: { x: { type: 'linear', title: { display: false }, ticks: { stepSize: dynamicStep, callback: function(v) { return v + ' km'; } }, grid: { display: false } }, y: { title: { display: false }, beginAtZero: false } }
            }
        });
    } else {
        document.getElementById('chart-container').innerHTML = '<p style="text-align:center; color:#999; margin-top: 20px;">Sin datos de elevación.</p>';
    }
  </script>
</body>
</html>`;

      return htmlContent;
    } catch (error) {
      console.error('[TrackExportService] Error generando HTML:', error);
      throw error;
    }
  }

}