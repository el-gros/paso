/**
 * Service for managing and sharing track and status data across the application.
 * Provides observables and methods to set and get the current track, archived track, and status.
 * Uses BehaviorSubject for reactive state management.
 */

import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class TrackService {

  // 1. SET CURRENT TRACK
  // 2. GET CURRENT TRACK
  // 3. SET ARCHIVED TRACK
  // 4. GET ARCHIVED TRACK
  // 5. SET STATUS
  // 6. GET STATUS

  // currentTrack
  private currentTrackSource = new BehaviorSubject<any>(null);
  currentTrack$ = this.currentTrackSource.asObservable();
  state: string = 'inactive';

  // 1. SET CURRENT TRACK /////////////////////////
  setCurrentTrack(track: any) {
    this.currentTrackSource.next(track);
  }

  // 2. GET CURRENT TRACK /////////////////////////
  getCurrentTrack() {
    return this.currentTrackSource.value;
  }

  // archivedTrack
  private archivedTrackSource = new BehaviorSubject<any>(null);
  archivedTrack$ = this.archivedTrackSource.asObservable();

  // 3. SET ARCHIVED TRACK /////////////////////////
  setArchivedTrack(track: any) {
    this.archivedTrackSource.next(track);
  }

  // 4. GET ARCHIVED TRACK /////////////////////////
  getArchivedTrack() {
    return this.archivedTrackSource.value;
  }

  /*
  // --- Status (black | red | green) ---
  private statusSource = new BehaviorSubject<'black' | 'red' | 'green'>('black');
  status$ = this.statusSource.asObservable();

  // 5. SET STATUS /////////////////////////
  setStatus(status: 'black' | 'red' | 'green') {
    this.statusSource.next(status);
  }

  // 6. GET STATUS /////////////////////////
  getStatus(): 'black' | 'red' | 'green' {
    return this.statusSource.value;
  }

*/

  // --- Current Point ---
  private currentPointSource = new BehaviorSubject<number>(0);
  currentPoint$ = this.currentPointSource.asObservable();

  // 7. SET CURRENT POINT /////////////////////////
  setCurrentPoint(point: number) {
    this.currentPointSource.next(point);
  }

  // 8. GET CURRENT POINT /////////////////////////
  getCurrentPoint(): number {
    return this.currentPointSource.value;
  }

}
