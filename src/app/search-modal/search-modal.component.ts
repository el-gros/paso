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
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Component, OnInit } from '@angular/core';
import { IonicModule, ModalController } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { global } from '../../environments/environment';
import { FunctionsService } from '../services/functions.service';

interface LocationResult {
  lon: number;
  lat: number;
  name: string;
  [key: string]: any;
}

interface Route {
  features: any[]; // Replace `any` with a more specific type if available
  trackName?: string;
  [key: string]: any;
}

@Component({
    selector: 'app-search-modal',
    templateUrl: './search-modal.component.html',
    styleUrls: ['./search-modal.component.scss'],
    imports: [CommonModule, IonicModule, FormsModule]
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
  currentLocation: string = '';
  notice1: string = '';
  notice2: string = '';
  trackName: string = '';

  // Constants for localization
  private readonly TITLES = {
    search: ['Trobeu la ubicació', 'Encuentra la ubicación', 'Find location'],
    guide: ['Trobeu la millor ruta', 'Encuentra la mejor ruta', 'Find the best route']
  };
  private readonly PLACEHOLDERS = {
    search: ['Nom del lloc', 'Nombre del lugar', 'Enter place name'],
    guide: ['Inici', 'Inicio', 'Start']
  };
  private readonly TRANSPORTATION_MEANS = [
    ['En cotxe', 'En bicicleta', 'A peu', 'Senderisme', 'En cadira de rodes'],
    ['En coche', 'En bicicleta', 'A pie', 'Senderismo', 'En silla de ruedas'],
    ['By car', 'Cycling', 'Walking', 'Hiking', 'In a wheelchair']
  ];
  private readonly CURRENT_LOCATION = [
    'Posició actual', 'Posición actual', 'Current location'
  ];
  private readonly NOTICES = {
    notice1: [
      "Introduïu un punt d'inici...",
      'Introducir un punto de inicio...',
      'Enter a starting point...'
    ],
    notice2: [
      "... o seleccioneu posició actual",
      'o seleccionar la posición actual',
      '... or select current location'
    ]
  };

  constructor(
    private modalController: ModalController,
    private fs: FunctionsService,
    private http: HttpClient
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
    this.title = this.TITLES.search[global.languageIndex];
    this.placeholder = this.PLACEHOLDERS.search[global.languageIndex];
  }
  // Case of guide
  else if (global.comingFrom === 'guide') {
    this.title = this.TITLES.guide[global.languageIndex];
    this.placeholder = this.PLACEHOLDERS.guide[global.languageIndex];
    this.showCurrent = true;
  }
  // Translations
  this.transportation = this.TRANSPORTATION_MEANS[global.languageIndex];
  this.currentLocation = this.CURRENT_LOCATION[global.languageIndex];
  this.notice1 = this.NOTICES.notice1[global.languageIndex];
  this.notice2 = this.NOTICES.notice2[global.languageIndex];
}

// 2. SEARCH LOCATION ///////////////////////////////////////////
async searchLocation() {
  if (!this.query) return;
  this.loading = true;
  const url = `https://nominatim.openstreetmap.org/search?format=json&polygon_geojson=1&q=${encodeURIComponent(this.query)}`;
  try {
    const response = await firstValueFrom(this.http.get<LocationResult[]>(url));
    this.results = response ?? [];
    this.showCurrent = false;
  } catch (error) {
    console.error('Error fetching geocoding data:', error);
    this.fs.displayToast(['Error de xarxa', 'Error de red', 'Network error'][global.languageIndex]);
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
      let placeholders = ['Destinació','Destino','Destination']
      this.placeholder = placeholders[global.languageIndex];
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

// 5. REQUEST ////////////////////////////
async request() {
  this.loading = true;
  const url = `https://api.openrouteservice.org/v2/directions/${this.selectedTransportation}/geojson`;
  const body = {
    coordinates: [this.start, this.destination]
  };
  const headers = new HttpHeaders({
    'Accept': 'application/json, application/geo+json, application/gpx+xml, img/png; charset=utf-8',
    'Content-Type': 'application/json',
    'Authorization': global.authorization
  });
  try {
    const response = await firstValueFrom(this.http.post<Route>(url, body, { headers }));
    if (response && response.features && response.features.length > 0) {
      response.trackName = this.trackName;
      this.modalController.dismiss({ response });
    } else {
      const toast = ["No s'ha trobat cap ruta",'No se ha encontrado ninguna ruta','No route found'];
      this.fs.displayToast(toast[global.languageIndex]);
      this.modalController.dismiss();
    }
  } catch (error) {
    const toast = ["No s'ha trobat cap ruta",'No se ha encontrado ninguna ruta','No route found'];
    this.fs.displayToast(toast[global.languageIndex]);
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
    let currentLocation: [number, number] | undefined = undefined;
    while (!currentLocation && attempts < maxRetries) {
      currentLocation = await this.fs.getCurrentPosition(true, 2000);
      if (!currentLocation) {
        attempts++;
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    if (!currentLocation) {
      this.fs.displayToast(['No s\'ha pogut obtenir la posició actual', 'No se pudo obtener la posición actual', 'Could not obtain current location'][global.languageIndex]);
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
