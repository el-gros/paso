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

  constructor(
    private modalController: ModalController
  ) { }

  ngOnInit(): void {
    const titles = ['Troba la ubicació', 'Encuentra la ubicación', 'Find location']
    const placeholders = ['Nom del lloc', 'Nombre del lugar', 'Enter place name']
    this.title = titles[global.languageIndex];
    this.placeholder = placeholders[global.languageIndex];  
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

  selectLocation(location: any) {
    console.log('Selected location', location)
    this.modalController.dismiss({
      bbox: location.boundingbox, 
    });
  }

  dismissModal() {
    this.modalController.dismiss();
  }
}