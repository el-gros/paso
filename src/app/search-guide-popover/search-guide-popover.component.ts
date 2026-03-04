import { Component, inject, OnInit, ChangeDetectorRef, NgZone, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule, Platform, PopoverController } from '@ionic/angular';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { CapacitorHttp } from '@capacitor/core';
import { SpeechRecognition } from '@capacitor-community/speech-recognition';
import { Keyboard } from '@capacitor/keyboard';

// --- OPENLAYERS IMPORTS ---
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
import { WikiService } from '../services/wiki.service';
import { WeatherService } from '../services/weather.service';
import { global } from '../../environments/environment';

// --- INTERFACES ---
import { LocationResult, Track, TrackFeature, Data, WikiWeatherResult } from 'src/globald';

interface SpeechListener {
  remove: () => Promise<void>;
}

@Component({
  standalone: true,
  selector: 'app-search-guide-popover',
  templateUrl: './search-guide-popover.component.html',
  styleUrls: ['./search-guide-popover.component.scss'],
  imports: [IonicModule, CommonModule, FormsModule, TranslateModule],
})
export class SearchGuidePopoverComponent implements OnInit {

  // ==========================================================================
  // 1. VARIABLES Y ESTADO GLOBALES
  // ==========================================================================
  @Output() onWikiResult = new EventEmitter<WikiWeatherResult>();
  @Output() onClearResult = new EventEmitter<void>();

  // Inyecciones modernas con inject()
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

  // Estado de Búsqueda y Rutas
  public query: string = '';
  public query2: string = '';
  public query3: string = '';
  public results: LocationResult[] = [];
  public loading: boolean = false;
  
  public activeRouteField: 'origin' | 'destination' = 'origin';
  public originCoords: [number, number] | null = null;
  public destinationCoords: [number, number] | null = null;
  public selectedTransport: string = 'foot-walking';
  private readonly MAX_SEARCH_RESULTS = 12;
  
  // Estado de Dictado
  public isListening: boolean = false;
  public activeTarget: 'query' | 'query2' | 'query3' | null = null;
  private speechPluginListener: SpeechListener | null = null;

  public transportMeans = [
    { id: 'foot-walking', icon: 'walk-sharp', label: 'SEARCH.WALK' },
    { id: 'foot-hiking', icon: 'trending-up-sharp', label: 'SEARCH.HIKE' },
    { id: 'cycling-regular', icon: 'bicycle-sharp', label: 'SEARCH.CYCLE' },
    { id: 'driving-car', icon: 'car-sharp', label: 'SEARCH.DRIVE' },
  ];

  // ==========================================================================
  // 2. CONSTRUCTOR
  // ==========================================================================
  constructor(private popoverController: PopoverController) {}

  // ==========================================================================
  // 3. CICLO DE VIDA (LIFECYCLE)
  // ==========================================================================
  ngOnInit() {
    this.platform.backButton.subscribeWithPriority(10, () => {
      this.reference.isSearchPopoverOpen = false;
      this.reference.isGuidePopoverOpen = false;
      this.reference.isSearchGuidePopoverOpen = false;
    });
  }

  // ==========================================================================
  // 4. LÓGICA DE DICTADO (VOZ)
  // ==========================================================================
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
      if (data.matches && data.matches.length > 0) {
        this.zone.run(() => {
          this.assignTextToTarget(data.matches[0]);
        });
      }
    });

    try {
      const lang = this.languageService.getCurrentLangValue() || 'es-ES';
      await SpeechRecognition.start({ language: lang, partialResults: true, popup: false });

      setTimeout(() => { 
        if (this.isListening && this.activeTarget === target) this.stopListening(); 
      }, 6000);

    } catch (e) { this.stopListening(); }
  }

  private assignTextToTarget(text: string) {
    if (this.activeTarget === 'query') this.query = text;
    else if (this.activeTarget === 'query2') this.query2 = text;
    else if (this.activeTarget === 'query3') this.query3 = text;
    this.cdr.detectChanges();
  }

  private async stopListening() {
    const targetAtStop = this.activeTarget;
    this.isListening = false;
    
    if (this.speechPluginListener) {
      await this.speechPluginListener.remove();
      this.speechPluginListener = null;
    }

    try { await SpeechRecognition.stop(); } catch (e) {}
    this.cdr.detectChanges();

    if (targetAtStop) {
      setTimeout(() => {
        this.executeAutoSearch(targetAtStop);
        this.activeTarget = null;
      }, 400);
    }
  }

  private async executeAutoSearch(target: string) {
    this.zone.run(async () => {
      if (target === 'query2') { this.query = this.query2; this.activeRouteField = 'origin'; }
      else if (target === 'query3') { this.query = this.query3; this.activeRouteField = 'destination'; }
      
      if (this.query?.trim().length > 1) await this.openList();
    });
  }

  // ==========================================================================
  // 5. BÚSQUEDA DE LUGARES (NOMINATIM)
  // ==========================================================================
  async openList() {
    if (!this.query.trim()) return;
    if (this.platform.is('capacitor')) await Keyboard.hide();
    
    this.loading = true;
    this.results = [];
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(this.query)}&format=json&polygon_geojson=1&addressdetails=1&limit=${this.MAX_SEARCH_RESULTS}`;
      const response = await CapacitorHttp.get({
        url,
        headers: { 'Accept': 'application/json', 'User-Agent': 'MyMappingApp/1.0' }
      });
      const data = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
      
      this.results = Array.isArray(data) ? data.map((item: any) => {
        const parts = item.display_name.split(',');
        return {
          lat: Number(item.lat), 
          lon: Number(item.lon),
          name: parts[0], 
          short_name: parts.slice(0, 2).join(','),
          display_name: item.display_name, 
          boundingbox: item.boundingbox.map(Number), 
          geojson: item.geojson,
          place_id: item.place_id,
          type: item.type
        } as LocationResult;
      }) : [];
    } catch (e) { this.results = []; }
    finally { this.loading = false; this.cdr.detectChanges(); }
  }

  async handleLocationSelection(location: LocationResult) {
    if (!location?.boundingbox || !location?.geojson) return;
    
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

    const extent = [
      location.boundingbox[2], location.boundingbox[0],
      location.boundingbox[3], location.boundingbox[1]
    ];
    
    this.geography.map?.getView().fit(extent, { duration: 800, padding: [50, 50, 50, 50] });
    await this.searchWiki(location);
  }

  private applySearchStyle(feature: FeatureLike): Style | Style[] {
    const type = feature.getGeometry()?.getType();
    if (type === 'Point') return this.styler.createPinStyle('black');
    if (type === 'Polygon' || type === 'MultiPolygon') {
      return new Style({
        stroke: new Stroke({ color: '#000', width: 2.5 }),
        fill: new Fill({ color: 'rgba(0, 0, 0, 0.15)' }),
      });
    }
    return this.styler.setStrokeStyle('black');
  }

  // ==========================================================================
  // 6. ENRUTAMIENTO (OPENROUTE SERVICE)
  // ==========================================================================
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
    } finally { this.loading = false; this.cdr.detectChanges(); }
  }

  onRouteButtonClick() {
    if (this.originCoords && this.destinationCoords) this.requestRoute();
    else { 
      this.query = this.activeRouteField === 'origin' ? this.query2 : this.query3; 
      this.openList(); 
    }
  }

  async requestRoute() {
    if (!this.originCoords || !this.destinationCoords) {
      this.fs.displayToast('SEARCH.SELECT_BOTH', 'warning');
      return;
    }

    this.loading = true;
    
    const url = `https://api.openrouteservice.org/v2/directions/${this.selectedTransport}/geojson`;
    
    // IMPORTANTE: ORS exige [Longitud, Latitud]. Asegúrate de que originCoords esté en ese orden.
    const body = { 
      coordinates: [this.originCoords, this.destinationCoords], 
      elevation: true, 
      units: 'm',
      geometry: true
    };

    try {
      const resp = await CapacitorHttp.post({
        url,
        headers: { 
          // FIX DEL ERROR 406: Headers exactos que exige ORS para el endpoint /geojson
          'Accept': 'application/json, application/geo+json; charset=utf-8', 
          'Content-Type': 'application/json; charset=utf-8', 
          'Authorization': global.ors_key 
        },
        data: body
      });

      // Si el status no es 200, ORS nos dice exactamente por qué falló dentro de resp.data.error
      if (resp.status !== 200) {
        const errorMessage = resp.data?.error?.message || `Error del servidor: ${resp.status}`;
        console.error("❌ ORS ha rechazado la petición:", resp.data);
        this.fs.displayToast(errorMessage, 'error');
        this.loading = false;
        this.cdr.detectChanges();
        return;
      }

      // Si todo va bien (Status 200)
      const responseData = typeof resp.data === 'string' ? JSON.parse(resp.data) : resp.data;

      if (responseData?.features?.length > 0) {
        console.log("✅ Ruta calculada con éxito");
        this.reference.isGuidePopoverOpen = false;
        await this.handleRouteResponse(responseData);
      } else {
        this.fs.displayToast('SEARCH.NO_ROUTE_FOUND', 'error');
      }

    } catch (error) {
      console.error("❌ Error de red interno:", error);
      this.fs.displayToast('SEARCH.ROUTING_ERROR', 'error');
    } finally { 
      this.loading = false; 
      this.cdr.detectChanges(); 
    }
  }

  async handleRouteResponse(geoJsonData: any) {
    try {
      const routeFeature = geoJsonData.features[0];
      const stats = routeFeature.properties.summary;
      const rawBbox = geoJsonData.bbox || routeFeature.bbox;

      const cleanBbox: [number, number, number, number] | undefined = (rawBbox && rawBbox.length === 6) 
        ? [rawBbox[0], rawBbox[1], rawBbox[3], rawBbox[4]] 
        : (rawBbox && rawBbox.length === 4 ? rawBbox as [number, number, number, number] : undefined);

      this.reference.foundRoute = true;  
      const routeCoordinates: Coordinate[] = routeFeature.geometry.coordinates;

      // Transformamos 'driving-car' a 'DRIVING_CAR' para que coincida con tus claves de traducción
      const transportKey = this.selectedTransport ? this.selectedTransport.toUpperCase().replace('-', '_') : 'UNKNOWN';
      const translatedTransport = this.translate.instant(`TRANSPORT.${transportKey}`);

      // Construimos nuestro objeto Track estandarizado
      const newTrack: Track = {
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          properties: {
            name: `${this.query2} ➔ ${this.query3}`,
            place: this.query3,
            date: new Date(),
            // Usamos la variable ya traducida
            description: translatedTransport,
            totalDistance: stats.distance / 1000,
            totalTime: Math.round(stats.duration * 1000),
            totalElevationGain: Math.round(routeFeature.properties.ascent || 0),
            totalElevationLoss: Math.round(routeFeature.properties.descent || 0),
            inMotion: Math.round(stats.duration * 1000),
            totalNumber: routeCoordinates.length,
            currentSpeed: 0, 
            currentAltitude: 0
          },
          bbox: cleanBbox,
          geometry: {
            type: 'LineString',
            coordinates: routeCoordinates as [number, number][],
            properties: { 
              // Protegemos c[2] por si ORS no devuelve elevación en alguna zona
              data: routeCoordinates.map(c => ({ 
                altitude: c[2] || 0, 
                speed: 0, 
                time: 0, 
                compAltitude: c[2] || 0, 
                compSpeed: 0, 
                distance: 0 
              })) 
            }
          }
        }]
      };

      // 1. Guardamos el track
      this.reference.archivedTrack = newTrack;
      
      // 2. Sincronizamos con el plugin
      await this.location.sendReferenceToPlugin();
      
      // 3. Dejamos que ReferenceService haga el dibujado correcto
      await this.reference.displayArchivedTrack();
      
      // 4. Centramos el mapa
      await this.geography.setMapView(this.reference.archivedTrack);

    } catch (error) {
      console.error("Error procesando GeoJSON de la ruta:", error);
      this.fs.displayToast('SEARCH.ROUTING_ERROR', 'error');
    }
  }

  // ==========================================================================
  // 7. WIKIPEDIA Y TIEMPO (WIKI/WEATHER)
  // ==========================================================================
  async searchWiki(location: LocationResult) {
    this.loading = true;
    this.cdr.detectChanges();
    const currentLang = this.languageService.getCurrentLangValue() || 'es';

    try {
      const wikiPromise = this.wikiService.getWikiData(location).catch(() => null);
      const weatherPromise = this.weatherService.getWeather(location.lat, location.lon, currentLang).catch(() => null);

      const [wikiData, weatherData] = await Promise.all([wikiPromise, weatherPromise]);

      this.zone.run(() => {
        const combinedResult: WikiWeatherResult = { wiki: wikiData, weather: weatherData, locationName: location.name };
        if (wikiData || weatherData) {
          this.onWikiResult.emit(combinedResult);
          this.reference.isSearchPopoverOpen = false;
        } else {
          this.fs.displayToast('No se encontró información adicional', 'warning');
        }
        this.cdr.detectChanges();
      });
    } catch (error) { console.error(error); } 
    finally { this.zone.run(() => { this.loading = false; this.cdr.detectChanges(); }); }
  }

  // ==========================================================================
  // 8. ACCIONES DE LIMPIEZA Y CIERRE
  // ==========================================================================
  close() { this.popoverController.dismiss(); }

  clearRouteForm() {
    this.query2 = ''; this.query3 = '';
    this.originCoords = null; this.destinationCoords = null;
    this.results = []; this.activeRouteField = 'origin';
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

  // ==========================================================================
  // 9. GESTIÓN DE APERTURA DE FORMULARIOS
  // ==========================================================================
  
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

}