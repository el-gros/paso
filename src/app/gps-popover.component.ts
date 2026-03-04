import { Component, inject } from '@angular/core';
import { PopoverController, IonicModule } from '@ionic/angular';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-gps-popover',
  standalone: true,
  imports: [IonicModule, TranslateModule],
  template: `
    <div class="local-glass-island popover-island" style="text-align: center;">
      
      <div style="display: flex; justify-content: center; margin-bottom: 12px;">
        <ion-icon name="satellite-outline" style="font-size: 48px; color: var(--ion-color-danger, #eb445a);"></ion-icon>
      </div>
      
      <h2 style="font-size: 15px; font-weight: 800; text-transform: uppercase; margin-bottom: 12px; color: #333; letter-spacing: 0.8px;">
        {{ 'LOCATION.GPS_TITLE' | translate }}
      </h2>
      
      <p style="font-size: 13px; color: #555; margin-bottom: 28px; font-weight: 600; line-height: 1.5; padding: 0 10px;">
        {{ 'LOCATION.CHECK' | translate }}
      </p>

      <div class="button-grid horizontal" style="justify-content: center;">
        <button class="nav-item-btn blue-pill" (click)="dismiss()">
          <ion-icon name="checkmark-sharp"></ion-icon>
          <p>{{ 'LOCATION.OK_BUTTON' | translate }}</p>
        </button>
      </div>

    </div>
  `,
  styles: [`
    /* Usamos tu clase global .glass-panel/.popover-island
      Solo añadimos aquí lo específico de este componente que no está en global.scss
    */
    .local-glass-island {
      padding: 30px 20px 24px; /* Un poco más de aire por arriba */
    }

    .blue-pill {
      background: rgba(255, 255, 255, 0.95) !important;
      border: 1px solid rgba(56, 128, 255, 0.3) !important;
      min-width: 120px;
      height: 70px;
      
      ion-icon, p { 
        color: var(--ion-color-primary, #3880ff) !important; 
      }
    }
  `]
})
export class GpsPopoverComponent {
  private popoverCtrl = inject(PopoverController);
  dismiss() { this.popoverCtrl.dismiss(); }
}