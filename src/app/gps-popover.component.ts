import { Component, inject } from '@angular/core';
import { PopoverController, IonicModule } from '@ionic/angular';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-gps-popover',
  standalone: true,
  imports: [IonicModule, TranslateModule],
  template: `
    <ion-content scrollY="false" class="ion-no-padding">
      <div class="local-glass-island popover-island">
        
        <div class="icon-container">
          <ion-icon name="satellite-outline"></ion-icon>
        </div>
        
        <h2>{{ 'LOCATION.GPS_TITLE' | translate }}</h2>
        
        <p>{{ 'LOCATION.CHECK' | translate }}</p>

        <div class="actions">
          <button type="button" class="nav-item-btn blue-pill ion-activatable" (click)="dismiss()">
            <ion-icon name="checkmark-sharp"></ion-icon>
            <span>{{ 'LOCATION.OK_BUTTON' | translate }}</span>
            <ion-ripple-effect></ion-ripple-effect>
          </button>
        </div>

      </div>
    </ion-content>
  `,
  styles: [`
    ion-content { 
      --background: transparent; 
    }
    
    .local-glass-island {
      text-align: center;
      padding: 30px 20px 24px; /* Un poco más de aire por arriba */
      background: rgba(255, 255, 255, 0.96); /* Fallback por si popover-island falla */
      border-radius: 30px;
    }

    .icon-container {
      display: flex;
      justify-content: center;
      margin-bottom: 12px;
      
      ion-icon {
        font-size: 48px;
        color: var(--ion-color-danger, #eb445a);
      }
    }

    h2 {
      font-size: 15px;
      font-weight: 800;
      text-transform: uppercase;
      margin: 0 0 12px 0;
      color: #333;
      letter-spacing: 0.8px;
    }

    p {
      font-size: 13px;
      color: #555;
      margin: 0 0 28px 0;
      font-weight: 600;
      line-height: 1.5;
      padding: 0 10px;
    }

    .actions {
      display: flex;
      justify-content: center;
    }

    /* 🚀 Botón optimizado con position relative para el Ripple */
    .nav-item-btn {
      position: relative;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      border: none;
      border-radius: 20px;
      cursor: pointer;
      transition: transform 0.1s;
      box-shadow: 0 4px 10px rgba(0,0,0,0.05);

      /* pointer-events: none evita falsos clics en los elementos internos */
      ion-icon { font-size: 26px; margin-bottom: 4px; pointer-events: none; }
      span { margin: 0; font-size: 10px; font-weight: 800; text-transform: uppercase; pointer-events: none; }
      
      &:active { transform: scale(0.92); }
    }

    .blue-pill {
      background: rgba(255, 255, 255, 0.95) !important;
      border: 1px solid rgba(56, 128, 255, 0.3) !important;
      min-width: 120px;
      height: 70px;
      
      ion-icon, span { 
        color: var(--ion-color-primary, #3880ff) !important; 
      }
    }
  `]
})
export class GpsPopoverComponent {
  private popoverCtrl = inject(PopoverController);
  
  public dismiss() { 
    this.popoverCtrl.dismiss(); 
  }
}