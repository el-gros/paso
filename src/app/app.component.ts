import { Component, NgZone, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule, Platform } from '@ionic/angular';
import { TranslateModule } from '@ngx-translate/core';

// --- CAPACITOR IMPORTS ---
import { App, URLOpenListenerEvent } from '@capacitor/app';
import { ScreenOrientation } from '@capacitor/screen-orientation';
import { PluginListenerHandle } from '@capacitor/core';
import { SplashScreen } from '@capacitor/splash-screen';

// --- SERVICES ---
import { FunctionsService } from './services/functions.service';
import { MapService } from './services/map.service';
import { LanguageService } from './services/language.service';
import { MbTilesService } from './services/mbtiles.service';
import { TrackImportService } from './services/track-import.service';

import { useGeographic } from 'ol/proj';

useGeographic();

@Component({
  selector: 'app-root',
  standalone: true,
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  imports: [
    IonicModule,
    CommonModule,
    FormsModule,
    TranslateModule
  ],
})
export class AppComponent implements OnDestroy {
  private appUrlListener?: PluginListenerHandle;

  constructor(
    private platform: Platform,
    private zone: NgZone,
    public fs: FunctionsService,
    private mapService: MapService,
    private language: LanguageService,
    private mbTilesService: MbTilesService,
    private trackImportService: TrackImportService
  ) {
    this.initializeApp();
  }

// 1. INITIALIZE APP
  async initializeApp() {
    await this.platform.ready();
    await this.fs.init();
    await this.language.initLanguage();
    
    // Delegamos la carga de mapas MBTiles al servicio correspondiente
    await this.mbTilesService.initializeOfflineMaps(); 
    
    // 2. Damos un pequeño margen y refrescamos el estilo del mapa
    setTimeout(() => {
      this.mapService.refreshOfflineStyle();
    }, 500);

    this.lockToPortrait();
    this.setupFileListener();

    // 🚀 NUEVO: Ocultamos la pantalla de carga suavemente
    // Le damos un pequeño respiro a Angular (100ms) para renderizar el HTML del mapa
    setTimeout(async () => {
      await SplashScreen.hide();
    }, 100);
  }

  ngOnDestroy() {
    if (this.appUrlListener) this.appUrlListener.remove();
  }

  async lockToPortrait() {
    if (this.platform.is('capacitor')) {
      try {
        await ScreenOrientation.lock({ orientation: 'portrait' });
      } catch (err) {
        console.warn('Orientation lock not supported');
      }
    }
  }

  // 2. SETUP FILE LISTENER
  private async setupFileListener() {
    this.appUrlListener = await App.addListener('appUrlOpen', (data: URLOpenListenerEvent) => {
      this.zone.run(async () => {
        const track = await this.trackImportService.processImportUrl(data.url);
        if (track) {
          this.mapService.pendingTrack$.next(track);
          this.fs.gotoPage('tab1');
        }
      });
    });
  }
}