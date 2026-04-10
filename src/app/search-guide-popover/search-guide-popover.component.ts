import {
  Component,
  inject,
  OnInit,
  ChangeDetectorRef,
  NgZone,
  Output,
  EventEmitter,
  OnDestroy,
} from '@angular/core';

import { FormsModule } from '@angular/forms';
import { IonicModule, Platform, PopoverController } from '@ionic/angular';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { SpeechRecognition } from '@capacitor-community/speech-recognition';
import { Keyboard } from '@capacitor/keyboard';
import { Subscription, Subject } from 'rxjs'; // 🚀 AÑADIDO: Subject
import { debounceTime, distinctUntilChanged } from 'rxjs/operators'; // 🚀 AÑADIDO: Operadores

// --- OPENLAYERS ---
import Feature from 'ol/Feature';
import { Point } from 'ol/geom';

// --- SERVICES ---
import { FunctionsService } from '../services/functions.service';
import { GeographyService } from '../services/geography.service';
import { ReferenceService } from '../services/reference.service';
import { LocationManagerService } from '../services/location-manager.service';
import { LanguageService } from '../services/language.service';
import { WikiService, WikiSummary } from '../services/wiki.service';
import { WeatherService, WeatherData } from '../services/weather.service';
import { SearchService } from '../services/search.service';
import { StylerService } from '../services/styler.service'; // Added for styling POIs

// --- INTERFACES ---
import { LocationResult, Track, WikiWeatherResult } from '../../globald';

interface SpeechListener {
  remove: () => Promise<void>;
}

@Component({
  standalone: true,
  selector: 'app-search-guide-popover',
  templateUrl: './search-guide-popover.component.html',
  styleUrls: ['./search-guide-popover.component.scss'],
  imports: [IonicModule, FormsModule, TranslateModule],
})
export class SearchGuidePopoverComponent implements OnInit, OnDestroy {
  @Output() onWikiResult = new EventEmitter<WikiWeatherResult>();
  @Output() onClearResult = new EventEmitter<void>();

  // Inyecciones
  public reference = inject(ReferenceService);
  public geography = inject(GeographyService);
  private location = inject(LocationManagerService);
  public fs = inject(FunctionsService);
  private languageService = inject(LanguageService);
  private platform = inject(Platform);
  private translate = inject(TranslateService);
  private cdr = inject(ChangeDetectorRef);
  private zone = inject(NgZone);
  private wikiService = inject(WikiService);
  private weatherService = inject(WeatherService);
  private stylerService = inject(StylerService); // Injected StylerService
  private searchService = inject(SearchService);
    
  private backButtonSub?: Subscription;
  private searchSubscription?: Subscription; // 🚀 NUEVO
  public searchSubject = new Subject<string>(); // 🚀 NUEVO: Escuchador de tipeo

  // Estado
  public query: string = '';
  public query2: string = '';
  public query3: string = '';
  public results: LocationResult[] = [];
  public loading: boolean = false;
  public isServicesPopoverOpen: boolean = false;
  public selectedServices: string[] = [];
  public activeRouteField: 'origin' | 'destination' = 'origin';
  public originCoords: [number, number] | null = null;
  public destinationCoords: [number, number] | null = null;
  public selectedTransport: string = 'foot-walking';

  public isListening: boolean = false;
  public activeTarget: 'query' | 'query2' | 'query3' | null = null;
  private speechPluginListener: SpeechListener | null = null;

  public transportMeans = [
    { id: 'foot-walking', icon: 'walk-sharp', label: 'SEARCH.WALK' },
    { id: 'foot-hiking', icon: 'trending-up-sharp', label: 'SEARCH.HIKE' },
    { id: 'cycling-regular', icon: 'bicycle-sharp', label: 'SEARCH.CYCLE' },
    { id: 'driving-car', icon: 'car-sharp', label: 'SEARCH.DRIVE' },
  ];

  public serviceItems = [
    // Grupo Rojo: Salud
    { id: 'pharmacy', icon: 'medical-sharp', label: 'SERVICES.PHARMACY', color: 'red' },
    { id: 'hospital', icon: 'heart-sharp', label: 'SERVICES.HOSPITAL', color: 'red' },
    // Grupo Azul: Transporte y Energía
    { id: 'ev_charging', icon: 'flash-sharp', label: 'SERVICES.EV_CHARGING', color: 'blue' },
    { id: 'parking', icon: 'car-sharp', label: 'SERVICES.PARKING', color: 'blue' },
    { id: 'transport', icon: 'bus-sharp', label: 'SERVICES.TRANSPORT', color: 'blue' },
    // Grupo Verde: Otros servicios
    { id: 'atm', icon: 'card-sharp', label: 'SERVICES.ATM', color: 'green' },
    { id: 'accommodation', icon: 'bed-sharp', label: 'SERVICES.ACCOMMODATION', color: 'green' },
    { id: 'supermarket', icon: 'basket-sharp', label: 'SERVICES.SUPERMARKET', color: 'green' },
    { id: 'food', icon: 'restaurant-sharp', label: 'SERVICES.FOOD', color: 'green' }
  ];

  constructor(private popoverController: PopoverController) {}

  ngOnInit() {
    this.backButtonSub = this.platform.backButton.subscribeWithPriority(
      10,
      () => {
        this.reference.isSearchPopoverOpen = false; // This closes the place search popover
        this.reference.isGuidePopoverOpen = false;
        this.reference.isSearchGuidePopoverOpen = false;
        this.isServicesPopoverOpen = false;
      }
    );

    // 🚀 NUEVO: Configuramos el "Debounce" para proteger Nominatim (Espera 700ms tras dejar de teclear)
    this.searchSubscription = this.searchSubject
      .pipe(debounceTime(700), distinctUntilChanged())
      .subscribe((searchTerm) => {
        if (searchTerm.trim().length > 2) {
          this.openList(searchTerm);
        } else {
          this.results = [];
          this.cdr.detectChanges();
        }
      });
  }

  ngOnDestroy() {
    this.backButtonSub?.unsubscribe();
    this.searchSubscription?.unsubscribe(); // Limpieza
    if (this.isListening) this.stopListening();
  }

  // ==========================================
  // LÓGICA DE VOZ (DICTADO)
  // ==========================================
  async startDictation(target: 'query' | 'query2' | 'query3') {
    if (this.isListening) await this.stopListening();
    const available = await SpeechRecognition.available();
    if (!available.available) {
      this.fs.displayToast('SEARCH.NO_SPEECHRECOGNITION', 'warning');
      return;
    }

    await SpeechRecognition.requestPermissions();
    this.activeTarget = target;
    this.isListening = true;
    this.cdr.detectChanges();

    this.speechPluginListener = await SpeechRecognition.addListener(
      'partialResults',
      (data: any) => {
        if (data.matches?.length > 0) {
          this.zone.run(() => {
            if (this.activeTarget === 'query') {
              this.query = data.matches[0];
              this.onSearchInput(this.query); // 🚀 Lanzar búsqueda reactiva
            } else if (this.activeTarget === 'query2')
              this.query2 = data.matches[0];
            else if (this.activeTarget === 'query3')
              this.query3 = data.matches[0];
            this.cdr.detectChanges();
          });
        }
      }
    );

    try {
      const lang = this.languageService.currentLangValue || 'es-ES';
      await SpeechRecognition.start({
        language: lang,
        partialResults: true,
        popup: false,
      });
      setTimeout(() => {
        if (this.isListening) this.stopListening();
      }, 6000);
    } catch (e) {
      this.stopListening();
    }
  }

  private async stopListening() {
    const targetAtStop = this.activeTarget;
    this.isListening = false;
    if (this.speechPluginListener) {
      await this.speechPluginListener.remove();
      this.speechPluginListener = null;
    }
    try {
      await SpeechRecognition.stop();
    } catch (e) {}
    this.cdr.detectChanges();

    if (targetAtStop) {
      setTimeout(() => {
        this.zone.run(async () => {
          if (targetAtStop === 'query2') {
            this.query = this.query2;
            this.activeRouteField = 'origin';
          } else if (targetAtStop === 'query3') {
            this.query = this.query3;
            this.activeRouteField = 'destination';
          }

          if (targetAtStop !== 'query' && this.query?.trim().length > 1)
            await this.openList(this.query);
          this.activeTarget = null;
        });
      }, 400);
    }
  }

  // ==========================================
  // BÚSQUEDA DE LUGARES (USANDO SEARCHSERVICE)
  // ==========================================

  // 🚀 NUEVO: Método para inyectar tecleos en el Subject
  onSearchInput(text: string | null | undefined) {
    if (text !== null && text !== undefined) {
      this.searchSubject.next(text);
    }
  }

  async openList(termToSearch: string = this.query) {
    if (!termToSearch.trim()) return;

    this.loading = true;
    this.cdr.detectChanges(); // Forzamos mostrar el spinner
    try {
      this.results = await this.searchService.searchPlaces(termToSearch);
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  async handleLocationSelection(location: LocationResult) {
    if (!location?.boundingbox || !location?.geojson) return;
    if (this.platform.is('capacitor')) await Keyboard.hide(); // 🚀 Ocultar teclado al seleccionar

    this.geography.showLocationOnMap(location);
    this.reference.foundPlace = true;

    await this.searchWiki(location);
  }

  // ==========================================
  // ENRUTAMIENTO (USANDO SEARCHSERVICE)
  // ==========================================
  async requestRoute() {
    if (!this.originCoords || !this.destinationCoords) {
      this.fs.displayToast('SEARCH.SELECT_BOTH', 'warning');
      return;
    }
    this.loading = true;
    try {
      if (this.platform.is('capacitor')) await Keyboard.hide();

      const responseData = await this.searchService.getRoute(
        this.originCoords,
        this.destinationCoords,
        this.selectedTransport
      );

      if (responseData?.routes?.length > 0) {
        const newTrack = this.searchService.processRouteResponse(
          responseData,
          this.query2,
          this.query3,
          this.selectedTransport
        );
        await this.displayRouteOnMap(newTrack);
      }

    } catch (error: any) {
      this.fs.displayToast(error.message || 'SEARCH.ROUTING_ERROR', 'error');
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  private async displayRouteOnMap(track: Track) {
    this.reference.isGuidePopoverOpen = false;
    this.reference.archivedTrack = track;
    this.reference.foundRoute = true;
    await this.location.sendReferenceToPlugin();
    await this.reference.displayArchivedTrack();
    await this.geography.setMapView(this.reference.archivedTrack);
  }

  // ==========================================
  // WIKIPEDIA Y CLIMA
  // ==========================================
  async searchWiki(location: LocationResult) {
    this.loading = true;
    const currentLang = this.languageService.currentLangValue || 'es';

    try {
      const [wikiData, weatherData] = await Promise.all([
        this.wikiService.getWikiData(location).catch(() => null),
        this.weatherService
          .getWeather(location.lat, location.lon, currentLang)
          .catch(() => null),
      ]);

      this.zone.run(() => {
        if (wikiData || weatherData) {
          const combinedResult: WikiWeatherResult = {
            wiki: wikiData as WikiSummary,
            weather: weatherData as WeatherData,
            locationName: location.name,
          };
          this.onWikiResult.emit(combinedResult);
          this.reference.isSearchPopoverOpen = false;
        }
      });
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  selectRoutePoint(result: LocationResult) {
    if (this.activeRouteField === 'origin') {
      this.query2 = result.short_name || result.name;
      this.originCoords = [result.lon, result.lat];
      this.activeRouteField = 'destination';
    } else {
      this.query3 = result.short_name || result.name;
      this.destinationCoords = [result.lon, result.lat];
    }
    this.results = [];
  }

  async useCurrentLocation(type: 'origin' | 'destination') {
    this.loading = true;
    try {
      const myPos = await this.location.getCurrentPosition();
      if (myPos) {
        if (type === 'origin') {
          this.query2 = this.translate.instant('SEARCH.MY_LOCATION');
          this.originCoords = myPos;
        } else {
          this.query3 = this.translate.instant('SEARCH.MY_LOCATION');
          this.destinationCoords = myPos;
        }
      }
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  onRouteButtonClick() {
    if (this.originCoords && this.destinationCoords) this.requestRoute();
    else {
      this.query =
        this.activeRouteField === 'origin' ? this.query2 : this.query3;
      this.openList();
    }
  }

  close() {
    this.popoverController.dismiss();
  }
  clearRouteForm() {
    this.query2 = '';
    this.query3 = '';
    this.originCoords = null;
    this.destinationCoords = null;
    this.results = [];
    this.activeRouteField = 'origin';
  }
  async clearSearchPlace() {
    this.geography.searchLayer?.getSource()?.clear();
    this.reference.foundPlace = false;
    this.onClearResult.emit();
  }
  async clearSearchRoute() {
    this.reference.clearArchivedTrack();
    this.reference.foundRoute = false;
    await this.location.sendReferenceToPlugin();
  }
  clearPlaceForm() {
    this.query = '';
    this.results = [];
  }
  openPlaceSearch() {
    this.clearPlaceForm();
    this.reference.isSearchPopoverOpen = true;
    this.reference.isSearchGuidePopoverOpen = false;
  }
  openRouteSearch() {
    this.clearRouteForm();
    this.reference.isGuidePopoverOpen = true;
    this.reference.isSearchGuidePopoverOpen = false;
  }

  openServicesSearch() {
    this.reference.isSearchGuidePopoverOpen = false; // Close main search guide popover
    this.isServicesPopoverOpen = true;
  }

  toggleService(serviceId: string) {
    const index = this.selectedServices.indexOf(serviceId);
    if (index > -1) {
      this.selectedServices.splice(index, 1);
    } else {
      this.selectedServices.push(serviceId);
    }
  }

  clearServices() {
    this.selectedServices = [];
    this.geography.searchLayer?.getSource()?.clear(); // Clear services from map when clearing selection
  }

  // New method to handle dismissal of the services popover
  async onServicesPopoverDismiss() {
    this.isServicesPopoverOpen = false;
    if (this.selectedServices.length > 0) {
      await this.performServicesSearch();
    } else {
      // Clear previous service search results if no services are selected
      this.geography.searchLayer?.getSource()?.clear();
    }
  }

// Variable de control para evitar ráfagas de peticiones
  private isSearching = false;

  async performServicesSearch() {
    // Si ya hay una búsqueda en marcha, no permitimos otra hasta que termine
    if (this.isSearching) return;

    this.isSearching = true;
    this.loading = true;
    this.cdr.detectChanges();

    try {
      const map = this.geography.map;
      if (!map) {
        this.fs.displayToast(this.translate.instant('MAP.NO_MAP_AVAILABLE'), 'error');
        return;
      }

      const view = map.getView();
      const size = map.getSize();
      if (!size) throw new Error('Map size not available');

      // 1. Obtenemos el centro y el extent actual (en grados por useGeographic)
      const center = view.getCenter();
      let extent = view.calculateExtent(size);

      // 2. LÓGICA DE REDUCCIÓN AUTOMÁTICA (UX Inteligente)
      // Si el mapa está muy lejos (> 0.05 grados o aprox 5km), centramos la búsqueda a un cuadro de ~3km
      const latDiff = Math.abs(extent[3] - extent[1]);
      const lonDiff = Math.abs(extent[2] - extent[0]);

      if ((latDiff > 0.4 || lonDiff > 0.4) && center && center.length >= 2) {
        console.log("📏 [PerformSearch] Área muy grande. Reduciendo a 3km para asegurar éxito.");
        const delta = 0.015; 
        
        extent = [
          center[0] - delta, // minLon
          center[1] - delta, // minLat
          center[0] + delta, // maxLon
          center[1] + delta  // maxLat
        ];
        
        this.fs.displayToast(this.translate.instant('SEARCH.REDUCED_AREA'), 'info');
      }

      /**
       * 3. Formato para searchServices: [minLat, minLon, maxLat, maxLon]
       * Importante: Reordenamos el extent de OL [minLon, minLat, maxLon, maxLat]
       */
      const bbox = [extent[1], extent[0], extent[3], extent[2]];

      // Llamada al servicio con la query optimizada
      const serviceResults = await this.searchService.searchServices(this.selectedServices, bbox);

      // 4. GESTIÓN DE RESULTADOS EN EL MAPA
      // Limpiamos siempre la capa de búsqueda antes de pintar
      this.geography.searchLayer?.getSource()?.clear();

      if (serviceResults && serviceResults.length > 0) {
        const features = serviceResults.map((result: any) => {
          const feature = new Feature({
            geometry: new Point([result.lon, result.lat]),
            name: result.name,
            type: result.type,
            serviceId: result.serviceId
          });
          
          // 🚨 CHIVATO PARA LA CONSOLA:
          // Esto te dirá exactamente qué ID está intentando buscar
          console.log(`Buscando servicio ID: "${result.serviceId}" en serviceItems...`);

          // Buscamos la configuración
          const serviceConfig = this.serviceItems.find(s => s.id === result.serviceId);

          if (!serviceConfig) {
            console.error(`¡Fallo! No existe ningún item en serviceItems con el id: "${result.serviceId}"`);
          }

          // Si falla, en lugar de usar 'location-sharp' (que es un pin), 
          // usaremos 'alert' y le pondremos un color rojo chillón para detectar el error en el mapa.
          const pinColor = serviceConfig ? serviceConfig.color : '#ff0000';
          const icon = serviceConfig ? serviceConfig.icon : 'alert'; // 👈 Cambiado para que deje de ser un pin

          feature.setStyle(this.stylerService.createIconPinStyle(pinColor, icon));
          return feature;
        });

        this.geography.searchLayer?.getSource()?.addFeatures(features);
        
        /* this.fs.displayToast(
          this.translate.instant('SEARCH.SERVICES_FOUND', { count: serviceResults.length }), 
          'success'
        );*/
      } else {
        this.fs.displayToast(this.translate.instant('SEARCH.NO_SERVICES_FOUND'), 'warning');
      }

    } catch (error) {
      console.error('❌ Error performing services search:', error);
      this.fs.displayToast(this.translate.instant('SEARCH.SERVICES_ERROR'), 'error');
    } finally {
      // Liberamos el bloqueo para permitir futuras búsquedas
      this.isSearching = false;
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

}
