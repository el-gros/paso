import { Component, Input } from '@angular/core';
import { IonicModule, PopoverController } from '@ionic/angular';
import { TranslateModule } from '@ngx-translate/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

@Component({
  standalone: true,
  selector: 'app-folder-move-popover',
  template: `
    <div class="popover-island confirm-box" style="--width: 300px">
      <p class="confirm-title">{{ 'ARCHIVE.MOVE_TO_FOLDER' | translate }}</p>
      <ion-radio-group [(ngModel)]="selectedFolder">
        <ion-item lines="none" *ngFor="let f of folders">
          <ion-label>{{ f.label }}</ion-label>
          <ion-radio slot="start" [value]="f.value"></ion-radio>
        </ion-item>
      </ion-radio-group>
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
export class FolderMovePopover {
  @Input() folders: any[] = [];
  @Input() selectedFolder: string = '';
  constructor(private popoverCtrl: PopoverController) {}
  dismiss(confirm: boolean) { this.popoverCtrl.dismiss(confirm ? this.selectedFolder : null); }
}