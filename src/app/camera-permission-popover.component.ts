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

        <div class="actions">
          <button type="button" class="nav-item-btn blue-pill ion-activatable" (click)="confirm()">
            <ion-icon name="checkmark-outline"></ion-icon>
            <span>{{ 'CAMERA_PERMISSION.OK' | translate }}</span>
            <ion-ripple-effect></ion-ripple-effect>
          </button>
          
          <button type="button" class="nav-item-btn red-pill ion-activatable" (click)="cancel()">
            <ion-icon name="close-outline"></ion-icon>
            <span>{{ 'CAMERA_PERMISSION.CANCEL' | translate }}</span>
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
      padding: 24px 20px;
      text-align: center;
    }

    .icon-container {
      display: flex;
      justify-content: center;
      margin-bottom: 10px;
      
      ion-icon {
        font-size: 42px;
        color: var(--ion-color-primary, #3880ff);
      }
    }

    h2 {
      font-size: 16px;
      font-weight: 800;
      text-transform: uppercase;
      margin: 0 0 10px 0;
      color: #333;
      letter-spacing: 0.5px;
    }

    p {
      font-size: 13px;
      color: #555;
      margin: 0 0 24px 0;
      font-weight: 500;
      line-height: 1.4;
    }

    .actions {
      display: flex;
      justify-content: center;
      gap: 16px;
    }

    /* 🚀 Añadido position: relative y overflow: hidden para que el Ripple no se salga */
    .nav-item-btn {
      position: relative;
      overflow: hidden;
      flex: 1;
      height: 65px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      border: none;
      border-radius: 20px;
      background: white;
      box-shadow: 0 4px 10px rgba(0,0,0,0.05);
      cursor: pointer;
      transition: transform 0.1s;
      
      /* pointer-events: none evita que el tap lo bloqueen el texto o el icono */
      ion-icon { font-size: 26px; margin-bottom: 4px; pointer-events: none; }
      span { margin: 0; font-size: 10px; font-weight: 800; text-transform: uppercase; pointer-events: none; }
      
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

  public confirm() {
    this.popoverCtrl.dismiss(true);
  }

  public cancel() {
    this.popoverCtrl.dismiss(false);
  }
}