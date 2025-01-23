import { Component, OnInit } from '@angular/core';
import { IonicModule, ModalController } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { global } from '../../environments/environment';
import { FunctionsService } from '../services/functions.service';

@Component({
  selector: 'app-search-modal',
  templateUrl: './search-modal.component.html',
  styleUrls: ['./search-modal.component.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule, FormsModule],
})
export class SearchModalComponent implements OnInit {
  query: string = '';
  results: any[] = [];
  loading: boolean = false;
  title: string = '';
  placeholder: string = '';
  num: number = 0;
  start: number[] = [];
  destination: number[] = []; 
  route: any;
  showTransportation: boolean = false;
  showSelection: boolean = true;
  showCurrent: boolean = false;
  selectedTransportation: string = '';
  selectedCurrent: string = '';
  transportation: string[] = ['','','','','']
  currentLocation: string = '';
  notice1: string = '';
  notice2: string = '';

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
  ) { }

ngOnInit(): void {
  // Access constants and set variables
  if (global.comingFrom === 'search') {
    this.title = this.TITLES.search[global.languageIndex];
    this.placeholder = this.PLACEHOLDERS.search[global.languageIndex];
  } else if (global.comingFrom === 'guide') {
    this.title = this.TITLES.guide[global.languageIndex];
    this.placeholder = this.PLACEHOLDERS.guide[global.languageIndex];
    this.showCurrent = true;
  }
  this.transportation = this.TRANSPORTATION_MEANS[global.languageIndex];
  this.currentLocation = this.CURRENT_LOCATION[global.languageIndex];
  this.notice1 = this.NOTICES.notice1[global.languageIndex];
  this.notice2 = this.NOTICES.notice2[global.languageIndex];
}
  
initializeTexts(): void {
  const titles = ['Trobeu la ubicació', 'Encuentra la ubicación', 'Find location'];
  const placeholders = ['Nom del lloc', 'Nombre del lugar', 'Enter place name'];
  // Initialize other arrays here
  this.title = titles[global.languageIndex];
  this.placeholder = placeholders[global.languageIndex];
}

  async searchLocation() {
    if (!this.query) return;
    this.loading = true;
    //const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(this.query)}`;
    const url = `https://nominatim.openstreetmap.org/search?format=json&polygon_geojson=1&q=${encodeURIComponent(this.query)}`;
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      this.results = await response.json();
      this.showCurrent = false;  
    } catch (error) {
      console.error('Error fetching geocoding data:', error);
    } finally {
      this.loading = false;
    }
  }

  async selectLocation(location: any) {
    if (global.comingFrom  == 'search') {
      console.log('Selected location', location)
      this.modalController.dismiss({
        //bbox: location.boundingbox, 
        location: location 
      });
    }
    else if (global.comingFrom  == 'guide' && this.num == 0) {
      console.log('Selected location', location)
      if (location) this.start = [+location.lon,+location.lat]
      let placeholders = ['Destinació','Destino','Destination']
      this.placeholder = placeholders[global.languageIndex];
      this.results = [];
      this.query = '';
      this.num = 1;
    }
    else if (global.comingFrom  == 'guide' && this.num == 1) {
      console.log('Selected location', location)
      this.destination = [+location.lon,+location.lat]
      this.results = [];
      this.query = '';
      this.showSelection = false;
      this.showTransportation = true; 
      this.selectedTransportation = '';
    }
  }

  dismissModal() {
    this.modalController.dismiss();
  }

  async request() {
    this.loading = true;
    let request = new XMLHttpRequest();
    const body = JSON.stringify({
      coordinates: [this.start, this.destination]
    });
    console.log('request body: ', body)
    //request.open('POST', "https://api.openrouteservice.org/v2/directions/foot-hiking/geojson");
    const url = `https://api.openrouteservice.org/v2/directions/${this.selectedTransportation}/geojson`;
    request.open('POST', url);
    request.setRequestHeader('Accept', 'application/json, application/geo+json, application/gpx+xml, img/png; charset=utf-8');
    request.setRequestHeader('Content-Type', 'application/json');
    request.setRequestHeader('Authorization', '5b3ce3597851110001cf624876b05cf836e24d5aafce852a55c3ea23');
    // Use an arrow function to retain the `this` context
    request.onreadystatechange = async () => {
      if (request.readyState === 4) {
        this.loading = false;
        if (request.status === 200) { // HTTP OK
          const response = JSON.parse(request.responseText); // Parse JSON response
          console.log('Response:', response); // Log response object
          // Call modalController.dismiss with the route data
          if (response.features && response.features.length > 0) {
            this.modalController.dismiss({
              response: response
            });
          } else {
            console.error('No route features found in the response.');
            const toast = ["No s'ha trobat cap ruta",'No se ha encontrado ninguna ruta','No route found']
            this.fs.displayToast(toast[global.languageIndex]);
            this.modalController.dismiss();
          }
        } else {
          console.error('Error:', request.status, request.responseText); // Log error details
          //const toast = ["Sense connexió amb el servidor",'Sin conexión con el servidor','Server connection failed']
          const toast = ["No s'ha trobat cap ruta",'No se ha encontrado ninguna ruta','No route found']
          this.fs.displayToast(toast[global.languageIndex]);
          this.modalController.dismiss();
        }
      }
    };
    //const body = '{"coordinates":[[8.686507,49.41943],[8.687872,49.420318]]}';
    request.send(body);
  }

  confirmSelection() {
    if (this.selectedTransportation != '') {
      this.request();
    } else {
      console.error('No transportation selected');
    }
  }

  async onCurrentLocationChange(event: any): Promise<void> {
    console.log('Selected value:', event.detail.value);
    // Perform actions based on the new value
    if (event.detail.value === 'current') {
      console.log('Current location selected');
      this.loading = true;
      this.start = await this.fs.getCurrentPosition();
      this.loading = false;
      this.showCurrent = false;
      this.num = 0;
      await this.selectLocation(null);
    }
  }

}
