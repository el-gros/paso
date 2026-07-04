import { Component, Input } from '@angular/core';
import { IonicModule, PopoverController } from '@ionic/angular';
import { TranslateModule } from '@ngx-translate/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

@Component({
  standalone: true,
  selector: 'app-folder-action-popover',
  template: `
    <div class="popover-island confirm-box">
      <p class="confirm-title">{{ title | translate }}</p>
      <ion-item lines="none" style="--background: transparent">
        <ion-input [(ngModel)]="inputValue" [placeholder]="placeholder | translate"></ion-input>
      </ion-item>
      <div class="button-grid horizontal">
        <button class="glass-pill-btn red-pill" (click)="dismiss(false)">
          <ion-icon name="close-outline"></ion-icon>
          <span>{{ 'RECORD.DELETE_NO' | translate }}</span>
        </button>
        <button class="glass-pill-btn green-pill" (click)="dismiss(true)">
          <ion-icon name="checkmark-outline"></ion-icon>
          <span>{{ 'RECORD.DELETE_YES' | translate }}</span>
        </button>
      </div>
    </div>
  `,
  imports: [IonicModule, TranslateModule, FormsModule, CommonModule]
})
export class FolderActionPopover {
  @Input() title: string = '';
  @Input() placeholder: string = '';
  @Input() inputValue: string = '';

  constructor(private popoverCtrl: PopoverController) {}

  dismiss(confirm: boolean) {
    this.popoverCtrl.dismiss(confirm ? this.inputValue : null);
  }
}