import { Component, OnInit } from '@angular/core';
import { IonicModule, ModalController } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { global } from '../../environments/environment';

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
  selectedTransportation: string = '';
  transportation: string[] = ['','','','','']   

  constructor(
    private modalController: ModalController
  ) { }

  ngOnInit(): void {
    let titles: string[] = [];
    let placeholders: string[] = [];
    let transportationMeans = [['En cotxe', 'En bicicleta', 'A peu', 'Senderisme', 'En cadira de rodes'],
      ['En coche', 'En bicicleta', 'A pie', 'Senderismo','En silla de ruedas'],
      ['By car', 'Cycling', 'Walking', 'Hiking','In a wheelchair']];
    if (global.comingFrom  == 'search') {
      titles = ['Trobeu la ubicació', 'Encuentra la ubicación', 'Find location'];
      placeholders = ['Nom del lloc', 'Nombre del lugar', 'Enter place name']
    }
    else if (global.comingFrom  == 'guide') {
      titles = ['Trobeu la millor ruta', 'Encuentra la mejor ruta', 'Find the best route']
      placeholders = ['Inici','Inicio','Start']
    }
    this.title = titles[global.languageIndex];
    this.placeholder = placeholders[global.languageIndex];  
    this.transportation = transportationMeans[global.languageIndex];  
  }

  ionViewWillEnter() {
    this.num = 0;
  }

  async searchLocation() {
    if (!this.query) return;
    this.loading = true;
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(this.query)}`;
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      this.results = await response.json();
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
        bbox: location.boundingbox, 
      });
    }
    else if (global.comingFrom  == 'guide' && this.num == 0) {
      console.log('Selected location', location)
      this.start = [+location.lon,+location.lat]
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
          }
        } else {
          console.error('Error:', request.status, request.responseText); // Log error details
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


}