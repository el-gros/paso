import { Inject, Injectable, Injector, inject } from '@angular/core';
import { Router } from '@angular/router';
import { ToastController, PopoverController, NavController, LoadingController } from '@ionic/angular';
import { Storage } from '@ionic/storage-angular';
import { TranslateService } from '@ngx-translate/core';
import DOMPurify from 'dompurify';

// --- SERVICES ---
import { TtsService } from './tts.service';

// --- INTERNAL IMPORTS ---
import { Track, Data, Waypoint, TrackDefinition, LocationResult } from '../../globald';

@Injectable({
  providedIn: 'root'
})
export class FunctionsService {

  private injector = inject(Injector); 
  public voiceControl: boolean = false;
  private loadingCtrl = inject(LoadingController);
  private navCtrl = inject(NavController);


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
  public placesCollection: LocationResult[] = []; 
  public virtualFolders: string[] = [];
  
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
    await this.loadGlobalCollections(); 
  }

  // ==========================================================================
  // 4. GESTIÓN DE COLECCIONES (Trayectos y Lugares)
  // ==========================================================================

  private async loadGlobalCollections(): Promise<void> {
    // Cargar Trayectos
    const storedTracks = await this.storeGet<TrackDefinition[]>('collection');
    
    // Saneamiento preventivo: asegura que ningún track antiguo rompa la UI
    this.collection = (storedTracks || []).map(t => ({
      ...t,
      folderPath: (t as any).folderPath || []
    })) as TrackDefinition[];

    // Cargar Lugares
    const storedPlaces = await this.storeGet<LocationResult[]>('saved_places');
    this.placesCollection = storedPlaces || [];

    // Cargar carpetas virtuales (incluso las vacías)
    this.virtualFolders = await this.storeGet<string[]>('virtual_folders') || [];

    // NUEVO: Cargar preferencia de voz (si no existe, por defecto false)
    this.voiceControl = await this.check<boolean>(false, 'voiceControl');

    // Forzar que todos los lugares empiecen ocultos al arrancar la app
    this.placesCollection.forEach(place => place.visible = false);
    this.sortPlacesAlphabetically();
  }

  /** Añade una nueva carpeta virtual y la persiste */
  public async addFolder(name: string) {
    const folderName = name.trim();
    if (folderName && !this.virtualFolders.includes(folderName)) {
      this.virtualFolders.push(folderName);
      await this.storeSet('virtual_folders', this.virtualFolders);
    }
  }
  public async savePlacesToStorage(): Promise<void> {
    await this.storeSet('saved_places', this.placesCollection);
  }

  // --- CRUD PARA LUGARES ---

  public addPlace(place: LocationResult) {
    const exists = this.placesCollection.find(p => p.lat === place.lat && p.lon === place.lon);
    
    if (!exists) {
      if (!place.categories || place.categories.length === 0 || (place.categories.length === 1 && place.categories[0] === 'other')) {
        const raw = place as any;
        const townTerms = ['city', 'town', 'village', 'hamlet', 'municipality', 'suburb', 'district', 'settlement', 'borough', 'locality', 'place', 'administrative'];
        
        const type1 = (raw.addresstype || '').toLowerCase();
        const type2 = (raw.type || '').toLowerCase();
        const type3 = (raw.class || '').toLowerCase();
        
        let isTown = townTerms.includes(type1) || townTerms.includes(type2) || townTerms.includes(type3);
        
        const rank = raw.place_rank || 0;
        if ((type2 === 'administrative' || type3 === 'boundary') && (rank >= 12 && rank <= 16)) {
          isTown = true;
        }

        if (isTown) place.categories = ['towns'];
        else if (!place.categories || place.categories.length === 0) place.categories = ['other'];
      }

      place.visible = false;
      this.placesCollection.push(place);
      this.sortPlacesAlphabetically();
      this.savePlacesToStorage();
      this.displayToast('ARCHIVE.PLACE_SAVED', 'success');
    } else {
      this.displayToast('ARCHIVE.PLACE_EXISTS', 'warning');
    }
  }
 
  public updatePlace(index: number, updatedPlace: LocationResult) {
    if (this.placesCollection[index]) {
      this.placesCollection[index] = updatedPlace;
      this.sortPlacesAlphabetically();
      this.savePlacesToStorage();
    }
  }

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

  public async removeTrackFromCollection(index: number): Promise<void> {
    const trackToRemove = this.collection[index];
    if (trackToRemove && trackToRemove.date) {
      const key = new Date(trackToRemove.date).toISOString();
      await this.storeRem(key);
    }
    this.collection.splice(index, 1);
    await this.storeSet('collection', this.collection);
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

  if (this.voiceControl) {
    const tts = this.injector.get(TtsService);
    
    // 1. Limpiamos cualquier emoji del texto antes de pasarlo al sintetizador
    const textWithoutEmojis = finalMessage.replace(/[\u1000-\uFFFF]|\p{Emoji_Presentation}|\p{Extended_Pictographic}/gu, '').trim();
    
    await tts.speak(textWithoutEmojis);
    return; // Ojo: si devuelves aquí, el toast visual nunca llega a mostrarse en pantalla
  }

  const toast = await this.toastController.create({ 
    message: finalMessage, 
    duration: duration, 
    position: 'bottom', 
    cssClass: `toast toast-${css}`,
    buttons: duration === 0 ? [
      { text: this.translate.instant('GENERIC.OK'), role: 'cancel' }
    ] : [
      { icon: 'close-outline', role: 'cancel' }
    ]
  });
  await toast.present();
}

  async gotoPage(url: string) {
    if (this.isNavigating) return;
    this.isNavigating = true;

    // 1. Mostramos el loading de cristal
    const loading = await this.loadingCtrl.create({
      spinner: 'crescent',
      cssClass: 'glass-loading-overlay'
    });
    
    // Esperamos a que se dibuje en pantalla
    await loading.present(); 

    try {
      // 2. Usamos el Router normal de Angular. 
      // Esto respeta tu sistema de pestañas y evita el "salto" a la página inicial.
      await this.router.navigate([url]); 
      
      // 3. LA CLAVE: Esperamos 400ms exactos.
      // Es el tiempo que tarda Ionic en hacer el "slide" y renderizar el DOM pesado.
      setTimeout(async () => {
        await loading.dismiss();
        this.isNavigating = false;
      }, 400);

    } catch (err) {
      console.error("Error navegando:", err);
      await loading.dismiss();
      this.isNavigating = false;
    }
  }

  private determineCategory(location: any): string {
    const townTags = ['city', 'town', 'village', 'hamlet', 'municipality', 'administrative', 'suburb', 'borough'];
    const type = location.addresstype || location.type || '';
    if (townTags.includes(type.toLowerCase())) return 'towns';
    return 'other';
  }
}