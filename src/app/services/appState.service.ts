import { Injectable, NgZone, OnDestroy } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { filter, distinctUntilChanged } from 'rxjs/operators';
import { App as CapacitorApp } from '@capacitor/app';
import { PluginListenerHandle } from '@capacitor/core';

@Injectable({
  providedIn: 'root'
})
export class AppStateService implements OnDestroy {
  
  private foreground$ = new BehaviorSubject<boolean>(true);
  private listenerHandle?: PluginListenerHandle;

  // 🚀 Mejor práctica: Exponer los flujos como propiedades readonly
  public readonly isForeground$: Observable<boolean> = this.foreground$
    .asObservable()
    .pipe(distinctUntilChanged());

  public readonly onEnterForeground$: Observable<boolean> = this.isForeground$
    .pipe(filter(isActive => isActive === true));

  public readonly onEnterBackground$: Observable<boolean> = this.isForeground$
    .pipe(filter(isActive => isActive === false));

  constructor(private zone: NgZone) {
    this.initAppState();
  }

  // Getter síncrono útil para comprobaciones puntuales sin suscribirse
  get currentForegroundValue(): boolean {
    return this.foreground$.value;
  }

  private async initAppState(): Promise<void> {
    try {
      // 1. Estado inicial
      const state = await CapacitorApp.getState();
      this.foreground$.next(state.isActive);

      // 2. Escuchar cambios de estado desde la parte nativa
      this.listenerHandle = await CapacitorApp.addListener('appStateChange', ({ isActive }) => {
        // Envolvemos en zone.run para que la UI de Angular reaccione al cambio
        this.zone.run(() => {
          console.log(`[AppState] changed: ${isActive ? 'FOREGROUND' : 'BACKGROUND'}`);
          this.foreground$.next(isActive);
        });
      });
    } catch (error) {
      console.error('[AppState] Error inicializando el listener:', error);
    }
  }

  ngOnDestroy(): void {
    if (this.listenerHandle) {
      this.listenerHandle.remove();
    }
  }
}