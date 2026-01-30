import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule, ModalController } from '@ionic/angular';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { StylerService } from './services/styler.service';
import { CapacitorHttp } from '@capacitor/core';
import { SpeechRecognition } from '@capacitor-community/speech-recognition';
import { Keyboard } from '@capacitor/keyboard';
import { Platform } from '@ionic/angular';
import { global } from './../environments/environment';

// OpenLayers & GeoJSON
import { GeoJSON } from 'ol/format';
import { Feature } from 'ol';
import { Point } from 'ol/geom';

// Servicios (Asegúrate de que las rutas sean correctas según tu estructura)
import { FunctionsService } from './services/functions.service';
import { GeographyService } from './services/geography.service';
import { MapService } from './services/map.service';
import { ReferenceService } from './services/reference.service';
import { LocationManagerService } from './services/location-manager.service';
import { LanguageService } from './services/language.service';
import { FeatureLike } from 'ol/Feature';
import { Fill, Stroke, Style } from 'ol/style';

// Importa el modal si ya existe
// import { SearchModalComponent } from './search-modal.component';

interface LocationResult {
  lat: number;
  lon: number;
  name: string;
  display_name: string;
  type?: string;
  place_id?: string;
  boundingbox: number[];
  geojson: any;
  short_name?: string;
}

interface Data {
  distance: number;
  altitude: number;
  time: number;
  speed: number;
}

@Component({
  standalone: true,
  selector: 'app-search-guide-popover',
  imports: [IonicModule, CommonModule, FormsModule, TranslateModule],
  template: `
        <ion-popover
        [isOpen]="reference.isSearchGuidePopoverOpen"
        (didDismiss)="reference.isSearchGuidePopoverOpen = false"
        cssClass="central"
        >
        <ng-template>
            <ion-list>
            <ion-row>
                @if (!reference.foundPlace) {
                <button class="record-button map-color"
                    (click)="reference.isSearchPopoverOpen = true; reference.isSearchGuidePopoverOpen = false">
                    <ion-icon name="location-sharp"></ion-icon>
                    <span>{{ 'SEARCH.LOCATION' | translate }}</span>
                </button>
                } @else {
                <button class="record-button remove-color"
                    (click)="clearSearchPlace(); reference.isSearchGuidePopoverOpen = false">
                    <ion-icon name="trash-outline"></ion-icon>
                    <span>{{ 'SEARCH.LOCATION' | translate }}</span>
                </button>
                }

                @if (!this.reference.foundRoute) {
                <button class="record-button map-color"
                    (click)="reference.isGuidePopoverOpen = true; reference.isSearchGuidePopoverOpen = false">
                    <ion-icon name="walk-sharp"></ion-icon>
                    <span>{{ 'SEARCH.ROUTE' | translate }}</span>
                </button>
                } @else {
                <button class="record-button remove-color"
                    (click)="clearSearchRoute(); reference.isSearchGuidePopoverOpen = false">
                    <ion-icon name="close-circle-outline"></ion-icon>
                    <span>{{ 'SEARCH.ROUTE' | translate }}</span>
                </button>
                }
            </ion-row>
            </ion-list>
        </ng-template>
        </ion-popover>

        <ion-popover
        [isOpen]="reference.isSearchPopoverOpen"
        (didDismiss)="reference.isSearchPopoverOpen = false"
        cssClass="long"
        >
        <ng-template>
            <ion-content class="search-popover-content">
            <div class="search-row">
                <div class="search-field">
                <ion-icon name="search" class="search-icon"></ion-icon>
                <ion-input
                    [(ngModel)]="query"
                    (keyup.enter)="openList()"
                    [placeholder]="'SEARCH.SEARCH' | translate"
                    class="search-input"
                ></ion-input>
                @if (query) {
                    <ion-icon name="close-circle" class="clear-icon" (click)="query = ''; results = []; hasSearched = false"></ion-icon>
                }
                <ion-icon name="mic" class="mic-icon" (click)="startDictation('query')"></ion-icon>
                </div>
                <button class="side-action-button" (click)="openList()">
                @if (loading) { <ion-spinner name="dots"></ion-spinner> } 
                @else { <ion-icon name="list"></ion-icon> }
                </button>
            </div>

            @if (results.length > 0) {
                <ion-list class="results-list">
                @for (result of results; track result.place_id) {
                    <ion-item (click)="handleLocationSelection(result)" class="result-item" button detail="false">
                    <ion-label>
                        <h2>{{ result.short_name || result.name }}</h2>
                        <p>{{ result.display_name }}</p>
                    </ion-label>
                    </ion-item>
                }
                </ion-list>
            }
            </ion-content>
        </ng-template>
        </ion-popover>

    <ion-popover
        [isOpen]="reference.isGuidePopoverOpen"
        (didDismiss)="resetRouteState()"
        cssClass="long"
    >
    <ng-template>
        <ion-content class="search-popover-content">
            <div class="search-row">
                <div class="search-field" [class.confirmed-field]="originCoords !== null">
                    <ion-icon name="radio-button-off-outline" class="search-icon" color="success"></ion-icon>
                    <ion-input 
                        [(ngModel)]="query2" 
                        [placeholder]="'SEARCH.FROM' | translate" 
                        (ionFocus)="activeRouteField = 'origin'"
                        class="search-input"
                    ></ion-input>
                    @if (query2) { 
                        <ion-icon name="close-circle" class="clear-icon" (click)="query2 = ''; originCoords = null; results = []"></ion-icon> 
                    }
                    <ion-icon name="mic" class="mic-icon" (click)="startDictation('query2')"></ion-icon>
                </div>
                <button class="side-action-button" (click)="useCurrentLocation('origin')">
                    @if (loading && activeRouteField === 'origin') { <ion-spinner name="crescent" size="small"></ion-spinner> }
                    @else { <ion-icon name="locate-outline"></ion-icon> }
                </button>
            </div>

            <div class="search-row" style="margin-top: 10px;">
                <div class="search-field" [class.confirmed-field]="destinationCoords !== null">
                    <ion-icon name="location-outline" class="search-icon" color="danger"></ion-icon>
                    <ion-input 
                        [(ngModel)]="query3" 
                        [placeholder]="'SEARCH.TO' | translate" 
                        (ionFocus)="activeRouteField = 'destination'"
                        class="search-input"
                    ></ion-input>
                    @if (query3) { 
                        <ion-icon name="close-circle" class="clear-icon" (click)="query3 = ''; destinationCoords = null; results = []"></ion-icon> 
                    }
                    <ion-icon name="mic" class="mic-icon" (click)="startDictation('query3')"></ion-icon>
                </div>
                <button class="side-action-button" (click)="useCurrentLocation('destination')">
                    @if (loading && activeRouteField === 'destination') { <ion-spinner name="crescent" size="small"></ion-spinner> }
                    @else { <ion-icon name="locate-outline"></ion-icon> }
                </button>
            </div>

            <div class="transport-container">
                <p class="section-title">{{ 'SEARCH.TRANSPORT_MODE' | translate }}</p>
                <div class="transport-row">
                    @for (mode of transportMeans; track mode.id) {
                        <div class="transport-chip" 
                            [class.active-chip]="selectedTransport === mode.id"
                            (click)="selectedTransport = mode.id">
                            <ion-icon [name]="mode.icon"></ion-icon>
                            <span>{{ mode.label | translate }}</span>
                        </div>
                    }
                </div>
            </div>

        <div class="action-footer ion-padding-top">
            <button class="route-search-btn" 
                    (click)="onRouteButtonClick()" 
                    [disabled]="loading">
                
                @if (loading) {
                    <ion-spinner name="crescent" color="light"></ion-spinner>
                    <span style="margin-left: 10px;">{{ 'COMMON.LOADING' | translate }}</span>
                } @else { 
                    <span>
                        {{ (originCoords && destinationCoords) ? 
                        ('SEARCH.GET_ROUTE' | translate) : 
                        ('SEARCH.FIND_PLACES' | translate) 
                        }}
                    </span> 
                }
            </button>

            @if (query2 || query3 || originCoords || destinationCoords) {
                <button class="clear-all-btn" (click)="clearRouteForm()" [disabled]="loading">
                    <ion-icon name="trash-outline"></ion-icon>
                </button>
            }
        </div>

            @if (results.length > 0) {
                <ion-list class="results-list">
                    @for (result of results; track result.place_id) {
                        <ion-item (click)="selectRoutePoint(result)" class="result-item" button detail="false">
                            <ion-label>
                                <h2>{{ result.short_name || result.name }}</h2>
                                <p>{{ result.display_name }}</p>
                            </ion-label>
                        </ion-item>
                    }
                </ion-list>
            }
        </ion-content>
    </ng-template>
    </ion-popover>
    @if (loading) {
      <div class="spinner-row ion-text-center">
          <span class="sandclock">⏳</span>
          <p>Procesando altitudes...</p>
      </div>
    }
  `,
styles: [`
    /* --- 1. Layout & Containers --- */
    .search-popover-content { padding: 12px; }
    ion-row { display: flex; justify-content: center; gap: 5px; }

    /* --- 2. Form Rows & Search Fields --- */
    .search-row { 
      display: flex; 
      align-items: center; 
      gap: 8px; 
      margin-bottom: 8px; 
    }

    .search-field { 
      flex: 1; 
      display: flex; 
      align-items: center; 
      background: #ffffff; 
      border-radius: 8px; 
      padding: 4px 8px; 
      border: 1px solid #e0e0e0;
      transition: all 0.3s ease;
    }

    /* --- 3. Input Text Logic (Gris claro vs Oscuro) --- */
    /* Por defecto: Gris claro mientras se escribe */
    .search-input { 
      --padding-start: 8px; 
      width: 100%; 
      --color: #a0a0a0 !important; 
      font-weight: 400;
    }

    /* Cuando hay coordenadas confirmadas: Fondo gris y texto oscuro */
    .confirmed-field {
      background: #f4f4f4 !important;
      border: 1px solid #ccc !important;
    }

    .confirmed-field .search-input {
      --color: #333333 !important; 
      font-weight: 600;
    }

    /* Resalte azul cuando el usuario hace foco */
    .search-field:focus-within {
      border-color: var(--ion-color-primary);
      box-shadow: 0 0 5px rgba(var(--ion-color-primary-rgb), 0.2);
    }

    /* --- 4. Buttons (Search, Side Actions & Trash) --- */
    .route-search-btn { 
      background: var(--ion-color-primary); 
      color: white; 
      border: none; 
      border-radius: 25px;
      padding: 12px 20px; 
      font-weight: bold; 
      flex: 1;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 48px;
      transition: all 0.2s ease;
    }

    .route-search-btn:disabled {
      opacity: 0.6;
      filter: grayscale(0.5);
    }

    .clear-all-btn {
      background: #fff0f0;
      color: #eb445a;
      border: 1px solid #ffc4c9;
      border-radius: 50%;
      width: 45px;
      height: 45px;
      display: flex;
      justify-content: center;
      align-items: center;
      font-size: 20px;
      flex-shrink: 0;
    }

    .side-action-button {
      background: #f0f0f0;
      border: none;
      border-radius: 8px;
      width: 40px;
      height: 40px;
      display: flex;
      justify-content: center;
      align-items: center;
      color: var(--ion-color-primary);
      font-size: 20px;
    }

    /* Remove state: Reddish */
    .remove-color {
    background: #ffaaaa !important;
    }

    /* Optional: If you want the icons/text to be slightly 
    darker on the red button for better readability */
    .remove-color ion-icon, 
    .remove-color span {
    color: #600 !important;
    }

    /* --- 5. Transport Mode Chips --- */
    .transport-container { margin-top: 15px; padding: 0 4px; }
    .section-title { 
      font-size: 11px; text-transform: uppercase; color: #888; 
      margin-bottom: 8px; font-weight: bold; letter-spacing: 0.5px; 
    }
    .transport-row { 
    display: flex; 
    gap: 8px; /* Reduce un poco el espacio entre ellos */
    justify-content: center; /* Mejor que space-between para 3 elementos */
    width: 100%;
    }

    .transport-chip { 
    min-width: 0; /* Permite que el chip se encoja si es necesario */
    flex: 1; 
    /* ... resto de tus estilos ... */
    }
    .active-chip { 
      background: rgba(var(--ion-color-primary-rgb), 0.1); 
      border-color: var(--ion-color-primary); 
      color: var(--ion-color-primary); 
    }

    /* --- 6. Results List --- */
    .results-list { 
      margin-top: 10px; border-radius: 8px; overflow: hidden;
      box-shadow: 0 4px 12px rgba(0,0,0,0.1);
    }
    .result-item { --padding-start: 12px; --inner-padding-end: 12px; }
    .result-item h2 { font-size: 14px; font-weight: 600; }
    .result-item p { font-size: 11px; color: #777; }

    /* --- 7. Footer & Animations --- */
    .action-footer {
      display: flex;
      gap: 10px;
      align-items: center;
      margin-top: 15px;
    }

    .route-search-btn:active, .side-action-button:active, .clear-all-btn:active { 
      transform: scale(0.95); 
      opacity: 0.8;
    }

    @keyframes rotate { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
    .sandclock { 
      font-size: 30px; display: block; margin: 10px auto; 
      animation: rotate 2s infinite; 
    }
  `]

})

export class SearchGuidePopoverComponent implements OnInit {
  public reference = inject(ReferenceService);
  public geography = inject(GeographyService);
  public mapService = inject(MapService);
  private location = inject(LocationManagerService); 
  public fs = inject(FunctionsService);
  private languageService = inject(LanguageService);
  private styler = inject(StylerService);
  private platform = inject(Platform);
  private speechPluginListener: any = null;
  activeRouteField: 'origin' | 'destination' = 'origin';
  originCoords: [number, number] | null = null;
  destinationCoords: [number, number] | null = null;

  query: string = '';
  query2: string = '';
  query3: string = '';
  results: LocationResult[] = [];
  loading: boolean = false;
  hasSearched: boolean = false;

  transportMeans = [
    { id: 'foot-walking', icon: 'walk-outline', label: 'Walk' },
    { id: 'foot-hiking', icon: 'trending-up-outline', label: 'Hike' }, // Nuevo
    { id: 'cycling-regular', icon: 'bicycle-outline', label: 'Cycle' },
    { id: 'driving-car', icon: 'car-outline', label: 'Drive' },
  ];
  // Update default to match the first ID
  public selectedTransport: string = 'foot-walking';

  ngOnInit() {
    this.platform.backButton.subscribeWithPriority(10, () => {
      if (this.reference.isSearchPopoverOpen) this.reference.isSearchPopoverOpen = false;
      if (this.reference.isGuidePopoverOpen) this.reference.isGuidePopoverOpen = false;
      if (this.reference.isSearchGuidePopoverOpen) this.reference.isSearchGuidePopoverOpen = false;
    });
  }

  async openList() {
    if (!this.query.trim()) return;
    
    // Smooth UI: Hide keyboard and show loading
    if (this.platform.is('capacitor')) await Keyboard.hide();
    
    this.loading = true;
    this.hasSearched = false; 

    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(this.query)}&format=json&polygon_geojson=1&addressdetails=1&limit=5`;
      const response = await CapacitorHttp.get({
        url,
        headers: { 'Accept': 'application/json', 'User-Agent': 'MyMappingApp/1.0' }
      });
      
      let data = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
      
        this.results = Array.isArray(data) ? data.map((item: any) => {
        const parts = item.display_name.split(',');
        return {
            lat: Number(item.lat),
            lon: Number(item.lon),
            name: parts[0], 
            short_name: parts.slice(0, 2).join(','), 
            display_name: item.display_name,
            type: item.type,                      // Add this
            place_id: item.place_id,              // Add this
            boundingbox: item.boundingbox ? item.boundingbox.map(Number) : [], // Required field
            geojson: item.geojson
        };
        }) : [];

    } catch (error) {
      this.results = [];
    } finally { 
      this.loading = false;
      this.hasSearched = true; // Now we show the "No results" if list is empty
    }
  }

    async startDictation(target: 'query' | 'query2' | 'query3') {
    const available = await SpeechRecognition.available();
    if (!available.available) return;
    
    await SpeechRecognition.requestPermissions();

    // 1. Clean up existing listener if it exists
    if (this.speechPluginListener) {
        await this.speechPluginListener.remove();
    }

    let lang = this.languageService.getCurrentLangValue() || 'es-ES';
    // Language mapping logic...

    // 2. Assign the new listener
    this.speechPluginListener = await SpeechRecognition.addListener('partialResults', (data: any) => {
        if (data.matches && data.matches.length > 0) {
        this[target] = data.matches[0];
        }
    });

    await SpeechRecognition.start({ 
        language: lang, 
        partialResults: true, 
        popup: false 
    });

    // 3. Optional: Stop listening automatically after a period of silence
    // Most plugins have a max duration, but you can add a 'result' listener 
    // to call SpeechRecognition.stop() and then cleanup.
    }

  async handleLocationSelection(location: LocationResult) {
    if (!location?.boundingbox || !location?.geojson) return;
    this.reference.isSearchPopoverOpen = false;
    const source = this.geography.searchLayer?.getSource();
    if (!source) return;

    source.clear();
    const geojsonFormat = new GeoJSON();
    const features = geojsonFormat.readFeatures(location.geojson);
    
    if (features.some(f => f.getGeometry()?.getType().includes('Polygon'))) {
      features.push(new Feature(new Point([location.lon, location.lat])));
    }

    source.addFeatures(features);
    // Asumiendo que tienes un método applySearchStyle en tu componente o servicio
    this.geography.searchLayer?.setStyle(f => this.applySearchStyle(f));
    this.reference.foundPlace = true;

    // Fit view (Nominatim bbox: [latMin, latMax, lonMin, lonMax])
    const extent = [location.boundingbox[2], location.boundingbox[0], location.boundingbox[3], location.boundingbox[1]];
    this.geography.map?.getView().fit(extent, { duration: 800, padding: [50, 50, 50, 50] });
  }

  async guide() {
    // Aquí deberías tener importado SearchModalComponent
    // const modal = await this.modalController.create({ component: SearchModalComponent, ... });
    this.fs.displayToast("Iniciando guía...");
    // ... (Lógica de procesamiento de track que proporcionaste)
  }

  // Helper para altitudes (Simulación)
  async getAltitudesFromMap(coords: any) {
    return { altitudes: coords.map(() => 0), slopes: { gain: 0, loss: 0 } };
  }

  
  private shortenName(fullName: string): string {
    if (!fullName) return '(no name)';
    const parts = fullName.split(',').map(p => p.trim());
    return parts.slice(0, 2).join(', ');
  }

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

// Search for the active field
async searchRouteLocations() {
  this.query = this.activeRouteField === 'origin' ? this.query2 : this.query3;
  if (!this.query || this.query === "My Location") return;
  await this.openList();
}

// Handle clicking a result in the Route Popover
selectRoutePoint(result: LocationResult) {
  if (this.activeRouteField === 'origin') {
    this.query2 = result.short_name || result.name;
    this.originCoords = [result.lon, result.lat];
    this.activeRouteField = 'destination'; // Auto-focus next field
  } else {
    this.query3 = result.short_name || result.name;
    this.destinationCoords = [result.lon, result.lat];
  }
  this.results = []; // Clear list after selection
}

async requestRoute() {
  if (!this.originCoords || !this.destinationCoords) {
    this.fs.displayToast("Please select both origin and destination");
    return;
  }

  this.loading = true;
  
  // 1. Ensure the profile matches ORS exactly
  const url = `https://api.openrouteservice.org/v2/directions/${this.selectedTransport}/geojson`;
  
  // 2. Body must be exactly this structure
  const body = {
    coordinates: [this.originCoords, this.destinationCoords]
  };

  try {
    const resp = await CapacitorHttp.post({
      url,
      headers: {
        'Accept': 'application/json, application/geo+json',
        'Content-Type': 'application/json; charset=utf-8',
        // IMPORTANT: ORS usually expects just the key. 
        // If you saved it as 'Bearer key', remove 'Bearer'
        'Authorization': global.ors_key // Or your specific variable
      },
      data: body
    });

    // CapacitorHttp response handling
    const responseData = typeof resp.data === 'string' ? JSON.parse(resp.data) : resp.data;

    if (resp.status === 200 && responseData?.features?.length > 0) {
      this.reference.isGuidePopoverOpen = false;
      this.handleRouteResponse(responseData);
    } else {
      // Handle the 403 or 400 errors specifically
      const errorMsg = responseData?.error?.message || "No route found";
      this.fs.displayToast(`Error: ${errorMsg}`);
    }
  } catch (error) {
    console.error("Routing error:", error);
    this.fs.displayToast("Check your internet connection or API Key");
  } finally {
    this.loading = false;
  }
}

async handleRouteResponse(geoJsonData: any) {
  const source = this.geography.archivedLayer?.getSource();
  if (!source) return;

  source.clear();

  // 1. Simplification: No manual transformation needed!
  // Since you called useGeographic(), OpenLayers expects EPSG:4326 by default.
  const format = new GeoJSON();
  const features = format.readFeatures(geoJsonData); 

  source.addFeatures(features);

  // 2. Map data to your reference object
  const route = geoJsonData.features[0];
  const stats = route.properties.summary;

  // Get the bbox from root or the first feature
  const rawBbox = geoJsonData.bbox || route.bbox;

  // Standardize to 2D [minLon, minLat, maxLon, maxLat]
  const cleanBbox = (rawBbox && rawBbox.length === 6) ? [rawBbox[0], rawBbox[1], rawBbox[3], rawBbox[4]] : rawBbox;
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
        totalDistance: stats.distance,
        totalTime: stats.duration,
        inMotion: true,
        totalElevationGain: route.properties.ascent || 0,
        totalElevationLoss: route.properties.descent || 0,
        totalNumber: route.geometry.coordinates.length,
      },
      bbox: cleanBbox,
      geometry: {
        type: 'LineString',
        coordinates: route.geometry.coordinates, 
        properties: {
          data: route.geometry.coordinates.map((coord: any) => ({
            distance: 0,
            altitude: coord[2] || 0,
            time: 0,
            speed: 0
          }))
        }
      }
    }]
  };
  await this.reference.displayArchivedTrack();
  this.reference.foundRoute = true;
  await this.geography.setMapView(this.reference.archivedTrack);
  await this.location.sendReferenceToPlugin();

}

onRouteButtonClick() {
  // If both coordinates are set, we don't need to search locations anymore; we fetch the route.
  if (this.originCoords && this.destinationCoords) {
    this.requestRoute();
  } else {
    // If one is missing, we perform a text search for the active field (Origin or Destination)
    this.searchRouteLocations();
  }
}

resetRouteState() {
  // Reset the UI state
  this.reference.isGuidePopoverOpen = false;
  
  // Clear the coordinates so the button reverts to "FIND PLACES"
  this.originCoords = null;
  this.destinationCoords = null;
  
  // Clear the text inputs
  this.query2 = '';
  this.query3 = '';
  
  // Reset search results and focus
  this.results = [];
  this.activeRouteField = 'origin';
  this.hasSearched = false;
}

async useCurrentLocation(type: 'origin' | 'destination') {
  // Ponemos el campo como activo para que el spinner aparezca en el lugar correcto
  this.activeRouteField = type;
  this.loading = true;

  try {
    // Usamos el método tal cual lo tienes en tu servicio
    const myPos = await this.location.getCurrentPosition();

    if (myPos) {
      if (type === 'origin') {
        this.query2 = "Mi ubicación";
        this.originCoords = myPos; // myPos ya es [number, number]
      } else {
        this.query3 = "Mi ubicación";
        this.destinationCoords = myPos;
      }
      this.fs.displayToast("Ubicación obtenida");
    } else {
      this.fs.displayToast("No se pudo obtener la posición");
    }
  } catch (error) {
    console.error(error);
  } finally {
    this.loading = false;
  }
}

// Método para borrar todo (el botón de la papelera)
clearRouteForm() {
  this.query2 = '';
  this.query3 = '';
  this.originCoords = null;
  this.destinationCoords = null;
  this.results = [];
  this.activeRouteField = 'origin';
  this.fs.displayToast("Formulario limpio");
}

clearSearchPlace() {
      // 10. REMOVE SEARCH LAYER //////////////////////
    this.geography.searchLayer?.getSource()?.clear();
    this.reference.foundPlace = false;
}

async clearSearchRoute() {
    this.reference.archivedTrack = undefined;
    this.geography.archivedLayer?.getSource()?.clear();
    this.reference.foundRoute = false;
    await this.location.sendReferenceToPlugin()
}

}