import { Component, Input, OnInit } from '@angular/core';
import { PopoverController, IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';


@Component({
  selector: 'app-battery-popover',
  standalone: true,
  imports: [IonicModule, CommonModule],
  template: `
    <ion-content class="ion-padding">
      <div style="display: flex; align-items: center; margin-bottom: 12px;">
        <ion-icon name="battery-dead" color="danger" style="font-size: 28px; margin-right: 10px;"></ion-icon>
        <h4 style="margin: 0; font-weight: bold;">{{ title }}</h4>
      </div>
      
      <p style="font-size: 0.95em; color: var(--ion-color-step-700);">
        {{ message }}
      </p>
      
      <ion-list lines="none" style="background: transparent;">
        <ion-item *ngFor="let step of steps" style="--min-height: 35px; --background: transparent;">
          <ion-icon name="settings-outline" slot="start" color="primary" style="font-size: 18px;"></ion-icon>
          <ion-label class="ion-text-wrap" style="font-size: 0.85em;">{{ step }}</ion-label>
        </ion-item>
      </ion-list>

      <div style="margin-top: 15px;">
        <ion-button expand="block" (click)="confirmar()">
          Abrir Ajustes
        </ion-button>
        <ion-button expand="block" fill="clear" size="small" color="medium" (click)="cerrar()">
          Quizás luego
        </ion-button>
      </div>
    </ion-content>
  `
})
export class BatteryPopoverComponent implements OnInit {
  @Input() brand: string = 'generic';

  title: string = 'Ajuste de Batería';
  message: string = 'Para asegurar que el seguimiento GPS no se detenga, ajusta la configuración de batería:';
  steps: string[] = [];

  constructor(private popoverCtrl: PopoverController) {}

  ngOnInit() {
    this.brand = (this.brand || 'generic').toLowerCase().trim();
    this.configureContent();
  }

  configureContent() {
    // Limpiamos la marca para evitar errores por espacios o mayúsculas
    const brandNorm = (this.brand || 'generic').toLowerCase().trim();

    switch (brandNorm) {
      case 'xiaomi':
      case 'redmi':
      case 'poco':
        this.title = 'Optimización Xiaomi';
        this.steps = [
          'Activar "Inicio Automático"',
          'Ahorro de batería: "Sin restricciones"'
        ];
        break;

      case 'samsung':
        this.title = 'Ajuste de Samsung';
        this.steps = [
          'Batería: Seleccionar "No restringido"',
          'Desactivar "Poner en inactividad profunda"'
        ];
        break;

      case 'huawei':
      case 'honor':
        this.title = 'Ajuste de Huawei';
        this.steps = [
          'Ajustes > Aplicaciones > Inicio',
          'Desactivar "Gestionar automáticamente"',
          'Asegurar "Actividad en segundo plano" activo'
        ];
        break;

      case 'oneplus':
      case 'oppo':
      case 'realme':
      case 'vivo':
        this.title = 'Gestión de Energía';
        this.steps = [
          'Uso de batería: "Permitir actividad segundo plano"',
          'Desactivar "Optimización automática"'
        ];
        break;

      case 'google':
      case 'pixel':
      case 'motorola':
        this.title = 'Uso de Batería';
        this.steps = [
          'Uso de la batería: "Sin restringir"'
        ];
        break;

      default:
        this.title = 'Ahorro de Energía';
        this.message = 'Para evitar que el GPS se detenga al apagar la pantalla:';
        this.steps = [
          'Configurar la batería como "Sin optimizar"',
          'Permitir ejecución en segundo plano'
        ];
        break;
    }
  }

  confirmar() {
    this.popoverCtrl.dismiss({ action: 'settings' });
  }

  cerrar() {
    this.popoverCtrl.dismiss({ action: 'cancel' });
  }
}