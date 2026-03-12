import { Component, inject, OnInit, ChangeDetectorRef, NgZone, Output, EventEmitter, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule, Platform, PopoverController } from '@ionic/angular';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { SpeechRecognition } from '@capacitor-community/speech-recognition';
import { Keyboard } from '@capacitor/keyboard';
import { Subscription, Subject } from 'rxjs'; // 🚀 AÑADIDO: Subject
import { debounceTime, distinctUntilChanged } from 'rxjs/operators'; // 🚀 AÑADIDO: Operadores

// --- OPENLAYERS ---
import { GeoJSON } from 'ol/format';
import { Feature } from 'ol';
import { Point } from 'ol/geom';
import { FeatureLike } from 'ol/Feature';
import { Fill, Stroke, Style } from 'ol/style';
import { Coordinate } from 'ol/coordinate';

// --- SERVICES ---
import { FunctionsService } from '../services/functions.service';
import { GeographyService } from '../services/geography.service';
import { ReferenceService } from '../services/reference.service';
import { LocationManagerService } from '../services/location-manager.service';
import { LanguageService } from '../services/language.service';
import { StylerService } from '../services/styler.service';
import { WikiService, WikiSummary } from '../services/wiki.service';
import { WeatherService, WeatherData } from '../services/weather.service';
import { SearchService } from '../services/search.service';
import { GeoMathService } from '../services/geo-math.service';

// --- INTERFACES ---
import { LocationResult, Track, WikiWeatherResult } from 'src/globald';

interface SpeechListener { remove: () => Promise<void>; }

@Component({
  standalone: true,
  selector: 'app-search-guide-popover',
  templateUrl: './search-guide-popover.component.html',
  styleUrls: ['./search-guide-popover.component.scss'],
  imports: [IonicModule, CommonModule, FormsModule, TranslateModule],
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
  private styler = inject(StylerService);
  private platform = inject(Platform);
  private translate = inject(TranslateService);
  private cdr = inject(ChangeDetectorRef);
  private zone = inject(NgZone);
  private wikiService = inject(WikiService);
  private weatherService = inject(WeatherService);
  private searchService = inject(SearchService);
  private geoMath = inject(GeoMathService);

  private backButtonSub?: Subscription;
  private searchSubscription?: Subscription; // 🚀 NUEVO
  public searchSubject = new Subject<string>(); // 🚀 NUEVO: Escuchador de tipeo

  // Estado
  public query: string = '';
  public query2: string = '';
  public query3: string = '';
  public results: LocationResult[] = [];
  public loading: boolean = false;
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

  constructor(private popoverController: PopoverController) {}

  ngOnInit() {
    this.backButtonSub = this.platform.backButton.subscribeWithPriority(10, () => {
      this.reference.isSearchPopoverOpen = false;
      this.reference.isGuidePopoverOpen = false;
      this.reference.isSearchGuidePopoverOpen = false;
    });

    // 🚀 NUEVO: Configuramos el "Debounce" para proteger Nominatim (Espera 700ms tras dejar de teclear)
    this.searchSubscription = this.searchSubject.pipe(
      debounceTime(700),
      distinctUntilChanged()
    ).subscribe(searchTerm => {
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

    this.speechPluginListener = await SpeechRecognition.addListener('partialResults', (data: any) => {
      if (data.matches?.length > 0) {
        this.zone.run(() => {
          if (this.activeTarget === 'query') {
            this.query = data.matches[0];
            this.onSearchInput(this.query); // 🚀 Lanzar búsqueda reactiva
          }
          else if (this.activeTarget === 'query2') this.query2 = data.matches[0];
          else if (this.activeTarget === 'query3') this.query3 = data.matches[0];
          this.cdr.detectChanges();
        });
      }
    });

    try {
      const lang = this.languageService.currentLangValue || 'es-ES';
      await SpeechRecognition.start({ language: lang, partialResults: true, popup: false });
      setTimeout(() => { if (this.isListening) this.stopListening(); }, 6000);
    } catch (e) { this.stopListening(); }
  }

  private async stopListening() {
    const targetAtStop = this.activeTarget;
    this.isListening = false;
    if (this.speechPluginListener) { await this.speechPluginListener.remove(); this.speechPluginListener = null; }
    try { await SpeechRecognition.stop(); } catch (e) {}
    this.cdr.detectChanges();

    if (targetAtStop) {
      setTimeout(() => {
        this.zone.run(async () => {
          if (targetAtStop === 'query2') { this.query = this.query2; this.activeRouteField = 'origin'; }
          else if (targetAtStop === 'query3') { this.query = this.query3; this.activeRouteField = 'destination'; }
          
          if (targetAtStop !== 'query' && this.query?.trim().length > 1) await this.openList(this.query);
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
    
    const source = this.geography.searchLayer?.getSource();
    if (!source) return;

    source.clear();
    const geojsonFormat = new GeoJSON();
    const features = geojsonFormat.readFeatures(location.geojson);
    if (features.some(f => f.getGeometry()?.getType().includes('Polygon'))) {
      features.push(new Feature(new Point([location.lon, location.lat])));
    }

    source.addFeatures(features);
    this.geography.searchLayer?.setStyle((f) => this.applySearchStyle(f));
    this.reference.foundPlace = true;

    const extent = [location.boundingbox[2], location.boundingbox[0], location.boundingbox[3], location.boundingbox[1]];
    this.geography.map?.getView().fit(extent, { duration: 800, padding: [50, 50, 50, 50] });
    
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

      if (responseData?.features?.length > 0) {
        this.reference.isGuidePopoverOpen = false;
        await this.handleRouteResponse(responseData);
      }
    } catch (error: any) {
      this.fs.displayToast(error.message || 'SEARCH.ROUTING_ERROR', 'error');
    } finally { 
      this.loading = false; 
      this.cdr.detectChanges(); 
    }
  }

  async handleRouteResponse(geoJsonData: any) {
    const routeFeature = geoJsonData.features[0];
    const stats = routeFeature.properties.summary;
    const routeCoordinates: Coordinate[] = routeFeature.geometry.coordinates;

    let accumulatedDistance = 0;
    const trackData = routeCoordinates.map((c, index) => {
      if (index > 0) {
        const prev = routeCoordinates[index - 1];
        accumulatedDistance += this.geoMath.quickDistance(prev[0], prev[1], c[0], c[1]);
      }
      return {
        altitude: c[2] || 0,
        speed: 0,
        time: 0,
        compAltitude: c[2] || 0,
        compSpeed: 0,
        distance: accumulatedDistance
      };
    });

    const newTrack: Track = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: {
          name: `${this.query2} ➔ ${this.query3}`,
          place: this.query3,
          date: new Date(),
          description: this.translate.instant(`TRANSPORT.${this.selectedTransport.toUpperCase().replace('-', '_')}`),
          totalDistance: stats.distance / 1000,
          totalTime: Math.round(stats.duration * 1000),
          inMotion: Math.round(stats.duration * 1000), 
          totalElevationGain: Math.round(routeFeature.properties.ascent || 0),
          totalElevationLoss: Math.round(routeFeature.properties.descent || 0),
          totalNumber: routeCoordinates.length,
          currentSpeed: 0, 
          currentAltitude: 0
        },
        geometry: {
          type: 'LineString',
          coordinates: routeCoordinates as [number, number][],
          properties: { data: trackData }
        }
      }]
    };

    this.reference.archivedTrack = newTrack;
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
        this.weatherService.getWeather(location.lat, location.lon, currentLang).catch(() => null)
      ]);

      this.zone.run(() => {
        if (wikiData || weatherData) {
          const combinedResult: WikiWeatherResult = { 
            wiki: wikiData as WikiSummary, 
            weather: weatherData as WeatherData, 
            locationName: location.name 
          };
          this.onWikiResult.emit(combinedResult);
          this.reference.isSearchPopoverOpen = false;
        }
      });
    } finally { this.loading = false; this.cdr.detectChanges(); }
  }

  // ==========================================
  // UI Y UTILIDADES
  // ==========================================
  private applySearchStyle(feature: FeatureLike): Style | Style[] {
    const type = feature.getGeometry()?.getType();
    if (type === 'Point') return this.styler.createPinStyle('black');
    return new Style({
      stroke: new Stroke({ color: '#000', width: 2.5 }),
      fill: new Fill({ color: 'rgba(0, 0, 0, 0.15)' }),
    });
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
        if (type === 'origin') { this.query2 = this.translate.instant('SEARCH.MY_LOCATION'); this.originCoords = myPos; } 
        else { this.query3 = this.translate.instant('SEARCH.MY_LOCATION'); this.destinationCoords = myPos; }
      }
    } finally { this.loading = false; this.cdr.detectChanges(); }
  }

  onRouteButtonClick() {
    if (this.originCoords && this.destinationCoords) this.requestRoute();
    else { this.query = this.activeRouteField === 'origin' ? this.query2 : this.query3; this.openList(); }
  }

  close() { this.popoverController.dismiss(); }
  clearRouteForm() { this.query2 = ''; this.query3 = ''; this.originCoords = null; this.destinationCoords = null; this.results = []; this.activeRouteField = 'origin'; }
  async clearSearchPlace() { this.geography.searchLayer?.getSource()?.clear(); this.reference.foundPlace = false; this.onClearResult.emit(); }
  async clearSearchRoute() { this.reference.clearArchivedTrack(); this.reference.foundRoute = false; await this.location.sendReferenceToPlugin(); }
  clearPlaceForm() { this.query = ''; this.results = []; }
  openPlaceSearch() { this.clearPlaceForm(); this.reference.isSearchPopoverOpen = true; this.reference.isSearchGuidePopoverOpen = false; }
  openRouteSearch() { this.clearRouteForm(); this.reference.isGuidePopoverOpen = true; this.reference.isSearchGuidePopoverOpen = false; }
}