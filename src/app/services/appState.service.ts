import { Injectable, NgZone } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { App as CapacitorApp } from '@capacitor/app';
import { filter, distinctUntilChanged } from 'rxjs/operators';
import { PluginListenerHandle } from '@capacitor/core';

@Injectable({
  providedIn: 'root'
})
export class AppStateService {
  private foreground$ = new BehaviorSubject<boolean>(true);
  private listenerHandle?: PluginListenerHandle;

  constructor(private zone: NgZone) {
    this.init();
  }

  private async init() {
    // 1. Estado inicial
    const state = await CapacitorApp.getState();
    this.foreground$.next(state.isActive);

    // 2. Escuchar cambios dentro de la Zona de Angular
    this.listenerHandle = await CapacitorApp.addListener('appStateChange', ({ isActive }) => {
      // Importante: Capacitor corre fuera de Angular, usamos zone.run para que 
      // los componentes que escuchen el observable actualicen la UI automáticamente.
      this.zone.run(() => {
        console.log(`App state changed: ${isActive ? 'FOREGROUND' : 'BACKGROUND'}`);
        this.foreground$.next(isActive);
      });
    });
  }

  // Getters útiles
  get currentForegroundValue(): boolean {
    return this.foreground$.value;
  }

  isForeground$() {
    return this.foreground$.asObservable().pipe(distinctUntilChanged());
  }

  onEnterForeground() {
    return this.isForeground$().pipe(filter(v => v === true));
  }

  onEnterBackground() {
    return this.isForeground$().pipe(filter(v => v === false));
  }
}