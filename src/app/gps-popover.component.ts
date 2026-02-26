import { Component, inject } from '@angular/core';
import { PopoverController, IonicModule } from '@ionic/angular';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-gps-popover',
  standalone: true,
  imports: [IonicModule, TranslateModule],
  template: `
    <ion-content scrollY="false" class="ion-no-padding">
      <div class="local-glass-island" style="text-align: center;">
        
        <div style="display: flex; justify-content: center; margin-bottom: 10px;">
          <ion-icon name="satellite-outline" style="font-size: 42px; color: var(--ion-color-danger, #eb445a);"></ion-icon>
        </div>
        
        <h2 style="font-size: 16px; font-weight: 800; text-transform: uppercase; margin-bottom: 10px; color: #333; letter-spacing: 0.5px;">
          GPS
        </h2>
        
        <p style="font-size: 13px; color: #555; margin-bottom: 24px; font-weight: 500; line-height: 1.4;">
          {{ 'LOCATION.CHECK' | translate }}
        </p>

        <div style="display: flex; justify-content: center;">
          <button class="nav-item-btn blue-pill" (click)="dismiss()" style="height: 65px; min-width: 120px;">
            <ion-icon name="checkmark-outline"></ion-icon>
            <p>OK</p>
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
      
      ion-icon { font-size: 28px; margin-bottom: 4px; }
      p { margin: 0; font-size: 11px; font-weight: 800; text-transform: uppercase; }
      
      &:active { transform: scale(0.92); }
    }

    .blue-pill {
      color: var(--ion-color-primary, #3880ff);
      border: 1px solid rgba(56, 128, 255, 0.2);
    }
  `]
})
export class GpsPopoverComponent {
  private popoverCtrl = inject(PopoverController);
  dismiss() { this.popoverCtrl.dismiss(); }
}