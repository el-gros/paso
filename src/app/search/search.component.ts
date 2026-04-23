import { 
  Component, 
  inject, 
  OnInit, 
  OnDestroy, 
  ChangeDetectorRef, 
  NgZone, 
  Output, 
  EventEmitter 
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule, Platform } from '@ionic/angular';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { Keyboard } from '@capacitor/keyboard';
import { Subject, Subscription, firstValueFrom } from 'rxjs';

// --- OPENLAYERS ---
import Feature from 'ol/Feature';
import { Point } from 'ol/geom';
import Overlay from 'ol/Overlay';

// --- SERVICIOS GLOBALES ---
import { SearchService } from '../services/search.service';
import { GeographyService } from '../services/geography.service';
import { LocationManagerService } from '../services/location-manager.service';
import { ReferenceService } from '../services/reference.service';
import { StylerService } from '../services/styler.service';
import { FunctionsService } from '../services/functions.service';
import { WikiService, WikiSummary } from '../services/wiki.service';
import { WeatherService, WeatherData } from '../services/weather.service';
import { LanguageService } from '../services/language.service';
import { SpeechRecognition } from '@capacitor-community/speech-recognition';
import { MapInteractionService } from '../services/map-interaction.service';

// --- INTERFACES ---
import { LocationResult, WikiWeatherResult, Track } from '../../globald';

export type SearchMode = 'place' | 'route' | 'services';

interface SpeechListener {
  remove: () => Promise<void>;
}

@Component({
  standalone: true,
  selector: 'app-search',
  templateUrl: './search.component.html',
  styleUrls: ['./search.component.scss'],
  imports: [CommonModule, IonicModule, FormsModule, TranslateModule]
})
export class SearchComponent implements OnInit, OnDestroy {
  @Output() onWikiResult = new EventEmitter<WikiWeatherResult>();
  @Output() onClearResult = new EventEmitter<void>();

  // Inyecciones
  private searchService = inject(SearchService);
  public geography = inject(GeographyService);
  public reference = inject(ReferenceService);
  private location = inject(LocationManagerService);
  public stylerService = inject(StylerService);
  public fs = inject(FunctionsService);
  private wikiService = inject(WikiService);
  private weatherService = inject(WeatherService);
  private languageService = inject(LanguageService);
  private cdr = inject(ChangeDetectorRef);
  private platform = inject(Platform);
  private translate = inject(TranslateService);
  private zone = inject(NgZone);
  public mapInteraction = inject(MapInteractionService);
  private mapPickerSub?: Subscription;
  private mapLabelOverlay?: Overlay;
  private mapLabelElement?: HTMLElement;
  private labelTimeout?: any;

  // Estado UI
  public mode: SearchMode = 'place';
  public step: number = 1; 
  public loading: boolean = false;
  public isSearching = false; // Control para evitar ráfagas de servicios
  
  // Datos
  public query: string = '';
  public results: LocationResult[] = [];
  public selectedServices: string[] = [];
  
  public routeData = {
    origin: { label: '', coords: null as [number, number] | null },
    destination: { label: '', coords: null as [number, number] | null },
    transport: 'foot-walking'
  };

  private searchSubject = new Subject<string>();
  private searchSub?: Subscription;

// Variables de Voz
  public isListening: boolean = false;
  private speechPluginListener: SpeechListener | null = null;

  // Listas completas restauradas
  public transportMeans = [
    { id: 'foot-walking', icon: 'walk-outline', label: 'SEARCH.WALK' },
    { id: 'foot-hiking', icon: 'trending-up-outline', label: 'SEARCH.HIKE' },
    { id: 'cycling-regular', icon: 'bicycle-outline', label: 'SEARCH.CYCLE' },
    { id: 'driving-car', icon: 'car-outline', label: 'SEARCH.DRIVE' },
  ];

  public serviceItems = [
    { id: 'pharmacy', icon: 'medkit-outline', label: 'SERVICES.PHARMACY', color: 'red' },
    { id: 'hospital', icon: 'hospital-outline', label: 'SERVICES.HOSPITAL', color: 'red' },
    { id: 'police', icon: 'shield-outline', label: 'SERVICES.POLICE', color: 'blue' },
    { id: 'ev_charging', icon: 'flash-outline', label: 'SERVICES.EV_CHARGING', color: 'blue' },
    { id: 'fuel', icon: 'flame-outline', label: 'SERVICES.FUEL', color: 'blue' },
    { id: 'parking', icon: 'parking-outline', label: 'SERVICES.PARKING', color: 'blue' },
    { id: 'transport', icon: 'bus-outline', label: 'SERVICES.TRANSPORT', color: 'blue' },
    { id: 'atm', icon: 'card-outline', label: 'SERVICES.ATM', color: 'green' },
    { id: 'accommodation', icon: 'bed-outline', label: 'SERVICES.ACCOMMODATION', color: 'green' },
    { id: 'supermarket', icon: 'cart-outline', label: 'SERVICES.SUPERMARKET', color: 'green' },
    { id: 'food', icon: 'restaurant-outline', label: 'SERVICES.FOOD', color: 'green' }
  ];

  ngOnInit() {
    // 1. Configuración de la búsqueda por texto
    this.searchSub = this.searchSubject.pipe(
      debounceTime(700),
      distinctUntilChanged()
    ).subscribe(term => this.performSearch(term));

    // 2. Escuchador del mapa con Geocodificación Inversa y Rótulo Custom
    this.mapPickerSub = this.mapInteraction.onMapPointSelected.subscribe(async (coords) => {
      
      const lon = coords[0];
      const lat = coords[1];

      // --- A. INICIALIZAR Y MOSTRAR EL RÓTULO (Estilos en línea a prueba de Angular) ---
      if (!this.mapLabelOverlay) {
        this.mapLabelElement = document.createElement('div');
        
        // Estilos inyectados directamente al HTML para que no se borren al cerrar el panel
        Object.assign(this.mapLabelElement.style, {
          backgroundColor: 'rgba(255, 255, 255, 0.95)',
          padding: '8px 16px',
          borderRadius: '20px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          fontSize: '16px', // Tamaño aumentado a 16px
          fontWeight: '800',
          color: '#333',
          whiteSpace: 'normal',
          maxWidth: '80vw',
          textAlign: 'center',
          lineHeight: '1.4',
          opacity: '0',
          pointerEvents: 'none',
          transition: 'opacity 0.3s ease-in-out',
          position: 'relative'
        });
        
        this.mapLabelOverlay = new Overlay({
          element: this.mapLabelElement,
          positioning: 'bottom-center',
          stopEvent: false,
          offset: [0, -25] // Elevación exacta de tu custom-control
        });
        this.geography.map?.addOverlay(this.mapLabelOverlay);
      }

      // Reiniciamos el timeout si el usuario hace clics rápidos
      if (this.labelTimeout) clearTimeout(this.labelTimeout);

      // Posicionamos en el mapa y mostramos "Buscando..."
      if (this.mapLabelElement && this.mapLabelOverlay) {
        this.mapLabelOverlay.setPosition([lon, lat]);
        this.mapLabelElement.textContent = this.translate.instant('RECORD.SEARCHING_PLACE');
        this.mapLabelElement.style.opacity = '1';
      }

      // --- B. BÚSQUEDA DEL NOMBRE (Geocoding) ---
      let placeName = `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
      let shortName = placeName;

      try {
        const result: any = await firstValueFrom(this.searchService.reverseGeocode(lat, lon));
        if (result) {
          shortName = result.short_name || result.name || placeName;
          placeName = result.display_name || result.name || placeName;
          if (shortName === this.translate.instant('SEARCH.NO_NAME')) shortName = placeName;
          
          // Actualizamos el rótulo con el nombre real
          if (this.mapLabelElement) {
            this.mapLabelElement.textContent = `📍 ${shortName}`;
          }
        }
      } catch (error) {
        if (this.mapLabelElement) {
          this.mapLabelElement.textContent = this.translate.instant('RECORD.UNKNOWN_PLACE');
        }
      }

      // --- C. LIMPIEZA AUTOMÁTICA DEL RÓTULO ---
      this.labelTimeout = setTimeout(() => {
        if (this.mapLabelElement) this.mapLabelElement.style.opacity = '0';
        
        // Esperamos a que termine la transición de opacidad y lo eliminamos del mapa
        setTimeout(() => {
          if (this.mapLabelOverlay) {
            this.geography.map?.removeOverlay(this.mapLabelOverlay);
            this.mapLabelOverlay = undefined;
          }
        }, 300);
      }, 4000);

      // --- D. CREAR RESULTADO Y CERRAR CICLO ---
      this.zone.run(() => {
        const resMock: any = {
          name: placeName,
          short_name: shortName,
          display_name: placeName || this.translate.instant('SEARCH.MAP_POINT_SELECTED'),
          lon: lon,
          lat: lat,
          // Añadimos estas propiedades vacías para evitar errores en showLocationOnMap
          boundingbox: [String(lat), String(lat), String(lon), String(lon)],
          geojson: { type: 'Point', coordinates: [lon, lat] }
        };
        
        // Lo enviamos a la función principal
        this.handleSelection(resMock);
        
        // Aseguramos que el panel vuelva a abrirse tras el clic
        this.reference.isSearchGuidePopoverOpen = true;
        this.cdr.detectChanges();
      });
    });
  }

  ngOnDestroy() {
    this.searchSub?.unsubscribe();
    this.mapPickerSub?.unsubscribe();
    if (this.isListening) this.stopListening();
  }

  // --- CIERRE DEL PANEL ---
  closePanel() {
    this.reference.isSearchGuidePopoverOpen = false;
  }

  // --- MÉTODOS DE LIMPIEZA ---
  clearPlace() {
    this.query = '';
    this.results = [];
    this.geography.searchLayer?.getSource()?.clear();
    this.reference.foundPlace = false;
    this.onClearResult.emit();
    this.cdr.detectChanges();
  }

  async clearRoute() {
    this.routeData = {
      origin: { label: '', coords: null },
      destination: { label: '', coords: null },
      transport: 'foot-walking'
    };
    this.step = 1;
    this.query = '';
    this.results = [];
    
    this.reference.clearArchivedTrack();
    this.reference.foundRoute = false;
    await this.location.sendReferenceToPlugin();
    this.cdr.detectChanges();
  }

  clearServices() {
    this.selectedServices = [];
    this.geography.searchLayer?.getSource()?.clear();
    this.cdr.detectChanges();
  }

  // --- NAVEGACIÓN Y MODOS ---
  setMode(newMode: SearchMode) {
    this.mode = newMode;
    this.query = '';
    this.results = [];
    this.step = 1;
    this.cdr.detectChanges();
  }

  // --- LÓGICA DE BÚSQUEDA ---
  onInput(ev: any) {
    const val = ev.detail.value;
    this.query = val;
    this.searchSubject.next(val);
  }

  async performSearch(term: string) {
    if (term.trim().length < 3) {
      this.results = [];
      this.cdr.detectChanges();
      return;
    }
    this.loading = true;
    try {
      this.results = await this.searchService.searchPlaces(term);
    } catch (error) {
      console.error("Error buscando lugares:", error);
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  async handleSelection(res: LocationResult) {
    if (this.platform.is('capacitor')) await Keyboard.hide();

    if (this.mode === 'place') {
      
      // 1. ASIGNACIÓN AUTOMÁTICA DE CATEGORÍAS
      // Si el lugar no tiene categorías previas, intentamos adivinarla por su 'type'
      if (!res.categories || res.categories.length === 0) {
        const type = res.type?.toLowerCase() || '';
        
        if (['city', 'town', 'village', 'municipality', 'locality', 'hamlet', 'suburb', 'place', 'administrative'].includes(type)) {
          res.categories = ['towns'];
        } else if (['peak', 'mountain', 'forest', 'wood', 'nature_reserve', 'park', 'hill'].includes(type)) {
          res.categories = ['mountain'];
        } else if (['water', 'lake', 'river', 'beach', 'bay', 'coastline'].includes(type)) {
          res.categories = ['water'];
        } else if (['hotel', 'hostel', 'guest_house', 'camp_site', 'alpine_hut'].includes(type)) {
          res.categories = ['accommodation'];
        } else if (['restaurant', 'cafe', 'fast_food', 'bar', 'pub'].includes(type)) {
          res.categories = ['food'];
        } else if (['pharmacy', 'hospital', 'police', 'fuel', 'parking', 'bus_station', 'station', 'taxi'].includes(type)) {
          res.categories = ['logistics'];
        } else if (['museum', 'monument', 'ruins', 'viewpoint', 'attraction', 'artwork'].includes(type)) {
          res.categories = ['poi'];
        } else {
          // Si no encaja en nada obvio, lo mandamos a 'other' por defecto
          res.categories = ['other'];
        }
      }

      // 2. ¡GUARDADO AUTOMÁTICO EN TU ARCHIVO!
      // Se añade a placesCollection y se guarda en disco sin duplicar gracias a tu FunctionsService
      this.fs.addPlace(res);

      // 3. Solo intentamos mostrar en el mapa si tenemos lo mínimo necesario
      if (res.lon && res.lat) {
        this.geography.showLocationOnMap(res);
      }
      
      this.reference.foundPlace = true; 
      
      // 4. Buscamos Wikipedia y Clima
      await this.searchWiki(res);

      // 5. Cerramos el panel
      this.closePanel(); 
    } 
    else if (this.mode === 'route') {
      const label = res.short_name || res.name;
      const coords: [number, number] = [res.lon, res.lat];

      if (this.step === 1) {
        this.routeData.origin = { label, coords };
        this.step = 2;
        this.query = '';
        this.results = [];
      } else {
        this.routeData.destination = { label, coords };
        this.step = 3;
      }
    }
    
    // Forzamos que la UI se entere de que ya no estamos seleccionando en el mapa
    this.cdr.detectChanges();
  }

  // --- WIKIPEDIA Y CLIMA ---
  async searchWiki(location: LocationResult) {
    this.loading = true;
    const currentLang = this.languageService.currentLangValue || 'es';

    try {
      const [wikiData, weatherData] = await Promise.all([
        this.wikiService.getWikiData(location).catch(() => null),
        this.weatherService.getWeather(location.lat, location.lon, currentLang).catch(() => null),
      ]);

      this.zone.run(() => {
        if (wikiData || weatherData) {
          const combinedResult: WikiWeatherResult = {
            wiki: wikiData as WikiSummary,
            weather: weatherData as WeatherData,
            locationName: location.name,
          };
          this.onWikiResult.emit(combinedResult);
        }
      });
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  // --- ACCIONES ESPECIALES ---
  async useCurrentLocation() {
    this.loading = true;
    try {
      const pos = await this.location.getCurrentPosition();
      if (pos) {
        const resMock: any = { 
          name: this.translate.instant('SEARCH.MY_LOCATION'), 
          lon: pos[0], 
          lat: pos[1],
          short_name: this.translate.instant('SEARCH.MY_LOCATION')
        };
        this.handleSelection(resMock);
      }
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  pickFromMap(event?: Event) {
    // 1. Evitamos que el clic atraviese al mapa
    if (event) {
      event.stopPropagation();
      event.preventDefault();
    }

    // 2. Si ya estaba activo, lo apagamos (Interruptor)
    if (this.mapInteraction.isMapPickerActive) {
      this.mapInteraction.isMapPickerActive = false;
      if (this.geography.map) this.geography.map.getTargetElement().style.cursor = '';
      this.fs.displayToast(this.translate.instant('SEARCH.MAP_SELECTION_CANCELED'), 'warning');
      return;
    }

    // 3. Lo activamos
    this.mapInteraction.isMapPickerActive = true;
    
    if (this.geography.map) {
      this.geography.map.getTargetElement().style.cursor = 'crosshair';
    }
    
    this.fs.displayToast(this.translate.instant('SEARCH.TOUCH_MAP_TO_SELECT'), 'info');
  }

  // --- SERVICIOS ---
  toggleService(id: string) {
    const idx = this.selectedServices.indexOf(id);
    if (idx > -1) this.selectedServices.splice(idx, 1);
    else this.selectedServices.push(id);
  }

  async applyServices() {
    if (this.selectedServices.length === 0 || this.isSearching) return;

    // 1. Bloqueamos la interfaz y mostramos el spinner de carga
    this.isSearching = true;
    this.loading = true;
    this.cdr.detectChanges();

    try {
      const map = this.geography.map;
      if (!map) return;

      const view = map.getView();
      const size = map.getSize();
      if (!size) throw new Error('Map size not available');

      const center = view.getCenter();
      let extent = view.calculateExtent(size);

      const latDiff = Math.abs(extent[3] - extent[1]);
      const lonDiff = Math.abs(extent[2] - extent[0]);

      if ((latDiff > 0.4 || lonDiff > 0.4) && center && center.length >= 2) {
        const delta = 0.015; 
        extent = [
          center[0] - delta, center[1] - delta, 
          center[0] + delta, center[1] + delta  
        ];
      }

      const bbox = [extent[1], extent[0], extent[3], extent[2]];
      const serviceResults = await this.searchService.searchServices(this.selectedServices, bbox);

      if (serviceResults && serviceResults.length > 0) {
        const features = serviceResults.map((result: any) => {
          const feature = new Feature({
            geometry: new Point([result.lon, result.lat]),
            name: result.name,
            type: result.type,
            serviceId: result.serviceId
          });
          
          const serviceConfig = this.serviceItems.find(s => s.id === result.serviceId);
          const pinColor = serviceConfig ? serviceConfig.color : '#ff0000';
          const icon = serviceConfig ? serviceConfig.icon : 'alert';

          feature.setStyle(this.stylerService.createIconPinStyle(pinColor, icon));
          return feature;
        });

        this.geography.searchLayer?.getSource()?.addFeatures(features);
        
        // 2. Solo cerramos el panel y avisamos cuando todo ha ido bien
        this.closePanel();
        this.fs.displayToast(this.translate.instant('SEARCH.SERVICES_FOUND', { count: features.length }), 'success');
      } else {
        this.fs.displayToast(this.translate.instant('SEARCH.NO_SERVICES_FOUND'), 'warning');
      }

    } catch (error) {
      console.error('❌ Error:', error);
      this.fs.displayToast(this.translate.instant('SEARCH.SERVICES_ERROR'), 'error');
    } finally {
      // 3. Liberamos el estado de carga
      this.isSearching = false;
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  // --- RUTA FINAL ---
  async getRoute() {
    if (!this.routeData.origin.coords || !this.routeData.destination.coords) return;
    this.loading = true;
    try {
      const data = await this.searchService.getRoute(
        this.routeData.origin.coords, 
        this.routeData.destination.coords, 
        this.routeData.transport
      );
      
      if (data) {
        const newTrack = this.searchService.processRouteResponse(
          data, 
          this.routeData.origin.label, 
          this.routeData.destination.label, 
          this.routeData.transport
        );
        
        this.reference.archivedTrack = newTrack;
        this.reference.foundRoute = true;
        await this.location.sendReferenceToPlugin();
        await this.reference.displayArchivedTrack();
        await this.geography.setMapView(newTrack);
        
        this.closePanel();
      }
    } catch (error) {
      this.fs.displayToast(this.translate.instant('SEARCH.ROUTING_ERROR'), 'danger');
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  // Borra SOLO la selección de botones, sin tocar el mapa
  clearServicesSelection() {
    this.selectedServices = [];
    this.cdr.detectChanges();
  }

  clearServicesMap() {
    this.geography.searchLayer?.getSource()?.clear();
    this.fs.displayToast(this.translate.instant('SEARCH.PINS_REMOVED'), 'success');
    this.closePanel();
  }

  // --- LÓGICA DE VOZ (DICTADO) ---
  
  async startDictation() {
    if (this.isListening) await this.stopListening();
    
    try {
      const available = await SpeechRecognition.available();
      if (!available.available) {
        this.fs.displayToast('SEARCH.NO_SPEECHRECOGNITION', 'warning');
        return;
      }

      await SpeechRecognition.requestPermissions();
      this.isListening = true;
      this.cdr.detectChanges();

      this.speechPluginListener = await SpeechRecognition.addListener(
        'partialResults',
        (data: any) => {
          if (data.matches?.length > 0) {
            this.zone.run(() => {
              this.query = data.matches[0];
              // Lanzar búsqueda reactiva
              this.onInput({ detail: { value: this.query } }); 
              this.cdr.detectChanges();
            });
          }
        }
      );

      const lang = this.languageService.currentLangValue || 'es-ES';
      await SpeechRecognition.start({
        language: lang,
        partialResults: true,
        popup: false,
      });

      // Parada automática tras 6 segundos
      setTimeout(() => {
        if (this.isListening) this.stopListening();
      }, 6000);

    } catch (e) {
      this.stopListening();
    }
  }

  async stopListening() {
    this.isListening = false;
    
    if (this.speechPluginListener) {
      await this.speechPluginListener.remove();
      this.speechPluginListener = null;
    }
    
    try {
      await SpeechRecognition.stop();
    } catch (e) {}
    
    this.cdr.detectChanges();

    // Esperar un momento y asegurar la búsqueda si hay texto
    setTimeout(() => {
      this.zone.run(async () => {
        if (this.query?.trim().length > 1) {
          await this.performSearch(this.query);
        }
      });
    }, 400);
  }
}