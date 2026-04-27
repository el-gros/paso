import { Inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { ToastController, PopoverController } from '@ionic/angular';
import { Storage } from '@ionic/storage-angular';
import { TranslateService } from '@ngx-translate/core';
import DOMPurify from 'dompurify';

// --- INTERNAL IMPORTS ---
// Asegúrate de importar LocationResult aquí
import { Track, Data, Waypoint, TrackDefinition, LocationResult } from '../../globald';

@Injectable({
  providedIn: 'root'
})
export class FunctionsService {
  
  // ==========================================================================
  // 1. CONFIGURACIÓN Y ESTADO GENERAL
  // ==========================================================================
  private _storage: Storage | null = null;
  
  public key: string | undefined = undefined;
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
  public placesCollection: LocationResult[] = []; // Inicializado con su tipo
  
  public properties: (keyof Data)[] = ['compAltitude', 'compSpeed'];
  public refreshCollectionUI?: () => void;

  constructor(
    private storage: Storage,
    private toastController: ToastController,
    @Inject(Router) private router: Router,
    private popoverController: PopoverController,
    private translate: TranslateService,
  ) {}

  /** Inicializa la instancia del storage y carga los datos globales */
  public async init(): Promise<void> {
    this._storage = await this.storage.create();
    await this.loadGlobalCollections(); // <-- Cargamos todo al arrancar
  }

  // ==========================================================================
  // 4. GESTIÓN DE COLECCIONES (Trayectos y Lugares)
  // ==========================================================================

  /**
   * Carga desde el disco duro (Storage) los trayectos y lugares.
   * Al ejecutarse en el init(), garantiza que tab1, archive, etc. tengan datos inmediatos.
   */
  private async loadGlobalCollections(): Promise<void> {
    // Cargar Trayectos
    const storedTracks = await this.storeGet<TrackDefinition[]>('collection');
    this.collection = storedTracks || [];

    // Cargar Lugares
    const storedPlaces = await this.storeGet<LocationResult[]>('saved_places');
    this.placesCollection = storedPlaces || [];

    // NUEVO: Forzar que todos los lugares empiecen ocultos al arrancar la app
    this.placesCollection.forEach(place => place.visible = false);
    this.sortPlacesAlphabetically();
  }

  /**
   * Guarda la colección de lugares actual en el disco duro.
   */
  public async savePlacesToStorage(): Promise<void> {
    await this.storeSet('saved_places', this.placesCollection);
  }

  // --- CRUD PARA LUGARES ---

  public addPlace(place: LocationResult) {
    const exists = this.placesCollection.find(p => p.lat === place.lat && p.lon === place.lon);
    
    if (!exists) {
      // Intentar clasificar si no tiene categorías o si viene marcado como 'other'
      if (!place.categories || place.categories.length === 0 || (place.categories.length === 1 && place.categories[0] === 'other')) {
        const raw = place as any;
        // Lista ampliada para Nominatim y MapTiler
        const townTerms = ['city', 'town', 'village', 'hamlet', 'municipality', 'suburb', 'district', 'settlement', 'borough', 'locality', 'place', 'administrative'];
        
        const type1 = (raw.addresstype || '').toLowerCase();
        const type2 = (raw.type || '').toLowerCase();
        const type3 = (raw.class || '').toLowerCase();
        
        // Detección directa por términos
        let isTown = townTerms.includes(type1) || townTerms.includes(type2) || townTerms.includes(type3);
        
        // Detección por rango de importancia (rank 12-16 suele ser municipio/ciudad en OSM)
        const rank = raw.place_rank || 0;
        if ((type2 === 'administrative' || type3 === 'boundary') && (rank >= 12 && rank <= 16)) {
          isTown = true;
        }

        if (isTown) place.categories = ['towns'];
        else if (!place.categories || place.categories.length === 0) place.categories = ['other'];
      }

      // 🔥 NUEVO: Se guarda como OCULTO para no tapar el resultado rojo de la búsqueda
      place.visible = false;

      this.placesCollection.push(place);
      this.sortPlacesAlphabetically();
      this.savePlacesToStorage();
      this.displayToast(this.translate.instant('ARCHIVE.PLACE_SAVED'), 'success');
    } else {
      this.displayToast(this.translate.instant('ARCHIVE.PLACE_EXISTS'), 'warning');
    }
  }
 
  public updatePlace(index: number, updatedPlace: LocationResult) {
    if (this.placesCollection[index]) {
      this.placesCollection[index] = updatedPlace;
      this.sortPlacesAlphabetically();
      this.savePlacesToStorage();
    }
  }

  /**
   * Ordena la colección de lugares alfabéticamente por nombre.
   * Se utiliza 'numeric: true' para que "Punto 2" vaya antes que "Punto 10".
   */
  private sortPlacesAlphabetically() {
    this.placesCollection.sort((a, b) => {
      const nameA = a.name || '';
      const nameB = b.name || '';
      return nameA.localeCompare(nameB, undefined, { sensitivity: 'base', numeric: true });
    });
  }

  public removePlace(index: number) {
    this.placesCollection.splice(index, 1);
    this.savePlacesToStorage();
  }

  // --- CRUD PARA TRAYECTOS ---

  /** Elimina un track del almacenamiento físico y de la colección en memoria. */
  public async removeTrackFromCollection(index: number): Promise<void> {
    const trackToRemove = this.collection[index];
    if (trackToRemove && trackToRemove.date) {
      const key = new Date(trackToRemove.date).toISOString();
      await this.storeRem(key);
    }
    this.collection.splice(index, 1);
    await this.storeSet('collection', this.collection); // Persiste la lista de trayectos
  }


  // ==========================================================================
  // 5. PERSISTENCIA GENÉRICA (Storage Helpers)
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

  public async check<T>(defaultValue: T, key: string): Promise<T> {
    const res = await this.storeGet<T>(key);
    if (res !== null && res !== undefined) {
      return res;
    } else {
      await this.storeSet(key, defaultValue); 
      return defaultValue;
    }
  }

  public async retrieveTrack(): Promise<Track | undefined> {
    if (!this.key) return undefined;
    return await this.storeGet<Track>(this.key) || undefined;
  }

  // ==========================================================================
  // 6. UTILIDADES DE TEXTO Y FORMATO
  // ==========================================================================

  public sanitize(input: string): string {
    const clean = (input || '').replace(/<!\[CDATA\[/g, "").replace(/\]\]>/g, "").replace(/\n/g, '<br>');
    return DOMPurify.sanitize(clean, { ALLOWED_TAGS: ['br'] }).trim();
  }

  public formatMillisecondsToUTC(ms: number): string {
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
  // 7. INTERFAZ DE USUARIO (UI & NAVEGACIÓN)
  // ==========================================================================

  public async editWaypoint(waypoint: Waypoint, showAltitude: boolean, edit: boolean): Promise<{ action: string; name?: string; comment?: string } | undefined> {
    const { WptPopoverComponent } = await import('../wpt-popover.component'); 
    const popover = await this.popoverController.create({
      component: WptPopoverComponent,
      componentProps: {
        wptEdit: { ...waypoint, name: this.sanitize(waypoint.name || ''), comment: this.sanitize(waypoint.comment || '') },
        edit, showAltitude
      },
      cssClass: 'top-glass-island-wrapper', translucent: true, dismissOnSelect: false, backdropDismiss: true
    });
    await popover.present();
    const { data } = await popover.onDidDismiss();
    return data;
  }

  public async displayToast(message: string, css: string, duration: number = 3000): Promise<void> {
      const finalMessage = this.translate.instant(message);
      const toast = await this.toastController.create({ 
        message: finalMessage, 
        duration: duration, 
        position: 'bottom', 
        cssClass: `toast toast-${css}`,
        // Si la duración es 0, mostramos el botón de OK para cierre manual
        buttons: duration === 0 ? [
          { text: this.translate.instant('GENERIC.OK'), role: 'cancel' }
        ] : [
          { icon: 'close-outline', role: 'cancel' }
        ]
      });
      await toast.present();
  }

  public gotoPage(path: string): void {
    if (this.isNavigating) return;
    this.isNavigating = true;
    this.router.navigate([path]);
    setTimeout(() => { this.isNavigating = false; }, 1000);
  }

  private determineCategory(location: any): string {
    // Lista de etiquetas de Nominatim que consideramos "Poblaciones"
    const townTags = [
      'city', 'town', 'village', 'hamlet', 'municipality', 
      'administrative', 'suburb', 'borough'
    ];

    // 1. Miramos la propiedad 'addresstype' o 'type' que viene de Nominatim
    const type = location.addresstype || location.type || '';
    
    if (townTags.includes(type.toLowerCase())) {
      return 'towns';
    }

    // 2. Si no hay coincidencia clara, devolvemos 'other' por defecto
    return 'other';
  }
}