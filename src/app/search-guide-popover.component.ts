import { Component, inject, OnInit, ChangeDetectorRef, NgZone, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule, Platform, PopoverController } from '@ionic/angular';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { CapacitorHttp } from '@capacitor/core';
import { SpeechRecognition } from '@capacitor-community/speech-recognition';
import { Keyboard } from '@capacitor/keyboard';
import { GeoJSON } from 'ol/format';
import { Feature } from 'ol';
import { Point } from 'ol/geom';
import { FeatureLike } from 'ol/Feature';
import { Fill, Stroke, Style } from 'ol/style';

// Servicios
import { FunctionsService } from './services/functions.service';
import { GeographyService } from './services/geography.service';
import { ReferenceService } from './services/reference.service';
import { LocationManagerService } from './services/location-manager.service';
import { LanguageService } from './services/language.service';
import { StylerService } from './services/styler.service';
import { global } from './../environments/environment';
import { WikiService } from './services/wiki.service';

interface LocationResult {
  lat: number;
  lon: number;
  name: string;
  display_name: string;
  short_name?: string;
  boundingbox: number[];
  geojson: any;
}

@Component({
  standalone: true,
  selector: 'app-search-guide-popover',
  imports: [IonicModule, CommonModule, FormsModule, TranslateModule],
  template: `
  <ion-popover
    [isOpen]="reference.isSearchGuidePopoverOpen"
    (didDismiss)="reference.isSearchGuidePopoverOpen = false"
    class="floating-popover">
    <ng-template>
      <div class="popover-island">
        <div class="button-grid">
          <button class="nav-item-btn" 
            [class.red-pill]="reference.foundPlace"
            (click)="reference.foundPlace ? clearSearchPlace() : (reference.isSearchPopoverOpen = true); reference.isSearchGuidePopoverOpen = false">
            <ion-icon [name]="reference.foundPlace ? 'trash-sharp' : 'location-sharp'" [class.primary-icon]="!reference.foundPlace"></ion-icon>
            <p>{{ 'SEARCH.LOCATION' | translate }}</p>
          </button>

          <button class="nav-item-btn" 
            [class.red-pill]="reference.foundRoute"
            (click)="reference.foundRoute ? clearSearchRoute() : (reference.isGuidePopoverOpen = true); reference.isSearchGuidePopoverOpen = false">
            <ion-icon [name]="reference.foundRoute ? 'trash-sharp' : 'walk-sharp'" [class.primary-icon]="!reference.foundRoute"></ion-icon>
            <p>{{ 'SEARCH.ROUTE' | translate }}</p>
          </button>
        </div>
      </div>
    </ng-template>
  </ion-popover>

  <ion-popover
    [isOpen]="reference.isSearchPopoverOpen"
    (didDismiss)="reference.isSearchPopoverOpen = false"
    class="floating-popover">
    <ng-template>
      <div class="popover-island glass-form">
        <div class="search-input-wrapper">
          <ion-icon name="search-outline" class="inner-icon"></ion-icon>
          <ion-input [(ngModel)]="query" (keyup.enter)="openList()" [placeholder]="'SEARCH.SEARCH' | translate"></ion-input>
          <div class="input-actions-row">
            <ion-icon *ngIf="query" name="close-circle" class="clear-icon" (click)="query = ''; results = []"></ion-icon>
            <ion-icon [name]="(activeTarget === 'query' && isListening) ? 'mic-sharp' : 'mic-outline'" 
              [class.mic-active]="activeTarget === 'query' && isListening"
              class="mic-icon" (click)="startDictation('query')"></ion-icon>
          </div>
        </div>

        <button class="main-action-btn" (click)="openList()" [disabled]="loading">
          <ion-spinner *ngIf="loading" name="crescent"></ion-spinner>
          <span *ngIf="!loading">{{ 'SEARCH.FIND_PLACES' | translate }}</span>
        </button>

        <div class="results-container" *ngIf="results.length > 0">
          <ion-list lines="none">
            <ion-item *ngFor="let result of results" (click)="handleLocationSelection(result)" button detail="false">
              <ion-label><h2>{{ result.short_name || result.name }}</h2></ion-label>
            </ion-item>
          </ion-list>
        </div>
      </div>
    </ng-template>
  </ion-popover>

  <ion-popover
    [isOpen]="reference.isGuidePopoverOpen"
    (didDismiss)="reference.isGuidePopoverOpen = false"
    class="floating-popover">
    <ng-template>
      <div class="popover-island glass-form">
        <p class="header-title">{{ 'SEARCH.ROUTE' | translate }}</p>

        <div class="input-stack" [class.confirmed]="originCoords">
          <ion-input [(ngModel)]="query2" [placeholder]="'SEARCH.FROM' | translate" (ionFocus)="activeRouteField = 'origin'"></ion-input>
          <div class="input-actions-row">
            <ion-icon [name]="(activeTarget === 'query2' && isListening) ? 'mic-sharp' : 'mic-outline'" 
              [class.mic-active]="activeTarget === 'query2' && isListening"
              class="mic-icon" (click)="startDictation('query2')"></ion-icon>
            <ion-icon name="locate-outline" (click)="useCurrentLocation('origin')" class="action-icon"></ion-icon>
          </div>
        </div>

        <div class="input-stack" [class.confirmed]="destinationCoords">
          <ion-input [(ngModel)]="query3" [placeholder]="'SEARCH.TO' | translate" (ionFocus)="activeRouteField = 'destination'"></ion-input>
          <div class="input-actions-row">
            <ion-icon [name]="(activeTarget === 'query3' && isListening) ? 'mic-sharp' : 'mic-outline'" 
              [class.mic-active]="activeTarget === 'query3' && isListening"
              class="mic-icon" (click)="startDictation('query3')"></ion-icon>
            <ion-icon name="locate-outline" (click)="useCurrentLocation('destination')" class="action-icon"></ion-icon>
          </div>
        </div>
        
        <div class="transport-selection">
          <div *ngFor="let mode of transportMeans" class="mode-chip" [class.active]="selectedTransport === mode.id" (click)="selectedTransport = mode.id">
            <ion-icon [name]="mode.icon"></ion-icon>
          </div>
        </div>

        <div class="footer-buttons">
          <button class="main-action-btn" (click)="onRouteButtonClick()" [disabled]="loading">
            <ion-spinner *ngIf="loading" name="crescent"></ion-spinner>
            <span *ngIf="!loading">{{ (originCoords && destinationCoords) ? ('SEARCH.GET_ROUTE' | translate) : ('SEARCH.FIND_PLACES' | translate) }}</span>
          </button>
          <button class="nav-item-btn red-pill circular" (click)="clearRouteForm()">
            <ion-icon name="trash-outline"></ion-icon>
          </button>
        </div>

        <div class="results-container" *ngIf="results.length > 0">
           <ion-list lines="none">
            <ion-item *ngFor="let result of results" (click)="selectRoutePoint(result)" button detail="false">
              <ion-label><h2>{{ result.short_name || result.name }}</h2></ion-label>
            </ion-item>
          </ion-list>
        </div>
      </div>
    </ng-template>
  </ion-popover>

  `,
  styles: [`
    .nav-item-btn {
      background: transparent !important; border: none;
      display: flex !important; flex-direction: column !important;
      align-items: center !important; justify-content: center !important;
      flex: 1; transition: transform 0.1s ease; min-width: 65px;
      ion-icon { font-size: 26px; margin-bottom: 4px; }
      p { margin: 0; font-size: 10px; font-weight: 700; text-transform: uppercase; color: #333; }
      &:active { transform: scale(0.92); }
    }

    .search-input-wrapper, .input-stack {
      display: flex; align-items: center; background: rgba(0, 0, 0, 0.05);
      border-radius: 16px; padding: 4px 12px; margin-bottom: 12px;
      ion-input { --padding-start: 8px; flex: 1; }
      &.confirmed { background: rgba(45, 211, 111, 0.1); border: 1px solid rgba(45, 211, 111, 0.3); }
    }

    .input-actions-row { display: flex; align-items: center; gap: 12px; margin-left: 8px; }
    
    .mic-icon { font-size: 20px; color: #888; }
    .mic-active { color: #007bff !important; animation: pulse 1s infinite; }
    .action-icon { font-size: 20px; color: var(--ion-color-primary); }
    .clear-icon { font-size: 18px; color: #eb445a; }

    .main-action-btn {
      width: 100%; background: var(--ion-color-primary); color: white;
      border: none; border-radius: 20px; padding: 14px;
      font-weight: 700; text-transform: uppercase; font-size: 11px;
    }

    .button-grid { display: flex; justify-content: space-around; }
    .header-title { text-align: center; font-weight: 800; font-size: 12px; color: #555; margin-bottom: 12px; text-transform: uppercase; }
    .transport-selection { display: flex; justify-content: center; gap: 10px; margin: 12px 0; }
    .mode-chip { 
      width: 38px; height: 38px; border-radius: 50%; display: flex; align-items: center; justify-content: center; 
      background: #f0f0f0; &.active { background: var(--ion-color-primary); color: white; }
    }
    .footer-buttons { display: flex; gap: 10px; align-items: center; }
    .primary-icon { color: var(--ion-color-primary) !important; }
    .red-pill ion-icon, .red-pill p { color: #eb445a !important; }
    .results-container { max-height: 180px; overflow-y: auto; margin-top: 8px; }

    @keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.4; } 100% { opacity: 1; } }

    .popover-island {
      padding: 16px 10px; 
      max-height: 450px;
      display: flex;
      flex-direction: column;
    }

  `]
})
export class SearchGuidePopoverComponent implements OnInit {
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
  private speechPluginListener: any = null;
  activeRouteField: 'origin' | 'destination' = 'origin';
  originCoords: [number, number] | null = null;
  destinationCoords: [number, number] | null = null;
  isListening: boolean = false;
  isProcessingSpeech: boolean = false;
  activeTarget: 'query' | 'query2' | 'query3' | null = null;
  
  query: string = '';
  query2: string = '';
  query3: string = '';
  results: LocationResult[] = [];
  loading: boolean = false;
  hasSearched: boolean = false;
  selectedTransport: string = 'foot-walking';
  
  transportMeans = [
    { id: 'foot-walking', icon: 'walk-outline', label: 'SEARCH.WALK' },
    { id: 'foot-hiking', icon: 'trending-up-outline', label: 'SEARCH.HIKE' },
    { id: 'cycling-regular', icon: 'bicycle-outline', label: 'SEARCH.CYCLE' },
    { id: 'driving-car', icon: 'car-outline', label: 'SEARCH.DRIVE' },
  ];

  constructor(private popoverController: PopoverController) {}
  @Output() onWikiResult = new EventEmitter<any>();

  // 2. Añade la función close que pide el HTML
  close() {
    this.popoverController.dismiss();
  }

  ngOnInit() {
    this.platform.backButton.subscribeWithPriority(10, () => {
      this.reference.isSearchPopoverOpen = false;
      this.reference.isGuidePopoverOpen = false;
      this.reference.isSearchGuidePopoverOpen = false;
    });
  }

  async startDictation(target: 'query' | 'query2' | 'query3') {
    if (this.isListening) await this.stopListening();

    const available = await SpeechRecognition.available();
    if (!available.available) {
      this.fs.displayToast("Speech recognition not available");
      return;
    }
    
    await SpeechRecognition.requestPermissions();
    this.activeTarget = target;
    this.isListening = true;
    this.cdr.detectChanges();

    // Escuchamos resultados parciales (para feedback visual)
    this.speechPluginListener = await SpeechRecognition.addListener('partialResults', (data: any) => {
      if (data.matches && data.matches.length > 0) {
        this.zone.run(() => {
          this.assignTextToTarget(data.matches[0]);
        });
      }
    });

    try {
      const lang = this.languageService.getCurrentLangValue() || 'es-ES';
      await SpeechRecognition.start({ 
        language: lang, 
        partialResults: true, 
        popup: false 
      });

      // Auto-stop por seguridad
      setTimeout(() => { 
        if (this.isListening && this.activeTarget === target) this.stopListening(); 
      }, 6000);

    } catch (e) { 
      this.stopListening(); 
    }
  }

  private assignTextToTarget(text: string) {
    if (this.activeTarget === 'query') this.query = text;
    else if (this.activeTarget === 'query2') this.query2 = text;
    else if (this.activeTarget === 'query3') this.query3 = text;
    this.cdr.detectChanges();
  }

  private async stopListening() {
    // Guardamos una referencia temporal antes de limpiar
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

    // Ejecutamos la búsqueda automática si había un target
    if (targetAtStop) {
      setTimeout(() => {
        this.executeAutoSearch(targetAtStop);
        // Limpiamos el target después de iniciar la búsqueda
        this.activeTarget = null;
      }, 400);
    }
  }

  private async executeAutoSearch(target: string) {
    this.zone.run(async () => {
      if (target === 'query2') { this.query = this.query2; this.activeRouteField = 'origin'; }
      else if (target === 'query3') { this.query = this.query3; this.activeRouteField = 'destination'; }
      
      if (this.query?.trim().length > 1) {
        await this.openList();
      }
    });
  }

  async openList() {
    if (!this.query.trim()) return;
    if (this.platform.is('capacitor')) await Keyboard.hide();
    
    this.loading = true;
    this.results = [];
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(this.query)}&format=json&polygon_geojson=1&addressdetails=1&limit=5`;
      const response = await CapacitorHttp.get({
        url,
        headers: { 'Accept': 'application/json', 'User-Agent': 'MyMappingApp/1.0' }
      });
      const data = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
      this.results = Array.isArray(data) ? data.map((item: any) => {
        const parts = item.display_name.split(',');
        return {
          lat: Number(item.lat), lon: Number(item.lon),
          name: parts[0], short_name: parts.slice(0, 2).join(','),
          display_name: item.display_name, boundingbox: item.boundingbox.map(Number), geojson: item.geojson
        };
      }) : [];
    } catch (e) { this.results = []; }
    finally { this.loading = false; this.cdr.detectChanges(); }
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

  clearRouteForm() {
    this.query2 = ''; this.query3 = '';
    this.originCoords = null; this.destinationCoords = null;
    this.results = []; this.activeRouteField = 'origin';
  }

  clearSearchPlace() { this.geography.searchLayer?.getSource()?.clear(); this.reference.foundPlace = false; }
  async clearSearchRoute() { 
    this.reference.archivedTrack = undefined;
    this.geography.archivedLayer?.getSource()?.clear();
    this.reference.foundRoute = false;
    await this.location.sendReferenceToPlugin();
  }

  async requestRoute() {
    if (!this.originCoords || !this.destinationCoords) {
      this.fs.displayToast(this.translate.instant('SEARCH.SELECT_BOTH'));
      return;
    }

    this.loading = true;
    
    // 1. URL según el perfil de transporte seleccionado
    const url = `https://api.openrouteservice.org/v2/directions/${this.selectedTransport}/geojson`;
    
    // 2. El cuerpo debe llevar las coordenadas como [lon, lat]
    const body = {
      coordinates: [this.originCoords, this.destinationCoords],
      elevation: true, 
      units: 'm'
    };

    try {
      const resp = await CapacitorHttp.post({
        url,
        headers: {
          'Accept': 'application/json, application/geo+json',
          'Content-Type': 'application/json; charset=utf-8',
          'Authorization': global.ors_key // Tu API Key desde el entorno
        },
        data: body
      });

      const responseData = typeof resp.data === 'string' ? JSON.parse(resp.data) : resp.data;

      if (resp.status === 200 && responseData?.features?.length > 0) {
        // Éxito: Cerramos el popover y procesamos la ruta
        this.reference.isGuidePopoverOpen = false;
        this.handleRouteResponse(responseData);
      } else {
        const errorMsg = responseData?.error?.message || "No route found";
        console.error("ORS Error:", errorMsg);
        this.fs.displayToast(this.translate.instant('SEARCH.NO_ROUTE_FOUND'));
      }
    } catch (error) {
      console.error("Routing error:", error);
      this.fs.displayToast(this.translate.instant('SEARCH.ROUTING_ERROR'));
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

async handleRouteResponse(geoJsonData: any) {
  const source = this.geography.archivedLayer?.getSource();
  if (!source) return;

  source.clear();

  const format = new GeoJSON();
  const features = format.readFeatures(geoJsonData); 
  source.addFeatures(features);

  const route = geoJsonData.features[0];
  const stats = route.properties.summary;
  const rawBbox = geoJsonData.bbox || route.bbox;

  const cleanBbox = (rawBbox && rawBbox.length === 6) 
    ? [rawBbox[0], rawBbox[1], rawBbox[3], rawBbox[4]] 
    : rawBbox;

  this.reference.foundRoute = true;  

  // --- CÁLCULOS ---
  // 1. Distancia en km (de metros a km)
  const distanceKm = stats.distance / 1000;

  // 2. Tiempo (de segundos a minutos)
  const durationInMs = Math.round(stats.duration * 1000);

  // 3. Elevación (ORS la devuelve en properties si se solicita)
  const ascent = route.properties.ascent || 0;
  const descent = route.properties.descent || 0;

  this.reference.archivedTrack = {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      properties: {
        currentSpeed: 0,
        currentAltitude: 0,
        name: `${this.query2} ➔ ${this.query3}`,
        place: this.query3,
        date: new Date(),
        description: `ORS Profile: ${this.selectedTransport}`,
        
        // RESULTADOS FORMATEADOS
        totalDistance: distanceKm,
        totalTime: durationInMs,
        totalElevationGain: Math.round(ascent),
        totalElevationLoss: Math.round(descent),
        
        inMotion: true,
        totalNumber: route.geometry.coordinates.length,
      },
      bbox: cleanBbox,
      geometry: {
        type: 'LineString',
        coordinates: route.geometry.coordinates.map((coord: any) => [coord[0], coord[1]]),
        properties: {
          data: route.geometry.coordinates.map((coord: any) => ({
            distance: 0,
            altitude: coord[2] || 0, // Altitud si el punto la tiene
            time: 0,
            speed: 0
          }))
        }
      }
    }]
  };

  if (this.reference.archivedTrack) {
    await this.reference.displayArchivedTrack();
    await this.geography.setMapView(this.reference.archivedTrack);
  }
}

  async handleLocationSelection(location: LocationResult) {
    if (!location?.boundingbox || !location?.geojson) return;
    
    // Cerramos el popover de búsqueda
    this.reference.isSearchPopoverOpen = false;
    
    const source = this.geography.searchLayer?.getSource();
    if (!source) return;

    source.clear();
    const geojsonFormat = new GeoJSON();
    
    // Leemos las geometrías (polígonos, etc)
    const features = geojsonFormat.readFeatures(location.geojson);
    
    // Si el resultado es un polígono, añadimos también un punto central para el Pin
    if (features.some(f => f.getGeometry()?.getType().includes('Polygon'))) {
      features.push(new Feature(new Point([location.lon, location.lat])));
    }

    source.addFeatures(features);
    
    // Aplicamos el estilo (usando tu styler service)
    this.geography.searchLayer?.setStyle(f => this.applySearchStyle(f));
    
    this.reference.foundPlace = true;

    // Ajustamos la vista del mapa al bounding box del lugar
    // Nominatim devuelve: [latMin, latMax, lonMin, lonMax]
    const extent = [
      location.boundingbox[2], // lonMin
      location.boundingbox[0], // latMin
      location.boundingbox[3], // lonMax
      location.boundingbox[1]  // latMax
    ];
    
    this.geography.map?.getView().fit(extent, { 
      duration: 800, 
      padding: [50, 50, 50, 50] 
    });

    await this.searchWiki(location)
  }

  // También asegúrate de tener este helper para el estilo
  private applySearchStyle(feature: FeatureLike): Style | Style[] {
    const type = feature.getGeometry()?.getType();

    if (type === 'Point') {
      return this.styler.createPinStyle('black');
    }
    
    if (type === 'Polygon' || type === 'MultiPolygon') {
      return new Style({
        stroke: new Stroke({ color: '#000', width: 2.5 }),
        fill: new Fill({ color: 'rgba(0, 0, 0, 0.15)' }),
      });
    }

    return this.styler.setStrokeStyle('black');
  }

  async searchWiki(location: LocationResult) {
    this.loading = true;
    const wikiData = await this.wikiService.getWikiData(location);
    
    if (wikiData) {
      // Emitimos el resultado para que el componente WikiCard lo reciba
      this.onWikiResult.emit(wikiData);
      // Cerramos el buscador para que no estorbe
      this.reference.isSearchPopoverOpen = false;
    }
    
    this.loading = false;
    this.cdr.detectChanges();
  }

}