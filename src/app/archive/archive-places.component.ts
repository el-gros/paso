import { Component, EventEmitter, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule, IonItemSliding, PopoverController } from '@ionic/angular';
import { FormsModule } from '@angular/forms';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { FunctionsService } from '../services/functions.service';
import { GeographyService } from '../services/geography.service';
import { LocationResult, PLACE_CATEGORIES } from '../../globald';
import { PlaceEditPopover } from '../place-edit-popover.component';

@Component({
  standalone: true,
  selector: 'app-archive-places',
  templateUrl: 'archive-places.component.html',
  imports: [IonicModule, CommonModule, FormsModule, TranslateModule]
})
export class ArchivePlacesComponent {

  /**
   * Emite cuando el usuario quiere borrar un lugar.
   * El componente padre gestiona el diálogo de confirmación compartido.
   */
  @Output() requestPlaceDeletion = new EventEmitter<{ place: LocationResult, slidingItem: IonItemSliding }>();

  constructor(
    public fs: FunctionsService,
    public geography: GeographyService,
    private translate: TranslateService,
    private popoverController: PopoverController
  ) { }

  // ==========================================================================
  // GETTERS
  // ==========================================================================

  /** Agrupa los lugares por categoría para la vista en acordeón */
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

  /**
   * Comprueba si todos los lugares están ocultos.
   * Al abrir la app (en functions.service.ts), todos los lugares se configuran
   * con visible = false, por lo que esto debería ser true por defecto.
   */
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
  // NAVEGACIÓN AL MAPA
  // ==========================================================================

  focusOnPlace(place: LocationResult) {
    if (place.lat && place.lon) {
      this.geography.showLocationOnMap(place);
      this.fs.gotoPage('tab1');
    }
  }

  centerPlace(place: LocationResult) {
    place.visible = true;
    this.fs.savePlacesToStorage();
    this.geography.refreshPlacesLayer(this.fs.placesCollection);
    this.geography.centerMap(place.lon, place.lat, 15);
  }

  // ==========================================================================
  // EDICIÓN Y BORRADO
  // ==========================================================================

  async editPlace(place: LocationResult, slidingItem?: IonItemSliding) {
    if (slidingItem) slidingItem.close();

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

  confirmPlaceDeletion(place: LocationResult, slidingItem: IonItemSliding) {
    // Delega la confirmación al componente padre (que tiene el diálogo compartido)
    this.requestPlaceDeletion.emit({ place, slidingItem });
  }

  // ==========================================================================
  // FORMATO DE TEXTOS
  // ==========================================================================

  getShortSubtitle(place: LocationResult): string {
    // Si el usuario le ha puesto una descripción manual, la respetamos
    if (place.description) {
      return place.description;
    }

    if (!place.display_name) {
      return '';
    }

    // Dividimos el string gigante por comas
    const parts = place.display_name.split(',');

    // Si hay más de una parte, cogemos la segunda (índice 1) y le quitamos los espacios en blanco
    if (parts.length > 1) {
      return parts[1].trim();
    }

    // Si por casualidad no hay comas, devolvemos lo que haya
    return place.display_name;
  }
}  