/**
 * SearchModalComponent provides a modal interface for searching locations and planning routes.
 *
 * Supports multilingual UI, location search via OpenStreetMap, route calculation using OpenRouteService,
 * and selection of transportation modes. Handles current location retrieval, user selection, and displays
 * relevant notices and placeholders based on context (search or guide).
 *
 * Integrates with organization-specific services for modal control, HTTP requests, and utility functions.
 */

import { firstValueFrom } from 'rxjs';
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { Component, OnInit } from '@angular/core';
import { ModalController } from '@ionic/angular';
import { global } from '../../environments/environment';
import { FunctionsService } from '../services/functions.service';
import { LanguageService } from '../services/language.service';
import { TranslateService } from '@ngx-translate/core';
import { MapService } from '../services/map.service';
import { LocationResult, Route } from '../../globald';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { SharedImports } from '../shared-imports';

@Component({
    selector: 'app-search-modal',
    templateUrl: './search-modal.component.html',
    styleUrls: ['./search-modal.component.scss'],
    imports: [SharedImports],
})

export class SearchModalComponent implements OnInit {
  query: string = '';
  results: LocationResult[] = [];
  loading: boolean = false;
  title: string = '';
  placeholder: string = '';
  num: number = 0;
  start: number[] = [];
  destination: number[] = [];
  route: Route | undefined;
  showTransportation: boolean = false;
  showSelection: boolean = true;
  showCurrent: boolean = false;
  selectedTransportation: string = '';
  selectedCurrent: string = '';
  transportation: string[] = ['','','','','']

  trackName: string = '';

  constructor(
    private modalController: ModalController,
    private fs: FunctionsService,
    private http: HttpClient, // <-- now you can use this.http
    private translate: TranslateService,
    public mapService: MapService
  ) { }

// 1. NGONINIT
// 2. SEARCH LOCATION
// 3. SELECT LOCATION
// 4. DISMISS MODAL
// 5. REQUEST
// 6. CONFIRM SELECTION
// 7. ON CURRENT LOCATION CHANGE

// 1. NGONINIT ///////////////////////////////
ngOnInit(): void {
  // Case of search
  if (global.comingFrom === 'search') {
    this.title = this.translate.instant('SEARCH.TITLE_SEARCH');
    this.placeholder = this.translate.instant('SEARCH.PLACEHOLDER_SEARCH');
  }
  // Case of guide
  else if (global.comingFrom === 'guide') {
    this.title = this.translate.instant('SEARCH.TITLE_GUIDE');
    this.placeholder = this.translate.instant('SEARCH.PLACEHOLDER_GUIDE');
    this.showCurrent = true;
  }
  // Translations
  this.transportation = this.translate.instant('SEARCH.TRANSPORTATION_MEANS');
}

// 2. SEARCH LOCATION ///////////////////////////////////////////

async searchLocation() {
  if (!this.query) return;
  this.loading = true;

  try {
    let url: string;
    let headers: any = { 'Accept': 'application/json' };

    if (global.geocoding === 'mapTiler') {
      // 🌍 MapTiler forward geocoding
      url = `https://api.maptiler.com/geocoding/${encodeURIComponent(this.query)}.json?key=${global.mapTilerKey}`;
    } else {
      // 🌍 Nominatim forward geocoding (default)
      url = `https://nominatim.openstreetmap.org/search?format=json&polygon_geojson=1&q=${encodeURIComponent(this.query)}`;
      headers['User-Agent'] = 'YourAppName/1.0 (you@example.com)'; // required
    }

    const response = await CapacitorHttp.get({ url, headers });
    console.log(`[${global.geocoding}] raw response:`, response.data);

    if (global.geocoding === 'mapTiler') {
      // ✅ Normalize MapTiler results
      const features = response.data?.features ?? [];
      this.results = features.map((f: any, idx: number) => {
        const [lon, lat] = f.geometry.coordinates;

        // compute bbox from geometry if not provided
        const coords = f.geometry.type === 'Point'
          ? [[lon, lat]]
          : f.geometry.coordinates.flat(Infinity).reduce((acc: any[], v: any, i: number) => {
              if (i % 2 === 0) acc.push([v]);
              else acc[acc.length - 1].push(v);
              return acc;
            }, []);

        const lons = coords.map((c: any) => c[0]);
        const lats = coords.map((c: any) => c[1]);
        const boundingbox = [
          Math.min(...lats), // south
          Math.max(...lats), // north
          Math.min(...lons), // west
          Math.max(...lons)  // east
        ];

        return {
          lat,
          lon,
          name: f.text ?? '(no name)',
          display_name: f.place_name ?? f.text ?? '(no name)',
          short_name: f.text ?? f.place_name ?? '(no name)', // 👈 added
          type: f.place_type?.[0] ?? 'unknown',
          place_id: f.id ?? idx,
          boundingbox,
          geojson: f.geometry
        };
      });
    } else {
      // ✅ Normalize Nominatim results
      const rawResults = Array.isArray(response.data) ? response.data : [];
      this.results = rawResults.map((r: any) => {
        const display = r.display_name ?? '(no name)';
        const short = r.address?.road
          ? [r.address.road, r.address.house_number].filter(Boolean).join(' ')
          : (r.address?.city ?? r.address?.town ?? r.address?.village ?? display);

        return {
          lat: parseFloat(r.lat),
          lon: parseFloat(r.lon),
          name: display,
          display_name: display,
          short_name: short, // 👈 added
          type: r.type ?? 'unknown',
          place_id: r.place_id,
          boundingbox: r.boundingbox?.map((n: string) => parseFloat(n)) ?? [],
          geojson: r.geojson ?? null
        };
      });
    }

    this.showCurrent = false;

  } catch (error) {
    console.error(`Error fetching ${global.geocoding} geocoding data:`, error);
    this.fs.displayToast(this.translate.instant('SEARCH.NETWORK_ERROR'));
    this.results = [];
  } finally {
    this.loading = false;
  }
}

// 3. SELECT LOCATION //////////////////////////////////////////
async selectLocation(location: LocationResult | null) {
  if (global.comingFrom  == 'search') {
    console.log('Selected location', location)
    this.modalController.dismiss({location: location ? { ...location, name: this.fs['sanitize'](location.name) } : location });
    return;
  }
  else if (global.comingFrom  == 'guide') {
    this.results = [];
    this.query = '';
    if (this.num == 0) {
      console.log('Selected location', location)
      if (location) {
        this.start = [+location.lon,+location.lat]
        this.trackName = this.fs['sanitize'](location.name);
      }
      else {
        this.trackName = 'o';
      }
      this.placeholder = this.translate.instant('SEARCH.DESTINATION');
      this.num = 1;
      return
    }
    if (this.num == 1) {
      console.log('Selected location', location)
      this.trackName = this.trackName + ' - ' + this.fs['sanitize'](location!.name);
      this.destination = [+location!.lon,+location!.lat]
      this.showSelection = false;
      this.showTransportation = true;
      this.selectedTransportation = '';
    }
  }
}

// 4. DISMISS MODAL ///////////////////////////
dismissModal() {
  this.modalController.dismiss();
}

async request() {
  this.loading = true;
  const url = `https://api.openrouteservice.org/v2/directions/${this.selectedTransportation}/geojson`;
  const body = {
    coordinates: [this.start, this.destination]
  };
  try {
    let responseData: Route;
    // Always native HTTP on Android
    const resp = await CapacitorHttp.post({
      url,
      headers: {
        'Accept': 'application/json, application/geo+json, application/gpx+xml, img/png; charset=utf-8',
        'Content-Type': 'application/json',
        'Authorization': global.authorization
      },
      data: body
    });
    responseData = resp.data;
    responseData = typeof resp.data === 'string' ? JSON.parse(resp.data) : resp.data;
    console.log('response', responseData)
    if (responseData && responseData.features && responseData.features.length > 0) {
      responseData.trackName = this.trackName;
      this.modalController.dismiss({ response: responseData });
    } else {
      console.log('some problem')
      this.fs.displayToast(this.translate.instant('SEARCH.TOAST1'));
      this.modalController.dismiss();
    }
  } catch (error) {
    this.fs.displayToast(this.translate.instant('SEARCH.TOAST1'));
    console.log('dismiss empty')
    this.modalController.dismiss();
  } finally {
    this.loading = false;
  }
}

// 6. CONFIRM SELECTION /////////////////////////////////////////////
confirmSelection() {
  if (this.selectedTransportation != '') this.request();
}

// 7. ON CURRENT LOLCATION CHANGE ////////////////////////////////
async onCurrentLocationChange(event: any): Promise<void> {
  if (event.detail.value === 'current') {
    this.loading = true;
    const maxRetries = 5;
    let attempts = 0;
    let currentLocation: [number, number] | null= null;
    while (!currentLocation && attempts < maxRetries) {
      currentLocation = await this.mapService.getCurrentPosition(true, 2000);
      if (!currentLocation) {
        attempts++;
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    if (!currentLocation) {
      this.fs.displayToast(this.translate.instant('SEARCH.UNKNOWN_LOCATION'));
      this.loading = false;
      return;
    }
    this.start = currentLocation;
    this.loading = false;
    this.showCurrent = false;
    this.num = 0;
    await this.selectLocation(null);
  }
}

}
