import { global } from 'src/environments/environment';
import { Track, Location  } from 'src/globald';
import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})

export class FunctionsService {

  lag: number = global.lag; // 8

  constructor(

  ) { }

  /* FUNCTIONS
    computeDistance
    formatMillisecondsToUTC
    filterSpeed
    fillGeojson
  */

  // COMPUTES DISTANCES ///////////////////////////////////// 
  async computeDistance(lon1: number, lat1: number, lon2: number, lat2: number): Promise<number> {
    // differences in latitude and longitude in radians
    const DEG_TO_RAD = Math.PI / 180;
    const dLat = (lat2 - lat1) * DEG_TO_RAD;
    const dLon = (lon2 - lon1) * DEG_TO_RAD;
    // Haversine formula
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * DEG_TO_RAD) * Math.cos(lat2 * DEG_TO_RAD) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);   
    // angular distance in radians
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    // distance in km
    const earthRadiusKm = 6371;
    return earthRadiusKm * c;  
  }

  // FORMAT MILISECONDS TO HH:MM:SS
  formatMillisecondsToUTC(milliseconds: number): string {
    const padZero = (num: number) => num.toString().padStart(2, '0');
    // convert ms to hours, minutes and seconds
    const seconds = Math.floor(milliseconds / 1000);
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;
    // format
    return `${padZero(hours)}:${padZero(minutes)}:${padZero(remainingSeconds)}`;
  }

  // FILTER SPEED ///////////////////////////////////////
  async filterSpeed(data: { altitude: number; speed: number; time: number; compSpeed: number; distance: number }[], initial: number): Promise<typeof data> {
    const num = data.length;
    // loop for points
    for (let i = initial; i < num; i++) {
        const start = Math.max(i - this.lag, 0);
        const distance = data[i].distance - data[start].distance;
        const time = data[i].time - data[start].time;
        // Check to avoid division by zero
        data[i].compSpeed = time > 0 ? (3600000 * distance) / time : 0;
    }
    return data;
  }

  // ADD POINT TO TRACK //////////////////////////////// 
  async fillGeojson(track: Track | undefined, location: Location): Promise<void> {
    if (!track) return;
    // Add minimal data
    track.features[0].geometry.properties.data.push({
        altitude: location.altitude,
        speed: location.speed,
        time: location.time,
        compSpeed: location.speed,  // Initial value; further processing can adjust it
        distance: 0  // Placeholder, will be computed later
    });
    // Add coordinates
    track.features[0].geometry.coordinates.push([location.longitude, location.latitude]);
  }

}

