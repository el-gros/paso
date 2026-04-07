import { Injectable } from '@angular/core';
import { FunctionsService } from './functions.service';
import { Waypoint, ParsedPoint } from '../../globald';

export interface ParsedRouteData {
  waypoints: Waypoint[];
  trackPoints: ParsedPoint[];
  trk: Element | null;
}

@Injectable({ 
  providedIn: 'root' 
})
export class FileParserService {

  constructor(private fs: FunctionsService) {}

  // ==========================================================================
  // 1. PARSER GPX
  // ==========================================================================

  /**
   * Procesa el contenido de un archivo XML en formato GPX.
   * Extrae tanto Waypoints como el primer TrackSegment encontrado.
   */
  async parseGpxXml(gpxText: string): Promise<ParsedRouteData> {
    let waypoints: Waypoint[] = [];
    let trackPoints: ParsedPoint[] = [];
    let trk: Element | null = null;
    
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(gpxText, 'application/xml');
    
    if (xmlDoc.getElementsByTagName('parsererror').length > 0) {
      throw new Error('Invalid GPX file format.');
    }
    
    // --- Extraer Waypoints ---
    const wptNodes = xmlDoc.getElementsByTagName("wpt");
    for (const wpt of Array.from(wptNodes)) {
      const latStr = wpt.getAttribute("lat");
      const lonStr = wpt.getAttribute("lon");
      if (!latStr || !lonStr) continue;
      
      const latitude = parseFloat(latStr);
      const longitude = parseFloat(lonStr);
      const eleNode = wpt.getElementsByTagName("ele")[0];
      const altitude = eleNode ? parseFloat(eleNode.textContent || "0") : 0;
      
      const name = this.fs.sanitize(wpt.getElementsByTagName("name")[0]?.textContent || "");
      let comment = this.fs.sanitize(wpt.getElementsByTagName("cmt")[0]?.textContent || "");
      if (name === comment) comment = "";
      
      waypoints.push({ latitude, longitude, altitude, name, comment });
    }
    
    // --- Extraer Ruta Principal (Track) ---
    const tracks = xmlDoc.getElementsByTagName('trk');
    if (!tracks.length) return { waypoints, trackPoints, trk: null };
    
    trk = tracks[0];
    const trackSegments = trk.getElementsByTagName('trkseg');
    if (!trackSegments.length) return { waypoints, trackPoints, trk: null };
    
    const trkptNodes = trackSegments[0].getElementsByTagName('trkpt');
    for (const trkpt of Array.from(trkptNodes)) {
      const lat = parseFloat(trkpt.getAttribute('lat') || "");
      const lon = parseFloat(trkpt.getAttribute('lon') || "");
      const ele = parseFloat(trkpt.getElementsByTagName('ele')[0]?.textContent || "0");
      
      const timeStr = trkpt.getElementsByTagName('time')[0]?.textContent;
      const time = timeStr ? new Date(timeStr).getTime() : 0;
      
      if (!isNaN(lat) && !isNaN(lon)) {
        trackPoints.push({ lat, lon, ele, time });
      }
    }
    
    return { waypoints, trackPoints, trk };
  }

  // ==========================================================================
  // 2. PARSER KML
  // ==========================================================================

  /**
   * Procesa un Documento XML en formato KML.
   * @param photoMap Opcional: Mapa de referencias para vincular fotos locales extraídas del ZIP.
   */
  async parseKmlXml(xmlDoc: Document, photoMap?: Map<string, string>): Promise<ParsedRouteData> {
    let waypoints: Waypoint[] = [];
    let trackPoints: ParsedPoint[] = []; 
    let trk: Element | null = null;
    
    const placemarks = xmlDoc.getElementsByTagName("Placemark");
    
    for (const pm of Array.from(placemarks)) {
      const name = pm.getElementsByTagName("name")[0]?.textContent || "";
      const desc = pm.getElementsByTagName("description")[0]?.textContent || "";
      
      // --- Extraer Waypoint ---
      const point = pm.getElementsByTagName("Point")[0];
      if (point) {
        const coordText = point.getElementsByTagName("coordinates")[0]?.textContent?.trim();
        if (coordText) {
          const [lonStr, latStr, eleStr] = coordText.split(",");
          const waypoint: Waypoint = {
            latitude: parseFloat(latStr), 
            longitude: parseFloat(lonStr),
            altitude: eleStr ? parseFloat(eleStr) : 0,
            name: this.fs.sanitize(name), 
            comment: this.fs.sanitize(desc),
            photos: []
          };

          // Si hay fotos extraídas, las vinculamos buscando el nombre en la descripción
          if (photoMap) {
            photoMap.forEach((uri, zipPath) => {
              const fileName = zipPath.split('/').pop();
              if (fileName && desc.includes(fileName)) {
                waypoint.photos?.push(uri);
              }
            });
          }
          waypoints.push(waypoint);
        }
      }
      
      // --- Extraer Ruta Principal (LineString) ---
      const line = pm.getElementsByTagName("LineString")[0];
      if (line) {
        trk = pm; 
        const coordText = line.getElementsByTagName("coordinates")[0]?.textContent?.trim();
        
        let times: number[] = [];
        const extendedData = pm.getElementsByTagName("ExtendedData")[0];
        if (extendedData) {
          const timeDataElement = extendedData.querySelector('Data[name="times"] > value');
          if (timeDataElement?.textContent) {
            times = timeDataElement.textContent.split(',').map(t => parseInt(t, 10));
          }
        }
        
        if (coordText) {
          const coords = coordText.split(/\s+/);
          for (let i = 0; i < coords.length; i++) {
            const c = coords[i];
            const [lonStr, latStr, eleStr] = c.split(",");
            if (!lonStr || !latStr) continue;
            
            trackPoints.push({ 
              lon: parseFloat(lonStr), 
              lat: parseFloat(latStr), 
              ele: eleStr ? parseFloat(eleStr) : 0,
              time: times[i] || 0 // Assign extracted time, or 0 if not found
            });
          }
        }
      }
    }
    
    return { waypoints, trackPoints, trk };
  }
}