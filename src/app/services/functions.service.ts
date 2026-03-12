import { Inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { ToastController, PopoverController } from '@ionic/angular';
import { Storage } from '@ionic/storage-angular';
import { TranslateService } from '@ngx-translate/core';
import DOMPurify from 'dompurify';

// --- INTERNAL IMPORTS ---
import { Track, Data, Waypoint, TrackDefinition } from 'src/globald';

@Injectable({
  providedIn: 'root'
})
export class FunctionsService {
  
  // ==========================================================================
  // 1. CONFIGURACIÓN Y ESTADO GENERAL
  // ==========================================================================
  private _storage: Storage | null = null;
  
  public key: string | undefined = undefined;
  public buildTrackImage: boolean = false;
  public reDraw: boolean = false;
  public lag: number = 8;
  public geocoding: string = 'maptiler';
  public alert: string = 'on';
  
  // ==========================================================================
  // 2. ESTADO DE NAVEGACIÓN Y RUTA (Global State)
  // ==========================================================================
  public isNavigating: boolean = false;
  public routeStatus: 'green' | 'red' | 'black' = 'black';
  public matchIndex: number = NaN;
  public kmRecorridos: number = 0;
  public kmRestantes: number = 0;
  
  // ==========================================================================
  // 3. DATOS Y COLECCIÓN
  // ==========================================================================
  public collection: TrackDefinition[] = [];
  public properties: (keyof Data)[] = ['compAltitude', 'compSpeed'];
  public refreshCollectionUI?: () => void;

  constructor(
    private storage: Storage,
    private toastController: ToastController,
    @Inject(Router) private router: Router,
    private popoverController: PopoverController,
    private translate: TranslateService,
  ) {}

  public async init(): Promise<void> {
    this._storage = await this.storage.create();
  }

  // ==========================================================================
  // 4. ALMACENAMIENTO (STORAGE)
  // ==========================================================================

  public async storeSet(key: string, object: any): Promise<void> { 
    await this._storage?.set(key, object); 
  }

  public async storeGet<T = any>(key: string): Promise<T | null> { 
    return await this._storage?.get(key) || null; 
  }

  public async storeRem(key: string): Promise<void> { 
    await this._storage?.remove(key); 
  }

  /**
   * Comprueba si existe un valor en Storage. Si no existe, devuelve el valor
   * por defecto y lo GUARDA en el Storage para futuras lecturas.
   */
  public async check<T>(defaultValue: T, key: string): Promise<T> {
    const res = await this.storeGet<T>(key);
    
    if (res !== null && res !== undefined) {
      return res;
    } else {
      // 🚀 Novedad: Si no existe, inicializamos el Storage con el valor por defecto
      await this.storeSet(key, defaultValue); 
      return defaultValue;
    }
  }

  public async retrieveTrack(): Promise<Track | undefined> {
    if (!this.key) return undefined;
    return await this.storeGet<Track>(this.key) || undefined;
  }

  // ==========================================================================
  // 5. UTILIDADES DE TEXTO Y FORMATO
  // ==========================================================================

  public sanitize(input: string): string {
    const clean = (input || '').replace(/<!\[CDATA\[/g, "").replace(/\]\]>/g, "").replace(/\n/g, '<br>');
    return DOMPurify.sanitize(clean, { ALLOWED_TAGS: ['br'] }).trim();
  }

  public formatMillisecondsToUTC(ms: number): string {
    // 🚀 Salvavidas: Si ms es NaN o negativo, devolvemos 0 para no romper la interfaz
    if (isNaN(ms) || ms < 0) return '00:00:00'; 

    const s = Math.floor(ms / 1000);
    const hours = Math.floor(s / 3600);
    const minutes = Math.floor((s % 3600) / 60);
    const seconds = s % 60;
    
    return [hours, minutes, seconds].map(v => v.toString().padStart(2, '0')).join(':');
  }

  public formatMsec(value: number | undefined): string {
    return value ? this.formatMillisecondsToUTC(value) : '00:00:00';
  }

  // ==========================================================================
  // 6. INTERFAZ DE USUARIO (UI & NAVEGACIÓN)
  // ==========================================================================

  public async editWaypoint(waypoint: Waypoint, showAltitude: boolean, edit: boolean): Promise<{ action: string; name?: string; comment?: string } | undefined> {
    const { WptPopoverComponent } = await import('../wpt-popover.component'); 

    const popover = await this.popoverController.create({
      component: WptPopoverComponent,
      componentProps: {
        wptEdit: {
          ...waypoint,
          name: this.sanitize(waypoint.name || ''),
          comment: this.sanitize(waypoint.comment || '')
        },
        edit,
        showAltitude
      },
      cssClass: 'top-glass-island-wrapper',
      translucent: true,
      dismissOnSelect: false,
      backdropDismiss: true
    });

    await popover.present();
    const { data } = await popover.onDidDismiss();
    return data;
  }

  public async displayToast(message: string, css: string): Promise<void> {
      const finalMessage = this.translate.instant(message);

      const toast = await this.toastController.create({ 
        message: finalMessage, 
        duration: 3000, 
        position: 'bottom', 
        cssClass: `toast toast-${css}`,
        buttons: [{
          icon: 'close-sharp',
          role: 'cancel'
        }]
      });
      await toast.present();
  }

  public gotoPage(path: string): void {
    if (this.isNavigating) return;

    this.isNavigating = true;
    this.router.navigate([path]);

    // Evitar doble pulsación rápida (debounce de navegación)
    setTimeout(() => {
      this.isNavigating = false;
    }, 1000);
  }
}