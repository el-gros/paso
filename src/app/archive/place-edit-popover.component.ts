import { Component, Input, OnInit, inject } from '@angular/core';
import { PopoverController, IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms'; 
import { TranslateModule } from '@ngx-translate/core';
import { LocationResult, PLACE_CATEGORIES } from '../../globald';

@Component({
  selector: 'app-place-edit-popover',
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule, TranslateModule],
  template: `
    <ion-content scrollY="false" class="ion-no-padding">
      <div class="local-glass-island">
        <div class="popover-header">
          <ion-icon name="location-outline" class="header-icon"></ion-icon>
          <h2>{{ 'ARCHIVE.EDIT' | translate | uppercase }}</h2>
        </div>
        <div class="form-container">
          <div class="input-group">
            <ion-label class="custom-label">{{ 'EDIT.NAME' | translate }}</ion-label>
            <ion-textarea [(ngModel)]="editablePlace.name" rows="1" autoGrow="true" class="custom-textarea"></ion-textarea>
          </div>
          <div class="input-group">
            <ion-label class="custom-label">{{ 'EDIT.DESCRIPTION' | translate }}</ion-label>
            <ion-textarea [(ngModel)]="editablePlace.description" rows="2" autoGrow="true" class="custom-textarea"></ion-textarea>
          </div>
          <div class="input-group">
            <ion-label class="custom-label">{{ 'ARCHIVE.PLACES' | translate }}</ion-label>
            <div class="categories-grid">
              @for (cat of availableCategories; track cat.id) {
                <div class="category-item" [class.selected]="isCategorySelected(cat.id)" (click)="toggleCategory(cat.id)">
                   <ion-icon [name]="cat.icon" [color]="isCategorySelected(cat.id) ? 'white' : cat.color"></ion-icon>
                   <span>{{ 'CATEGORIES.' + cat.id.toUpperCase() | translate }}</span>
                </div>
              }
            </div>
          </div>
        </div>
        <div class="popover-button-grid">
          <button class="popover-btn btn-green ion-activatable" (click)="confirm()">
            <ion-icon name="checkmark-outline"></ion-icon>
            <span>{{ 'RECORD.DELETE_YES' | translate }}</span>
            <ion-ripple-effect></ion-ripple-effect>
          </button>
          <button class="popover-btn btn-red ion-activatable" (click)="cancel()">
            <ion-icon name="close-outline"></ion-icon>
            <span>{{ 'RECORD.DELETE_NO' | translate }}</span>
            <ion-ripple-effect></ion-ripple-effect>
          </button>
        </div>
      </div>
    </ion-content>
  `,
  styles: [`
    /* Solo CSS único de este componente */
    .form-container { padding-right: 4px; }
    .categories-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 5px; }
    .category-item {
      display: flex; align-items: center; gap: 8px; padding: 10px; border-radius: 12px;
      background: rgba(0,0,0,0.03); border: 1px solid transparent; transition: 0.2s; cursor: pointer;
      ion-icon { font-size: 18px; }
      span { font-size: 11px; font-weight: 600; color: #444; }
      &.selected { background: var(--ion-color-primary); border-color: var(--ion-color-primary); span, ion-icon { color: white !important; } }
    }
  `]
})
export class PlaceEditPopover implements OnInit {
  @Input() place!: LocationResult;
  public editablePlace!: LocationResult;
  public availableCategories = PLACE_CATEGORIES;
  private popoverCtrl = inject(PopoverController);

  ngOnInit() {
    this.editablePlace = JSON.parse(JSON.stringify(this.place));
    if (!this.editablePlace.categories) this.editablePlace.categories = [];
    if (!this.editablePlace.description && this.editablePlace.display_name) {
      const parts = this.editablePlace.display_name.split(',');
      if (parts.length > 1) {
        this.editablePlace.description = parts[1].trim(); 
      } else {
        this.editablePlace.description = this.editablePlace.display_name;
      }
    }
  }

  isCategorySelected(id: string): boolean { return this.editablePlace.categories?.includes(id) || false; }
  toggleCategory(id: string) {
    if (!this.editablePlace.categories) this.editablePlace.categories = [];
    const idx = this.editablePlace.categories.indexOf(id);
    if (idx > -1) this.editablePlace.categories.splice(idx, 1);
    else this.editablePlace.categories.push(id);
  }
  cancel() { this.popoverCtrl.dismiss(); }
  confirm() { 
    if (!this.editablePlace.categories || this.editablePlace.categories.length === 0) {
      this.editablePlace.categories = ['other'];
    }
    this.popoverCtrl.dismiss({ action: 'ok', place: this.editablePlace }); 
  }
}