import { Injectable } from '@angular/core';
import { FunctionsService } from './functions.service';
import { Waypoint, ParsedPoint } from '../../globald';

@Injectable({ providedIn: 'root' })
export class FileParserService {

  constructor(private fs: FunctionsService) {}

  async parseGpxXml(gpxText: string) {
    let waypoints: Waypoint[] = [];
    let trackPoints: ParsedPoint[] = [];
    let trk: Element | null = null;
    
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(gpxText, 'application/xml');
    
    if (xmlDoc.getElementsByTagName('parsererror').length > 0) throw new Error('Invalid GPX file format.');
    
    // Parse waypoints
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
    
    // Extract first track
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
      
      if (!isNaN(lat) && !isNaN(lon)) trackPoints.push({ lat, lon, ele, time });
    }
    return { waypoints, trackPoints, trk };
  }

  async parseKmlXml(xmlDoc: Document) {
    let waypoints: Waypoint[] = [];
    let trackPoints: ParsedPoint[] = []; 
    let trk: Element | null = null;
    
    const placemarks = xmlDoc.getElementsByTagName("Placemark");
    for (const pm of Array.from(placemarks)) {
      const name = pm.getElementsByTagName("name")[0]?.textContent || "";
      const desc = pm.getElementsByTagName("description")[0]?.textContent || "";
      
      // Waypoint
      const point = pm.getElementsByTagName("Point")[0];
      if (point) {
        const coordText = point.getElementsByTagName("coordinates")[0]?.textContent?.trim();
        if (coordText) {
          const [lonStr, latStr, eleStr] = coordText.split(",");
          waypoints.push({
            latitude: parseFloat(latStr), longitude: parseFloat(lonStr),
            altitude: eleStr ? parseFloat(eleStr) : 0,
            name: this.fs.sanitize(name), comment: this.fs.sanitize(desc),
          });
        }
      }
      
      // Track
      const line = pm.getElementsByTagName("LineString")[0];
      if (line) {
        trk = pm; 
        const coordText = line.getElementsByTagName("coordinates")[0]?.textContent?.trim();
        if (coordText) {
          const coords = coordText.split(/\s+/);
          for (const c of coords) {
            const [lonStr, latStr, eleStr] = c.split(",");
            if (!lonStr || !latStr) continue;
            trackPoints.push({ lon: parseFloat(lonStr), lat: parseFloat(latStr), ele: eleStr ? parseFloat(eleStr) : 0, time: 0 });
          }
        }
      }
    }
    return { waypoints, trackPoints, trk };
  }
}