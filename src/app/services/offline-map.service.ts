import { Injectable, Injector } from '@angular/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { TranslateService } from '@ngx-translate/core';
import { LoadingController } from '@ionic/angular';
import { BehaviorSubject, Subscription, Subject } from 'rxjs';

import { ServerService } from './server.service';
import { MbTilesService } from './mbtiles.service';
import { FunctionsService } from './functions.service';
import { GeographyService } from './geography.service';

import { global } from '../../environments/environment';

interface OfflineMap {
  filename: string;
  url: string;
  name?: string;
}

@Injectable({ providedIn: 'root' })
export class OfflineMapService {
  public missingMaps$ = new BehaviorSubject<string[]>([]);
  public availableMaps$ = new BehaviorSubject<string[]>([]);
  public isDownloading$ = new BehaviorSubject<boolean>(false);
  
  private downloadLoading: HTMLIonLoadingElement | null = null;
  private progressSub?: Subscription;
  private readonly ONLINE_MAPS = ['OpenStreetMap', 'OpenTopoMap', 'German_OSM', 'MapTiler_streets', 'MapTiler_outdoor', 'MapTiler_hybrid', 'MapTiler_v_outdoor', 'IGN'];
  public displayMaps$ = new BehaviorSubject<string[]>(this.ONLINE_MAPS);
  public mapNeedsRefresh$ = new Subject<void>();

  constructor(
    private server: ServerService,
    private mbTiles: MbTilesService,
    private fs: FunctionsService,
    private geography: GeographyService,
    private translate: TranslateService,
    private loadingCtrl: LoadingController
  ) {}

async refreshMapsList() {
    const offlineMapsDef = (global.offlineMaps || []) as OfflineMap[];
    
    try {
        const files = await this.server.listFilesInDataDirectory();
        
        // 1. Actualizar mapas faltantes
        this.missingMaps$.next(
        offlineMapsDef
            .filter(map => !files.includes(map.filename))
            .map(map => map.name || map.filename.replace(/\.mbtiles$/i, ''))
        );

        // 2. Actualizar mapas disponibles
        const availableItems = offlineMapsDef.filter(map => files.includes(map.filename));
        this.availableMaps$.next(
        availableItems.map(map => map.name || map.filename.replace(/\.mbtiles$/i, ''))
        );

        // 3. Decidir qué mostrar en el selector de la UI
        if (availableItems.length > 0) {
            // QUITAMOS 'Auto'. Mostramos los online y al final la opción offline explícita.
            this.displayMaps$.next([...this.ONLINE_MAPS, 'OSM offline']);
        } else {
            // Si NO hay archivos: Solo mapas online
            this.displayMaps$.next(this.ONLINE_MAPS);

            // --- SEGURIDAD ---
            const currentProvider = this.geography.mapProvider;
            // Solo comprobamos 'OSM offline'
            if (currentProvider === 'OSM offline') {
                this.geography.mapProvider = 'OpenStreetMap';
                await this.fs.storeSet('mapProvider', 'OpenStreetMap');
                this.mapNeedsRefresh$.next(); 
            }
       }
    } catch (e) {
        console.error('Error refreshing maps list:', e);
        this.displayMaps$.next(this.ONLINE_MAPS);
    }
}

  async downloadMap(displayName: string) {
    const offlineMapsDef = (global.offlineMaps || []) as OfflineMap[];
    const match = offlineMapsDef.find(item => 
      (item.name || item.filename.replace(/\.mbtiles$/i, '')) === displayName
    );

    if (!match) return;

    this.isDownloading$.next(true);
    const text = this.translate.instant('SETTINGS.DOWNLOADING');

    this.downloadLoading = await this.loadingCtrl.create({
      message: text,
      spinner: 'crescent',
      backdropDismiss: false 
    });
    await this.downloadLoading.present();

    const updateProgress = (progress: number) => {
      const percent = Math.round(progress);
      if (this.downloadLoading && percent > 0) {
        this.downloadLoading.message = `${text} ${percent}%`;
      }
    };

    if (this.server.getDownloadProgress) {
        this.progressSub = this.server.getDownloadProgress().subscribe(updateProgress);
    }

    try {
      await this.server.downloadBinaryFile(match.url, match.filename, updateProgress);
      await this.mbTiles.open(match.filename);
      await this.postActionCleanup(true);
      
      if (this.geography.mapProvider === 'OSM offline') {
        this.mapNeedsRefresh$.next();
      }
    } catch (err) {
      await this.postActionCleanup(false);
    }
  }

  async removeMap(displayName: string) {
    const offlineMapsDef = (global.offlineMaps || []) as OfflineMap[];
    const match = offlineMapsDef.find(item => 
      (item.name || item.filename.replace(/\.mbtiles$/i, '')) === displayName
    );

    if (!match) return;

    try {
      await this.mbTiles.close(match.filename);
      await Filesystem.deleteFile({ path: match.filename, directory: Directory.Data });
      await this.refreshMapsList();
      this.fs.displayToast(this.translate.instant('SETTINGS.REMOVEMAP'), 'success');

      if (this.geography.mapProvider === 'OSM offline') {
        this.mapNeedsRefresh$.next();
      }
    } catch (error) {
      this.fs.displayToast(this.translate.instant('SETTINGS.FAILED_REMOVEMAP'), 'error');
    }
  }

  private async postActionCleanup(success: boolean) {
    this.progressSub?.unsubscribe();
    this.isDownloading$.next(false);
    await this.downloadLoading?.dismiss();
    await this.refreshMapsList();
    
    const msg = success ? 'SETTINGS.UPLOADMAP' : 'SETTINGS.FAILED_UPLOADMAP';
    this.fs.displayToast(this.translate.instant(msg), success ? 'success' : 'error');
  }
}