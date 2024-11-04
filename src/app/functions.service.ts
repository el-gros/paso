import { global } from 'src/environments/environment';
import { Data, Bounds, Track, TrackDefinition  } from 'src/globald';
import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})

export class FunctionsService {

  lag: number = global.lag; // 8

  constructor(

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
    if (milliseconds < 500) return '00:00:00'
    const seconds = Math.floor(milliseconds / 1000);
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;
    return `${this.padZero(hours)}:${this.padZero(minutes)}:${this.padZero(remainingSeconds)}`;
  }

  padZero(value: number): string {
    return value.toString().padStart(2, '0');
  }

  async filterSpeed(abb: any, initial: number) {
    var num: number = abb.length;
    for (var i = initial; i <= num - 1; i++) {
      var start: number = Math.max(i - this.lag, 0);
      var distance: number = await abb[i].distance - abb[start].distance;
      var time: number = await abb[i].time - abb[start].time;
      abb[i].compSpeed = 3600000 * distance / time;
    }
    return abb;
  }

}

