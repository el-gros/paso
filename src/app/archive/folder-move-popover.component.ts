import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { PopoverController } from '@ionic/angular/standalone';
import { TranslateModule } from '@ngx-translate/core';
import { IONIC_COMPONENTS } from '../ionic-imports';

// 1. Importamos la utilidad de iconos de Ionicons
import { addIcons } from 'ionicons';
import { arrowRedoOutline, checkmarkOutline, closeOutline } from 'ionicons/icons';

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
          <!-- 2. Reemplazamos ngModel por value e ionChange -->
          <ion-radio-group 
            [value]="selectedFolder" 
            (ionChange)="selectedFolder = $event.detail.value"
          >
            @for (f of folders; track f) {
            <ion-item lines="none" class="custom-radio-item">
              <ion-label>{{ f.label }}</ion-label>
              <ion-radio slot="start" [value]="f.value"></ion-radio>
            </ion-item>
            }
          </ion-radio-group>
        </div>

        <div class="popover-button-grid">
          <button
            class="popover-btn btn-green ion-activatable"
            (click)="dismiss(true)"
          >
            <ion-icon name="checkmark-outline"></ion-icon>
            <span>{{ 'RECORD.DELETE_YES' | translate }}</span>
            <ion-ripple-effect></ion-ripple-effect>
          </button>
          <button
            class="popover-btn btn-red ion-activatable"
            (click)="dismiss(false)"
          >
            <ion-icon name="close-outline"></ion-icon>
            <span>{{ 'RECORD.DELETE_NO' | translate }}</span>
            <ion-ripple-effect></ion-ripple-effect>
          </button>
        </div>
      </div>
    </ion-content>
  `,
  styles: [
    `
      .folder-list-container {
        max-height: 250px;
        background: rgba(0, 0, 0, 0.02);
        border-radius: 14px;
        padding: 8px 0;
      }
      .custom-radio-item {
        --background: transparent;
        --min-height: 40px;
        font-weight: 600;
        color: #444;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.Eager,
  // 3. Ya no necesitamos FormsModule aquí
  imports: [...IONIC_COMPONENTS, TranslateModule],
})
export class FolderMovePopover {
  @Input() folders: any[] = [];
  @Input() selectedFolder: string = '';

  constructor(private popoverCtrl: PopoverController) {
    // 4. Registramos los iconos que usa este popover para que Ionic los encuentre
    addIcons({ arrowRedoOutline, checkmarkOutline, closeOutline });
  }

  dismiss(confirm: boolean) {
    this.popoverCtrl.dismiss(confirm ? this.selectedFolder : null);
  }
}