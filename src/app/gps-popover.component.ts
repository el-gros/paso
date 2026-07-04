import { Component, inject } from '@angular/core';
import { PopoverController, IonicModule } from '@ionic/angular';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-gps-popover',
  standalone: true,
  imports: [IonicModule, TranslateModule],
  template: `
    <ion-content scrollY="false" class="ion-no-padding">
      <div class="local-glass-island text-center-island">
        
        <div class="icon-container">
          <ion-icon name="satellite-outline"></ion-icon>
        </div>
        
        <h2>{{ 'LOCATION.GPS_TITLE' | translate }}</h2>
        
        <p>{{ 'LOCATION.CHECK' | translate }}</p>

        <div class="popover-button-grid">
          <button type="button" class="popover-btn btn-blue ion-activatable" (click)="dismiss()">
            <ion-icon name="checkmark-outline"></ion-icon>
            <span>{{ 'LOCATION.OK_BUTTON' | translate }}</span>
            <ion-ripple-effect></ion-ripple-effect>
          </button>
        </div>

      </div>
    </ion-content>
  `,
  styles: [`
    /* 1. Modificadores específicos para esta isla */
    .text-center-island {
      text-align: center;
      padding-top: 30px; /* Un poco más de aire por arriba, el resto lo hereda del global */
    }

    /* 2. Estilos únicos del contenido (icono y textos) */
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

    /* 3. Variante de color azul para el botón global */
    .btn-blue {
      border: 1px solid rgba(56, 128, 255, 0.3) !important;
      color: var(--ion-color-primary, #3880ff) !important;
    }
  `]
})
export class GpsPopoverComponent {

  private popoverCtrl = inject(PopoverController);
  
  public dismiss() { 
    this.popoverCtrl.dismiss(); 
  }
}