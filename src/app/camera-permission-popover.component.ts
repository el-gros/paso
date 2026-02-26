import { Component, inject } from '@angular/core';
import { PopoverController, IonicModule } from '@ionic/angular';
import { TranslateModule } from '@ngx-translate/core'; // <-- Añadido el módulo de traducción

@Component({
  selector: 'app-camera-permission-popover',
  standalone: true,
  imports: [IonicModule, TranslateModule], // <-- Añadido aquí también
  template: `
    <ion-content scrollY="false" class="ion-no-padding">
      <div class="local-glass-island" style="text-align: center;">
        
        <div style="display: flex; justify-content: center; margin-bottom: 10px;">
          <ion-icon name="camera-outline" style="font-size: 42px; color: var(--ion-color-primary, #3880ff);"></ion-icon>
        </div>
        
        <h2 style="font-size: 16px; font-weight: 800; text-transform: uppercase; margin-bottom: 10px; color: #333; letter-spacing: 0.5px;">
          {{ 'CAMERA_PERMISSION.HEADER' | translate }}
        </h2>
        
        <p style="font-size: 13px; color: #555; margin-bottom: 24px; font-weight: 500; line-height: 1.4;">
          {{ 'CAMERA_PERMISSION.MESSAGE' | translate }}
        </p>

        <div style="display: flex; justify-content: center; gap: 16px;">
          <button class="nav-item-btn blue-pill" (click)="confirm()" style="flex: 1; height: 65px;">
            <ion-icon name="checkmark-outline"></ion-icon>
            <p>{{ 'CAMERA_PERMISSION.OK' | translate }}</p>
          </button>
          
          <button class="nav-item-btn red-pill" (click)="cancel()" style="flex: 1; height: 65px;">
            <ion-icon name="close-outline"></ion-icon>
            <p>{{ 'CAMERA_PERMISSION.CANCEL' | translate }}</p>
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
      padding: 24px 20px;
    }

    .nav-item-btn {
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      border: none; border-radius: 20px; background: white;
      box-shadow: 0 4px 10px rgba(0,0,0,0.05); cursor: pointer; transition: transform 0.1s;
      
      ion-icon { font-size: 26px; margin-bottom: 4px; }
      p { margin: 0; font-size: 10px; font-weight: 800; text-transform: uppercase; }
      
      &:active { transform: scale(0.92); }
    }

    .blue-pill {
      color: var(--ion-color-primary, #3880ff);
      border: 1px solid rgba(56, 128, 255, 0.2);
    }
    
    .red-pill {
      color: var(--ion-color-danger, #eb445a);
      border: 1px solid rgba(235, 68, 90, 0.2);
    }
  `]
})
export class CameraPermissionPopoverComponent {
  private popoverCtrl = inject(PopoverController);

  confirm() {
    this.popoverCtrl.dismiss(true);
  }

  cancel() {
    this.popoverCtrl.dismiss(false);
  }
}