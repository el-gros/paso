import { global } from 'src/environments/environment';
import { Data, Bounds, Track, TrackDefinition  } from 'src/globald';
import { Injectable } from '@angular/core';
//import { Storage } from '@ionic/storage-angular';


@Injectable({
  providedIn: 'root'
})
export class FunctionsService {

  lag: number = global.lag; // 8

  constructor(
//    private storage: Storage,
  ) { }

  async computeDistance(lon1: number, lat1: number, lon2: number, lat2: number) {
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
    for (const datum of data) {
      const value = datum[propertyName];
      if (value < bounds.min) bounds.min = value;
      if (value > bounds.max) bounds.max = value;
    }
    return bounds;
  }

  async filterSpeed(abb: any) {
    var num: number = abb.length;
    var start: number = Math.max(num - this.lag - 1, 0);
    var distance: number = abb[num - 1].distance - abb[start].distance;
    var time: number = abb[num - 1].time - abb[start].time;
    abb[num - 1].compSpeed = 3600000 * distance / time;
    return abb;
  }

  async speedFilter(abb: any, lag: number) {
    var num: number = abb.length;
    var start: number = Math.max(num - lag - 1, 0);
    var distance: number = abb[num - 1].distance - abb[start].distance;
    var time: number = abb[num - 1].time - abb[start].time;
    abb[num - 1].compSpeed = 3600000 * distance / time;
    return abb;
  }

  async speedFilterAll(abb: any, lag: number) {
    var num: number = abb.length;
    abb[0].compSpeed = 0;
    for (var i = 1; i < num; i++) {
      var start: number = Math.max(i - lag, 0);
      var distance: number = await abb[i].distance - abb[start].distance;
      var time: number = await abb[i].time - abb[start].time;
      abb[i].compSpeed = 3600000 * distance / time;
    }
    return abb;
  }

}

/*
  selectStyle(provider: string, type: string | null) {
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
*/
