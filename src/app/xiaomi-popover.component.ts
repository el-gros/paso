import { Component } from '@angular/core';
import { PopoverController } from '@ionic/angular';
import { IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';


@Component({
  selector: 'app-xiaomi-popover',
  imports: [
    IonicModule, CommonModule
  ],
  template: `
    <ion-content class="ion-padding">
      <div style="display: flex; align-items: center; margin-bottom: 10px;">
        <ion-icon name="warning" color="warning" style="font-size: 24px; margin-right: 10px;"></ion-icon>
        <h4 style="margin: 0;">Optimización Xiaomi</h4>
      </div>
      
      <p style="font-size: 0.9em; color: #666;">
        Para que el GPS no se corte al bloquear la pantalla, por favor activa:
      </p>
      
      <ion-list lines="none">
        <ion-item style="--min-height: 30px;">
          <ion-icon name="checkmark-circle" slot="start" color="success"></ion-icon>
          <ion-label style="font-size: 0.85em;">Inicio Automático</ion-label>
        </ion-item>
        <ion-item style="--min-height: 30px;">
          <ion-icon name="checkmark-circle" slot="start" color="success"></ion-icon>
          <ion-label style="font-size: 0.85em;">Batería: Sin Restricciones</ion-label>
        </ion-item>
      </ion-list>

      <ion-button expand="block" size="small" (click)="confirmar()" style="margin-top: 10px;">
        Configurar ahora
      </ion-button>
    </ion-content>
  `
})
export class XiaomiPopoverComponent {
  constructor(private popoverCtrl: PopoverController) {}

  confirmar() {
    this.popoverCtrl.dismiss(true);
  }
}