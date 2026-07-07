import { Component, EventEmitter, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule, PopoverController, ItemReorderEventDetail } from '@ionic/angular';
import { FormsModule } from '@angular/forms';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { FunctionsService } from '../services/functions.service';
import { GeographyService } from '../services/geography.service';
import { LocationResult, PLACE_CATEGORIES } from '../../globald';
import { PlaceEditPopover } from './place-edit-popover.component';
import { PlaceOptionsPopoverComponent } from './place-options-popover.component';

@Component({
  standalone: true,
  selector: 'app-archive-places',
  templateUrl: 'places.component.html',
  styleUrls: ['places.component.scss'],
  imports: [IonicModule, CommonModule, FormsModule, TranslateModule]
})
export class PlacesComponent {

  @Output() requestPlaceDeletion = new EventEmitter<{ place: LocationResult }>();

  constructor(
    public fs: FunctionsService,
    public geography: GeographyService,
    private translate: TranslateService,
    private popoverController: PopoverController
  ) { }

  // ==========================================================================
  // GETTERS
  // ==========================================================================

  get groupedPlaces() {
    const groups: { category: any, places: LocationResult[] }[] = [];
    for (const cat of PLACE_CATEGORIES) {
      const placesInCat = this.fs.placesCollection.filter(p =>
        p.categories && p.categories.length > 0 && p.categories[0] === cat.id
      );
      if (placesInCat.length > 0) {
        groups.push({ category: cat, places: placesInCat });
      }
    }
    return groups;
  }

  get isAllPlacesVisible(): boolean {
    if (this.fs.placesCollection.length === 0) return true;
    return this.fs.placesCollection.every(p => p.visible);
  }

  get isAllPlacesHidden(): boolean {
    if (this.fs.placesCollection.length === 0) return true;
    return this.fs.placesCollection.every(p => !p.visible);
  }

  // ==========================================================================
  // VISIBILIDAD GLOBAL Y POR CATEGORÍA
  // ==========================================================================

  displayAllPlaces(show: boolean) {
    this.fs.placesCollection.forEach(p => p.visible = show);
    this.fs.savePlacesToStorage();
    this.geography.refreshPlacesLayer(this.fs.placesCollection);
    const msg = show ? 'ARCHIVE.ALL_PLACES_DISPLAYED' : 'ARCHIVE.ALL_PLACES_HIDDEN';
    this.fs.displayToast(this.translate.instant(msg), 'success');
  }

  isCategoryVisible(categoryId: string): boolean {
    return this.fs.placesCollection
      .filter(p => p.categories && p.categories[0] === categoryId)
      .some(p => p.visible === true);
  }

  isAllCategoryVisible(categoryId: string): boolean {
    const places = this.fs.placesCollection.filter(p => p.categories && p.categories[0] === categoryId);
    if (places.length === 0) return true;
    return places.every(p => p.visible);
  }

  isAllCategoryHidden(categoryId: string): boolean {
    const places = this.fs.placesCollection.filter(p => p.categories && p.categories[0] === categoryId);
    if (places.length === 0) return true;
    return places.every(p => !p.visible);
  }

  setCategoryVisibility(categoryId: string, show: boolean, event: Event) {
    event.stopPropagation();
    this.fs.placesCollection.forEach(p => {
      if (p.categories && p.categories[0] === categoryId) p.visible = show;
    });
    this.fs.savePlacesToStorage();
    this.geography.refreshPlacesLayer(this.fs.placesCollection);
  }

  // ==========================================================================
  // VISIBILIDAD INDIVIDUAL
  // ==========================================================================

  togglePlaceVisibility(place: LocationResult, event: Event) {
    event.stopPropagation();
    const realIndex = this.fs.placesCollection.findIndex(p => p.lat === place.lat && p.lon === place.lon);
    if (realIndex > -1) {
      this.fs.updatePlace(realIndex, place);
      this.geography.refreshPlacesLayer(this.fs.placesCollection);
    }
  }

  onPlaceVisibilityChange() {
    this.fs.savePlacesToStorage();
    this.geography.refreshPlacesLayer(this.fs.placesCollection);
  }

  // ==========================================================================
  // NAVEGACIÓN Y CENTRADO MANUAL (CONTROL TOTAL)
  // ==========================================================================

  centerPlace(place: LocationResult) {

    // 1. Centramos con tu función de confianza
    if (place.lat && place.lon) {
      // this.geography.centerMap(place.lon, place.lat, 14);
      this.geography.pendingLocation = place;
    }

    // 2. Navegamos
    this.fs.gotoPage('tab1');

  }

  // ==========================================================================
  // EDICIÓN, BORRADO Y REORDENAMIENTO
  // ==========================================================================

  async editPlace(place: LocationResult) {
    const realIndex = this.fs.placesCollection.findIndex(p => p.lat === place.lat && p.lon === place.lon);

    if (realIndex > -1) {
      const popover = await this.popoverController.create({
        component: PlaceEditPopover,
        componentProps: { place: place },
        backdropDismiss: true,
        cssClass: 'top-glass-island-wrapper',
        translucent: true,
      });

      await popover.present();
      const { data } = await popover.onDidDismiss();

      if (data?.action === 'ok' && data.place) {
        this.fs.updatePlace(realIndex, data.place);
        this.geography.refreshPlacesLayer(this.fs.placesCollection);
      }
    }
  }

  handlePlaceReorder(ev: CustomEvent<ItemReorderEventDetail>, categoryId: string) {
    const placesInCat = this.fs.placesCollection.filter(p =>
      p.categories && p.categories.length > 0 && p.categories[0] === categoryId
    );

    const reorderedSubset = ev.detail.complete(placesInCat);

    const originalGlobalIndices = this.fs.placesCollection
      .map((p, index) => (p.categories && p.categories[0] === categoryId) ? index : -1)
      .filter(index => index !== -1);

    originalGlobalIndices.forEach((globalIndex, i) => {
      this.fs.placesCollection[globalIndex] = reorderedSubset[i];
    });

    this.fs.savePlacesToStorage();
  }

  // ==========================================================================
  // POPUP OPCIONES DE LUGAR
  // ==========================================================================

  async openPlaceOptionsPopover(place: LocationResult, event: Event | any) {
    if (event) event.stopPropagation();
    const popover = await this.popoverController.create({
      component: PlaceOptionsPopoverComponent,
      cssClass: 'glass-island-wrapper',
      translucent: true,
      backdropDismiss: true,
      event: event,
    });

    await popover.present();
    const { data, role } = await popover.onDidDismiss();

    if (role === 'backdrop' || role === 'cancel') return;

    if (data && data.action) {
      switch (data.action) {
        case 'center': this.centerPlace(place); break;
        case 'edit': await this.editPlace(place); break;
        case 'delete': this.requestPlaceDeletion.emit({ place }); break;
      }
    }
  }

  // ==========================================================================
  // FORMATO DE TEXTOS
  // ==========================================================================

  getShortSubtitle(place: LocationResult): string {
    if (place.description) return place.description;
    if (!place.display_name) return '';
    const parts = place.display_name.split(',');
    if (parts.length > 1) return parts[1].trim();
    return place.display_name;
  }
}