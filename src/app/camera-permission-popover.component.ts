import { Component, inject } from '@angular/core';
import { PopoverController, IonicModule } from '@ionic/angular';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-camera-permission-popover',
  standalone: true,
  imports: [IonicModule, TranslateModule],
  template: `
    <ion-content scrollY="false" class="ion-no-padding">
      <div class="local-glass-island">
        
        <div class="icon-container">
          <ion-icon name="camera-outline"></ion-icon>
        </div>
        
        <h2>{{ 'CAMERA_PERMISSION.HEADER' | translate }}</h2>
        <p>{{ 'CAMERA_PERMISSION.MESSAGE' | translate }}</p>

        <div class="popover-button-grid">
          <button class="popover-btn btn-blue" (click)="confirm()">
            <ion-icon name="checkmark-outline"></ion-icon>
            <span>{{ 'CAMERA_PERMISSION.OK' | translate }}</span>
            <ion-ripple-effect></ion-ripple-effect>
          </button>
          
          <button class="popover-btn btn-red" (click)="cancel()">
            <ion-icon name="close-outline"></ion-icon>
            <span>{{ 'CAMERA_PERMISSION.CANCEL' | translate }}</span>
            <ion-ripple-effect></ion-ripple-effect>
          </button>
        </div>

      </div>
    </ion-content>
  `,
  styles: [`
    .local-glass-island { text-align: center; padding: 24px; }
    
    .icon-container { display: flex; justify-content: center; margin-bottom: 10px; }
    .icon-container ion-icon { font-size: 42px; color: var(--ion-color-primary); }

    h2 { font-size: 16px; font-weight: 800; text-transform: uppercase; margin: 0 0 10px 0; color: #333; letter-spacing: 0.5px; }
    p { font-size: 13px; color: #555; margin: 0 0 24px 0; font-weight: 500; line-height: 1.4; }

    .btn-blue { color: var(--ion-color-primary); }
    .btn-red { color: var(--ion-color-danger); }
  `]
})
export class CameraPermissionPopoverComponent {
  private popoverCtrl = inject(PopoverController);

  public confirm() { this.popoverCtrl.dismiss(true); }
  public cancel() { this.popoverCtrl.dismiss(false); }
}