import { Component, Input, OnInit, inject } from '@angular/core';
import { PopoverController, IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms'; 
import { TranslateModule } from '@ngx-translate/core';
import { LocationResult, PLACE_CATEGORIES } from '../globald';

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

        <div class="button-grid">
          <button class="nav-item-btn green-pill ion-activatable" (click)="confirm()">
            <ion-icon name="checkmark-outline"></ion-icon>
            <span>{{ 'GENERIC.OK' | translate }}</span>
            <ion-ripple-effect></ion-ripple-effect>
          </button>
          <button class="nav-item-btn red-pill ion-activatable" (click)="cancel()">
            <ion-icon name="close-outline"></ion-icon>
            <span>{{ 'EDIT.CANCEL' | translate }}</span>
            <ion-ripple-effect></ion-ripple-effect>
          </button>
        </div>

      </div>
    </ion-content>
  `,
  styles: [`
    ion-content { --background: transparent; }
    .local-glass-island {
      background: rgba(255, 255, 255, 0.96) !important;
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border-radius: 30px;
      border: 1px solid rgba(255, 255, 255, 0.6);
      box-shadow: 0 12px 40px rgba(0, 0, 0, 0.25);
      padding: 24px;
      display: flex;
      flex-direction: column;
      max-height: 95vh;
    }
    .popover-header {
      display: flex; align-items: center; gap: 10px; margin-bottom: 15px;
      padding-bottom: 10px; border-bottom: 1px solid rgba(0,0,0,0.05);
      .header-icon { font-size: 20px; color: var(--ion-color-primary); }
      h2 { margin: 0; font-size: 14px; font-weight: 800; text-transform: uppercase; color: #333; }
    }
    .form-container { display: flex; flex-direction: column; gap: 14px; overflow-y: auto; padding-right: 4px; }
    .custom-label { font-size: 10px; font-weight: 800; color: var(--ion-color-primary); text-transform: uppercase; margin-bottom: 4px; display: block; }
    .custom-textarea { background: rgba(0, 0, 0, 0.05); border-radius: 14px; --padding-start: 12px; margin: 0; }
    .categories-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 5px; }
    .category-item {
      display: flex; align-items: center; gap: 8px; padding: 10px; border-radius: 12px;
      background: rgba(0,0,0,0.03); border: 1px solid transparent; transition: 0.2s; cursor: pointer;
      ion-icon { font-size: 18px; }
      span { font-size: 11px; font-weight: 600; color: #444; }
      &.selected { background: var(--ion-color-primary); border-color: var(--ion-color-primary); span, ion-icon { color: white !important; } }
    }
    .button-grid { display: flex; justify-content: center; gap: 16px; margin-top: 25px; }
    .nav-item-btn {
      position: relative; overflow: hidden; flex: 1; min-width: 100px; height: 70px;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      border: none; border-radius: 20px; background: white; box-shadow: 0 4px 10px rgba(0,0,0,0.05);
      cursor: pointer; transition: transform 0.1s;
      ion-icon { font-size: 28px; margin-bottom: 4px; pointer-events: none; }
      span { margin: 0; font-size: 11px; font-weight: 800; text-transform: uppercase; pointer-events: none; }
      &:active { transform: scale(0.94); }
    }
    .green-pill { color: #2dd36f; }
    .red-pill { color: #eb445a; }
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
  }

  isCategorySelected(id: string): boolean {
    return this.editablePlace.categories?.includes(id) || false;
  }

  toggleCategory(id: string) {
    if (!this.editablePlace.categories) this.editablePlace.categories = [];
    const idx = this.editablePlace.categories.indexOf(id);
    if (idx > -1) {
      this.editablePlace.categories.splice(idx, 1);
    } else {
      this.editablePlace.categories.push(id);
    }
  }

  cancel() { this.popoverCtrl.dismiss(); }
  confirm() { 
    if (!this.editablePlace.categories || this.editablePlace.categories.length === 0) {
      this.editablePlace.categories = ['other'];
    }
    this.popoverCtrl.dismiss({ action: 'ok', place: this.editablePlace }); 
  }
}