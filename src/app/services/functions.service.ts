import { Inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { ToastController, PopoverController } from '@ionic/angular';
import { Storage } from '@ionic/storage-angular';
import { TranslateService } from '@ngx-translate/core';
import DOMPurify from 'dompurify';

// --- INTERNAL IMPORTS ---
import { Track, Data, Waypoint, TrackDefinition } from '../../globald';

@Injectable({
  providedIn: 'root'
})
export class FunctionsService {
  
  // ==========================================================================
  // 1. CONFIGURACIÓN Y ESTADO GENERAL
  // ==========================================================================
  private _storage: Storage | null = null;
  
  public key: string | undefined = undefined;
  //public buildTrackImage: boolean = false;
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

  /** Inicializa la instancia del storage */
  public async init(): Promise<void> {
    this._storage = await this.storage.create();
  }

  // ==========================================================================
  // 4. PERSISTENCIA (Storage)
  // ==========================================================================

  /** 
   * Guarda un objeto en el almacenamiento persistente.
   * @param key Identificador único (usualmente el ISOString de la fecha).
   * @param object Datos a guardar (Track, Colección, etc).
   */
  public async storeSet(key: string, object: any): Promise<void> { 
    await this._storage?.set(key, object); 
  }

  public async storeGet<T = any>(key: string): Promise<T | null> { 
    return await this._storage?.get(key) || null; 
  }

  /**
   * Elimina un track del almacenamiento físico y de la colección en memoria.
   */
  public async removeTrackFromCollection(index: number): Promise<void> {
    const trackToRemove = this.collection[index];
    if (trackToRemove && trackToRemove.date) {
      const key = new Date(trackToRemove.date).toISOString();
      await this.storeRem(key);
    }
    this.collection.splice(index, 1);
    await this.storeSet('collection', this.collection);
  }

  /** Elimina un objeto del storage por su clave */
  public async storeRem(key: string): Promise<void> { 
    await this._storage?.remove(key); 
  }

  /**
   * Recupera un valor o inicializa el storage con un valor por defecto si no existe.
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

  /** Recupera el track de la memoria basado en la propiedad 'key' actual */
  public async retrieveTrack(): Promise<Track | undefined> {
    if (!this.key) return undefined;
    return await this.storeGet<Track>(this.key) || undefined;
  }

  // ==========================================================================
  // 5. UTILIDADES DE TEXTO Y FORMATO
  // ==========================================================================

  /** 
   * Limpia strings de etiquetas CDATA y convierte saltos de línea en HTML.
   * Utiliza DOMPurify para evitar inyecciones de código.
   */
  public sanitize(input: string): string {
    const clean = (input || '').replace(/<!\[CDATA\[/g, "").replace(/\]\]>/g, "").replace(/\n/g, '<br>');
    return DOMPurify.sanitize(clean, { ALLOWED_TAGS: ['br'] }).trim();
  }

  /**
   * Convierte milisegundos en formato legible HH:mm:ss.
   * @param ms Tiempo en milisegundos.
   */
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

  /**
   * Lanza el popover para editar o ver los detalles de un Waypoint (PDI).
   * @param waypoint Objeto Waypoint a editar.
   * @param showAltitude Define si se muestra el campo de altitud.
   * @param edit Define si el formulario es editable o solo lectura.
   */
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

  /**
   * Muestra un mensaje temporal en la parte inferior de la pantalla.
   * @param message Clave de traducción o texto plano.
   * @param css Clase de estilo (success, error, warning).
   */
  public async displayToast(message: string, css: string): Promise<void> {
      const finalMessage = this.translate.instant(message);

      const toast = await this.toastController.create({ 
        message: finalMessage, 
        duration: 3000, 
        position: 'bottom', 
        cssClass: `toast toast-${css}`,
        buttons: [{
          icon: 'close-outline',
          role: 'cancel'
        }]
      });
      await toast.present();
  }

  /**
   * Navega a una ruta con un pequeño debouncing para evitar navegación doble.
   * @param path Ruta de destino (ej: 'tab1').
   */
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