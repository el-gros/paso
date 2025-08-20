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
import { IonicModule, ModalController } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { global } from '../../environments/environment';
import { FunctionsService } from '../services/functions.service';
import { LanguageService } from '../services/language.service';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { MapService } from '../services/map.service';
import { LocationResult, Route } from '../../globald';
import { HttpClient, HttpHeaders } from '@angular/common/http';

@Component({
    selector: 'app-search-modal',
    templateUrl: './search-modal.component.html',
    styleUrls: ['./search-modal.component.scss'],
    imports: [CommonModule, IonicModule, FormsModule, TranslateModule]
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

  const url = `https://nominatim.openstreetmap.org/search?format=json&polygon_geojson=1&q=${encodeURIComponent(this.query)}`;

  try {
    const response = await CapacitorHttp.get({
      url,
      headers: { 'Accept': 'application/json' }
    });

    // response.data is already parsed JSON
    this.results = response.data ?? [];
    this.showCurrent = false;

  } catch (error) {
    console.error('Error fetching geocoding data:', error);
    this.fs.displayToast(this.translate.instant('SEARCH.NETWORK_ERROR'));
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

    if (Capacitor.isNativePlatform()) {
      // Native HTTP via Capacitor
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
    } else {
      // Browser HTTP via Angular
      const headers = new HttpHeaders({
        'Accept': 'application/json, application/geo+json, application/gpx+xml, img/png; charset=utf-8',
        'Content-Type': 'application/json',
        'Authorization': global.authorization
      });
      responseData = await firstValueFrom(this.http.post<Route>(url, body, { headers }));
    }
    if (responseData && responseData.features && responseData.features.length > 0) {
      responseData.trackName = this.trackName;
      this.modalController.dismiss({ response: responseData });
    } else {
      this.fs.displayToast(this.translate.instant('SEARCH.TOAST1'));
      this.modalController.dismiss();
    }

  } catch (error) {
    this.fs.displayToast(this.translate.instant('SEARCH.TOAST1'));
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
