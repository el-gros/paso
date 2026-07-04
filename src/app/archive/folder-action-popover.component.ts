import { Component, Input } from '@angular/core';
import { IonicModule, PopoverController } from '@ionic/angular';
import { TranslateModule } from '@ngx-translate/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

@Component({
  standalone: true,
  selector: 'app-folder-action-popover',
  template: `
    <ion-content scrollY="false" class="ion-no-padding">
      <div class="local-glass-island">
        <div class="popover-header">
          <ion-icon name="folder-outline" class="header-icon"></ion-icon>
          <h2>{{ title | translate }}</h2>
        </div>
        <div class="form-container">
          <div class="input-group">
            <ion-input [(ngModel)]="inputValue" [placeholder]="placeholder | translate" class="custom-input"></ion-input>
          </div>
        </div>
        <div class="popover-button-grid">
          <button class="popover-btn btn-green ion-activatable" (click)="dismiss(true)">
            <ion-icon name="checkmark-outline"></ion-icon>
            <span>{{ 'RECORD.DELETE_YES' | translate }}</span>
            <ion-ripple-effect></ion-ripple-effect>
          </button>
          <button class="popover-btn btn-red ion-activatable" (click)="dismiss(false)">
            <ion-icon name="close-outline"></ion-icon>
            <span>{{ 'RECORD.DELETE_NO' | translate }}</span>
            <ion-ripple-effect></ion-ripple-effect>
          </button>
        </div>
      </div>
    </ion-content>
  `,
  styles: [``], /* ¡Cero CSS local! */
  imports: [IonicModule, TranslateModule, FormsModule, CommonModule]
})
export class FolderActionPopover {
  @Input() title: string = '';
  @Input() placeholder: string = '';
  @Input() inputValue: string = '';
  constructor(private popoverCtrl: PopoverController) {}
  dismiss(confirm: boolean) { this.popoverCtrl.dismiss(confirm ? this.inputValue : null); }
}