import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { App as CapacitorApp } from '@capacitor/app';
import { filter, distinctUntilChanged } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class AppStateService {
  private foreground$ = new BehaviorSubject<boolean>(true);

  constructor() {
    // Set initial state
    CapacitorApp.getState().then(state => {
      this.foreground$.next(state.isActive);
    });

    // Listen for changes
    CapacitorApp.addListener('appStateChange', ({ isActive }) => {
      this.foreground$.next(isActive);
    });
  }

  isForeground() {
    return this.foreground$.value;
  }

  isForeground$() {
    return this.foreground$.asObservable().pipe(
      distinctUntilChanged()
    );
  }

  onEnterForeground() {
    return this.foreground$.asObservable().pipe(
      distinctUntilChanged(),
      filter(v => v === true)
    );
  }

  onEnterBackground() {
    return this.foreground$.asObservable().pipe(
      distinctUntilChanged(),
      filter(v => v === false)
    );
  }
}
