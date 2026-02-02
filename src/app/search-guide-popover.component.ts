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
    class="floating-popover">
    <ng-template>
      <div class="popover-island">
        <div class="button-grid">
          
          <button class="nav-item-btn" 
            [class.red-pill]="reference.foundPlace"
            (click)="reference.foundPlace ? clearSearchPlace() : (reference.isSearchPopoverOpen = true); reference.isSearchGuidePopoverOpen = false">
            
            <ion-icon 
              [name]="reference.foundPlace ? 'trash-sharp' : 'location-sharp'" 
              [class.blue-icon]="!reference.foundPlace">
            </ion-icon>
            <p>{{ 'SEARCH.LOCATION' | translate }}</p>
          </button>

          <button class="nav-item-btn" 
            [class.red-pill]="reference.foundRoute"
            (click)="reference.foundRoute ? clearSearchRoute() : (reference.isGuidePopoverOpen = true); reference.isSearchGuidePopoverOpen = false">
            
            <ion-icon 
              [name]="reference.foundRoute ? 'close-circle-sharp' : 'walk-sharp'" 
              [class.blue-icon]="!reference.foundRoute">
            </ion-icon>
            <p>{{ 'SEARCH.ROUTE' | translate }}</p>
          </button>

        </div>
      </div>
    </ng-template>
  </ion-popover>

    <ion-popover
      [isOpen]="reference.isSearchPopoverOpen"
      (didDismiss)="reference.isSearchPopoverOpen = false"
      class="search-popover">
      <ng-template>
        <div class="popover-island glass-form">
          <div class="search-input-wrapper">
            <ion-icon name="search-outline" class="inner-icon"></ion-icon>
            <ion-input [(ngModel)]="query" (keyup.enter)="openList()" 
              [placeholder]="'SEARCH.SEARCH' | translate" class="custom-input"></ion-input>
            <ion-icon *ngIf="query" name="close-circle" class="clear-icon" (click)="query = ''; results = []"></ion-icon>
            <ion-icon name="mic-outline" class="mic-icon" (click)="startDictation('query')"></ion-icon>
          </div>
          
          <button class="main-action-btn" (click)="openList()">
            <ion-spinner *ngIf="loading" name="crescent"></ion-spinner>
            <span *ngIf="!loading">{{ 'SEARCH.FIND_PLACES' | translate }}</span>
          </button>

          <div class="results-container" *ngIf="results.length > 0">
            <ion-list lines="none">
              <ion-item *ngFor="let result of results" (click)="handleLocationSelection(result)" button detail="false">
                <ion-label>
                  <h2>{{ result.short_name || result.name }}</h2>
                  <p>{{ result.display_name }}</p>
                </ion-label>
              </ion-item>
            </ion-list>
          </div>
        </div>
      </ng-template>
    </ion-popover>

    <ion-popover
      [isOpen]="reference.isGuidePopoverOpen"
      (didDismiss)="resetRouteState()"
      class="search-popover">
      <ng-template>
        <div class="popover-island glass-form">
          <p class="header-title">{{ 'SEARCH.ROUTE' | translate }}</p>
          
          <div class="input-stack" [class.confirmed]="originCoords">
            <ion-icon name="radio-button-off-outline" color="success"></ion-icon>
            <ion-input [(ngModel)]="query2" [placeholder]="'SEARCH.FROM' | translate" 
              (ionFocus)="activeRouteField = 'origin'"></ion-input>
            <ion-icon name="locate-outline" (click)="useCurrentLocation('origin')" class="action-icon"></ion-icon>
          </div>

          <div class="input-stack" [class.confirmed]="destinationCoords">
            <ion-icon name="location-outline" color="danger"></ion-icon>
            <ion-input [(ngModel)]="query3" [placeholder]="'SEARCH.TO' | translate" 
              (ionFocus)="activeRouteField = 'destination'"></ion-input>
            <ion-icon name="locate-outline" (click)="useCurrentLocation('destination')" class="action-icon"></ion-icon>
          </div>

          <div class="transport-selection">
            <div *ngFor="let mode of transportMeans" 
              class="mode-chip" 
              [class.active]="selectedTransport === mode.id"
              (click)="selectedTransport = mode.id"
              [attr.aria-label]="mode.label | translate"> <ion-icon [name]="mode.icon"></ion-icon>
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
                <ion-label>
                  <h2>{{ result.short_name || result.name }}</h2>
                  <p>{{ result.display_name }}</p>
                </ion-label>
              </ion-item>
            </ion-list>
          </div>
        </div>
      </ng-template>
    </ion-popover>
  `,
  styles: [`
      /* --- ESTRUCTURA BASE FLOTANTE --- */
      .floating-popover, .search-popover {
        --background: transparent;
        --box-shadow: none;
        --width: 92%;
      }

      .popover-island {
        background: rgba(255, 255, 255, 0.96);
        backdrop-filter: blur(15px);
        -webkit-backdrop-filter: blur(15px);
        border-radius: 28px;
        padding: 16px;
        border: 1px solid rgba(255, 255, 255, 0.4);
        box-shadow: 0 12px 35px rgba(0, 0, 0, 0.2);
      }

      /* --- BOTONES ESTILO NAV --- */
      .button-grid { display: flex; justify-content: space-around; gap: 10px; }
      
      .nav-item-btn {
        background: transparent; 
        border: none;
        display: flex; 
        flex-direction: column; 
        align-items: center;
        flex: 1; 
        transition: all 0.2s ease;
        
        ion-icon { 
          font-size: 24px; 
          margin-bottom: 4px; 
          color: #3880ff; /* Color AZUL por defecto para todos los iconos */
        }
        
        p { 
          margin: 0; 
          font-size: 10px; 
          font-weight: 700; 
          text-transform: uppercase; 
          color: #333; /* Texto NEGRO por defecto */
        }
        
        &:active { transform: scale(0.9); }
      }

      /* --- ESTADO ACTIVO (ROJO) --- */
      /* Cuando el botón tiene la clase .red-pill, el icono y el texto cambian a rojo */
      .red-pill ion-icon, 
      .red-pill p { 
        color: #eb445a !important; 
      }

      /* --- FORMULARIOS Y BUSQUEDA --- */
      .header-title { 
        text-align: center; 
        font-weight: 800; 
        font-size: 12px; 
        text-transform: uppercase; 
        margin-top: 0; 
        color: #666; 
      }

      .search-input-wrapper, .input-stack {
        display: flex; 
        align-items: center;
        background: rgba(0,0,0,0.05);
        border-radius: 16px; 
        padding: 4px 12px; 
        margin-bottom: 12px;
        transition: all 0.3s ease;
        
        ion-input { --padding-start: 10px; font-size: 14px; --color: #333; }
        .inner-icon { font-size: 18px; color: #888; }
        .action-icon { font-size: 20px; color: var(--ion-color-primary); margin-left: 8px; }
      }

      .confirmed { 
        background: rgba(var(--ion-color-success-rgb), 0.1); 
        border: 1px solid rgba(var(--ion-color-success-rgb), 0.3); 
      }

      /* --- TRANSPORTE --- */
      .transport-selection {
        display: flex; justify-content: center; gap: 12px; margin: 15px 0;
      }
      .mode-chip {
        width: 42px; height: 42px; border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
        background: #f0f0f0; color: #888; transition: 0.2s;
        ion-icon { font-size: 20px; }
        &.active { background: var(--ion-color-primary); color: white; transform: scale(1.1); }
      }

      /* --- BOTÓN PRINCIPAL --- */
      .main-action-btn {
        width: 100%; background: var(--ion-color-primary); color: white;
        border: none; border-radius: 18px; padding: 14px;
        font-weight: 700; text-transform: uppercase; font-size: 12px;
        display: flex; justify-content: center; align-items: center;
        box-shadow: 0 4px 12px rgba(var(--ion-color-primary-rgb), 0.3);
      }

      /* --- RESULTADOS --- */
      .results-container {
        max-height: 200px; overflow-y: auto; margin-top: 15px;
        border-top: 1px solid #eee;
        ion-item { --background: transparent; --padding-start: 0; h2 { font-size: 13px; font-weight: 700; } p { font-size: 11px; } }
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
  private translate = inject(TranslateService);
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
    { id: 'foot-walking', icon: 'walk-outline', label: 'SEARCH.WALK' },
    { id: 'foot-hiking', icon: 'trending-up-outline', label: 'SEARCH.HIKE' },
    { id: 'cycling-regular', icon: 'bicycle-outline', label: 'SEARCH.CYCLE' },
    { id: 'driving-car', icon: 'car-outline', label: 'SEARCH.DRIVE' },
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
    this.fs.displayToast(this.translate.instant('SEARCH.START_GUIDE'));
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
    this.query2 = this.translate.instant('SEARCH.MY_LOCATION');
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
    this.fs.displayToast(this.translate.instant('SEARCH.SELECT_BOTH'));
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
      this.fs.displayToast(this.translate.instant('SEARCH.NO_ROUTE_FOUND'));
    }
  } catch (error) {
    console.error("Routing error:", error);
    this.fs.displayToast(this.translate.instant('SEARCH.ROUTING_ERROR'));
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
        this.query2 = this.translate.instant('SEARCH.MY_LOCATION');
        this.originCoords = myPos; // myPos ya es [number, number]
      } else {
        this.query3 = this.translate.instant('SEARCH.MY_LOCATION');
        this.destinationCoords = myPos;
      }
      this.fs.displayToast(this.translate.instant('SEARCH.GOT_LOCATION'));
    } else {
      this.fs.displayToast(this.translate.instant('SEARCH.LOCATION_ERROR'));
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