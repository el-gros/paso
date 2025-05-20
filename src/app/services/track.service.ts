import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class TrackService {

  // currentTrack
  private currentTrackSource = new BehaviorSubject<any>(null);
  currentTrack$ = this.currentTrackSource.asObservable();

  setCurrentTrack(track: any) {
    this.currentTrackSource.next(track);
  }

  getCurrentTrack() {
    return this.currentTrackSource.value;
  }

  // archivedTrack
  private archivedTrackSource = new BehaviorSubject<any>(null);
  archivedTrack$ = this.archivedTrackSource.asObservable();

  setArchivedTrack(track: any) {
    this.archivedTrackSource.next(track);
  }

  getArchivedTrack() {
    return this.archivedTrackSource.value;
  }

  // --- Status (black | red | green) ---
  private statusSource = new BehaviorSubject<'black' | 'red' | 'green'>('black');
  status$ = this.statusSource.asObservable();

  setStatus(status: 'black' | 'red' | 'green') {
    this.statusSource.next(status);
  }

  getStatus(): 'black' | 'red' | 'green' {
    return this.statusSource.value;
  }

}
