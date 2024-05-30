import { global } from 'src/environments/environment';
import { Data, Bounds, Track } from 'src/globald';
import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class FunctionsService {

  lag: number = global.lag; // 8

  constructor() { }

  async computeDistance(lon1: number, lat1: number, lon2:number, lat2:number) {
    const toRadians = (degrees: number) => degrees * (Math.PI / 180);
    const dLat = toRadians(lat2 - lat1);
    const dLon = toRadians(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const earthRadiusKm = 6371;
    return earthRadiusKm * c; 
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

  async computeMinMaxProperty(data: Data[], propertyName: keyof Data) {
    var bounds: Bounds = {
      min: Number.POSITIVE_INFINITY,
      max: Number.NEGATIVE_INFINITY
    }  
    if (propertyName == 'simulated') return bounds;
    for (const datum of data) {
      const value = datum[propertyName];
      if (value < bounds.min) bounds.min = value; 
      if (value > bounds.max) bounds.max = value; 
    }  
    return bounds ;
  }

  selectStyle(provider: string, type: string|null) {
    var style: any
    if (provider == 'Tomtom') {
      if (type == 'basic') style = {
        map: '2/basic_street-light',
        poi: '2/poi_light',
        trafficIncidents: '2/incidents_light',
        trafficFlow: '2/flow_relative-light',
      } 
      else style = {
        map: '2/basic_street-satellite', 
        poi: '2/poi_light',
        trafficIncidents: '2/incidents_light',
        trafficFlow: '2/flow_relative-light',
      }
    }
    else {
      if (type == 'basic') style = 'mapbox://styles/mapbox/outdoors-v12'
      else style = 'mapbox://styles/mapbox/satellite-v9' 
    }
    return style;
  }

  async filterSpeed(track: Track) {
    var num: number = track.data.length;
    var start: number = Math.max(num - this.lag - 1, 0);
    var distance: number = track.data[num-1].distance - track.data[start].distance;
    var time: number = track.data[num-1].time - track.data[start].time;
    track.data[num-1].compSpeed = 3600000 * distance / time;
    return track;
  }

  async geoFilterSpeed(abb: any, num: number, lag: number) {
    var num: number = abb.data.properties;
    var start: number = Math.max(num - lag - 1, 0);
    var distance: number = abb.distance[num-1] - abb.distance[start];
    var time: number = abb.time[num-1] - abb.time[start];
    abb.compSpeed[num-1] = 3600000 * distance / time;
    return abb;
  }



}
