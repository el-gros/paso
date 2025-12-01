import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { App as CapacitorApp } from '@capacitor/app';
import { filter } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class AppStateService {
  private foreground$ = new BehaviorSubject<boolean>(true);

  constructor() {
    CapacitorApp.addListener('appStateChange', ({ isActive }) => {
      this.foreground$.next(isActive);
    });
  }

  isForeground() {
    return this.foreground$.value;
  }

  isForeground$() {
    return this.foreground$.asObservable();
  }

  onEnterForeground() {
    return this.foreground$.asObservable().pipe(
      filter(v => v === true)
    );
  }

  onEnterBackground() {
    return this.foreground$.asObservable().pipe(
      filter(v => v === false)
    );
  }
}
