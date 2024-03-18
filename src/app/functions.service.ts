import { Location, Element, Result, Block, Point, Track, TrackDefinition } from 'src/globald';
import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class FunctionsService {

  constructor() { }

  /*
  async computeDistance(lat1: number, lon1: number, lat2:number, lon2:number) {     
    const earthRadiusInKm = 6371; // Radius of the earth in km
    var distanceInKm = 0;
    const dLat = this.deg2rad(lat2 - lat1); // deg2rad below
    const dLon = this.deg2rad(lon2 - lon1);
    const a =
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(this.deg2rad(lat1)) * Math.cos(this.deg2rad(lat2)) *
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    distanceInKm = earthRadiusInKm * c; // Distance in km
    return distanceInKm;
  }
  */

  async computeDistances(lat1: number, lon1: number, lat2:number, lon2:number) {     
    const earthRadiusInKm = 6371; // Radius of the earth in km
    var xInKm = 0;
    var yInKm = 0;
    const dLat = this.deg2rad(lat2 - lat1); // deg2rad below
    const dLon = this.deg2rad(lon2 - lon1);
    yInKm = earthRadiusInKm * dLat;
    xInKm = earthRadiusInKm * dLon * Math.cos(this.deg2rad(0.5 * lat2 + 0.5 * lat1)) ;
    var distances: Point = {x: xInKm, y: yInKm};
    return distances;
  }



  deg2rad(deg: number): number {
    return deg * (Math.PI/180)
  }

  async computeSlopes(h1: number, h2: number) {
    var elevationGain = 0;
    var elevationLoss = 0; 
    if (h2 > h1) elevationGain = h2 - h1;
    else elevationLoss = h1 - h2;
    return {gain: elevationGain, loss: elevationLoss};
  }

  formatMillisecondsToUTC(milliseconds: number): string {
    const seconds = Math.floor(milliseconds / 1000);
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;
  
    return `${this.padZero(hours)}:${this.padZero(minutes)}:${this.padZero(remainingSeconds)}`;
  }
  
  padZero(value: number): string {
    return value.toString().padStart(2, '0');
  }

  gridValue(dx: number) {
    const nx = Math.floor(Math.log10(dx));
    const x = dx / (10 ** nx);
    if (x < 2.5) return 0.5 * (10 ** nx);
    else if (x < 5) return 10 ** nx;
    else return 2 * (10 ** nx);
  }

  async computeMinMaxProperty(locations: Location[], propertyName: keyof Location) {
    var bounds: Block 
    bounds = {
      min: Number.POSITIVE_INFINITY,
      max: Number.NEGATIVE_INFINITY
    }  
    if (propertyName == 'simulated') return bounds;
    for (const location of locations) {
      const propertyValue = location[propertyName];
      if (propertyValue < bounds.min) bounds.min = propertyValue; 
      if (propertyValue > bounds.max) bounds.max = propertyValue; 
    }  
    return bounds ;
  }


}
