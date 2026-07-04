import { Component, Input } from '@angular/core';
import { IonicModule, PopoverController } from '@ionic/angular';
import { TranslateModule } from '@ngx-translate/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

@Component({
  standalone: true,
  selector: 'app-folder-move-popover',
  template: `
    <ion-content scrollY="false" class="ion-no-padding">
      <div class="local-glass-island">
        <div class="popover-header">
          <ion-icon name="arrow-redo-outline" class="header-icon"></ion-icon>
          <h2>{{ 'ARCHIVE.MOVE_TO_FOLDER' | translate }}</h2>
        </div>
        <div class="form-container folder-list-container">
          <ion-radio-group [(ngModel)]="selectedFolder">
            <ion-item lines="none" *ngFor="let f of folders" class="custom-radio-item">
              <ion-label>{{ f.label }}</ion-label>
              <ion-radio slot="start" [value]="f.value"></ion-radio>
            </ion-item>
          </ion-radio-group>
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
  styles: [`
    /* Solo CSS único de este componente */
    .folder-list-container {
      max-height: 250px; background: rgba(0, 0, 0, 0.02);
      border-radius: 14px; padding: 8px 0;
    }
    .custom-radio-item {
      --background: transparent; --min-height: 40px;
      font-weight: 600; color: #444;
    }
  `],
  imports: [IonicModule, TranslateModule, FormsModule, CommonModule]
})
export class FolderMovePopover {
  @Input() folders: any[] = [];
  @Input() selectedFolder: string = '';
  constructor(private popoverCtrl: PopoverController) {}
  dismiss(confirm: boolean) { this.popoverCtrl.dismiss(confirm ? this.selectedFolder : null); }
}