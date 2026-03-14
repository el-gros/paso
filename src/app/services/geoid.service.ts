import { Injectable } from '@angular/core';
import * as egm96 from 'egm96-universal';

@Injectable({
  providedIn: 'root'
})
export class GeoidService {

  public getCorrectedAltitude(lat: number, lon: number, rawAltitude: number): number {
    // Convierte directamente del elipsoide al geoide (MSL)
    const correctedAlt = egm96.ellipsoidToEgm96(lat, lon, rawAltitude);
    
    return parseFloat(correctedAlt.toFixed(2));
  }
}