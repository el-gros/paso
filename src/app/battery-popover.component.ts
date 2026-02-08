import { Component, Input, OnInit, inject } from '@angular/core';
import { PopoverController, IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-battery-popover',
  standalone: true,
  imports: [IonicModule, CommonModule, TranslateModule],
  template: `
    <ion-content scrollY="false">
      <div class="popover-island">
        <div class="header">
          <div class="icon-circle">
            <ion-icon name="battery-dead" color="danger"></ion-icon>
          </div>
          <div class="header-text">
            <h4>{{ title | translate }}</h4>
            <span class="brand-tag">{{ brand }}</span>
          </div>
        </div>
        
        <p class="message">
          {{ 'BATTERY.GENERIC_MSG' | translate }}
        </p>
        
        <div class="steps-container">
          @for (step of steps; track step) {
            <div class="step-item">
              <ion-icon name="chevron-forward-circle-sharp" color="primary"></ion-icon>
              <p>{{ step | translate }}</p>
            </div>
          }
        </div>

        <div class="actions">
          <button class="btn-main" (click)="confirmar()">
            <ion-icon name="settings-sharp" slot="start"></ion-icon>
            {{ 'BATTERY.CONFIRM' | translate }}
          </button>
          <button class="btn-cancel" (click)="cerrar()">
            {{ 'BATTERY.CANCEL' | translate }}
          </button>
        </div>
      </div>
    </ion-content>
  `,
  styles: [`
    ion-content { --background: transparent; }

    .popover-island {
      // Las variables que quieras "personalizar" para este caso concreto
      --glass-bg: rgba(255, 255, 255, 0.96);
      --glass-blur: 16px;
      --glass-shadow: 0 12px 40px rgba(0, 0, 0, 0.2);

      // La geometría única de este componente
      margin: 10px;
      padding: 24px 20px;
    }

    .header {
      display: flex;
      align-items: center;
      gap: 15px;
      margin-bottom: 18px;
    }

    .icon-circle {
      background: rgba(235, 68, 90, 0.1);
      padding: 10px;
      border-radius: 15px;
      ion-icon { font-size: 32px; display: block; }
    }

    .header-text {
      h4 { 
        margin: 0; 
        font-weight: 800; 
        font-size: 1.1rem; 
        color: #1a1a1a;
        text-transform: uppercase;
      }
      .brand-tag {
        font-size: 0.7rem;
        font-weight: 700;
        color: var(--ion-color-medium);
        text-transform: uppercase;
        letter-spacing: 1px;
      }
    }

    .message {
      font-size: 0.9rem;
      color: #555;
      line-height: 1.5;
      margin-bottom: 20px;
    }

    .steps-container {
      background: rgba(0, 0, 0, 0.03);
      border-radius: 20px;
      padding: 15px;
      margin-bottom: 24px;
      border: 1px solid rgba(0, 0, 0, 0.02);
    }

    .step-item {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      margin-bottom: 12px;
      &:last-child { margin-bottom: 0; }
      
      ion-icon { font-size: 18px; margin-top: 2px; }
      p { margin: 0; font-size: 0.85rem; font-weight: 600; color: #333; }
    }

    .actions {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .btn-main {
      background: var(--ion-color-primary);
      color: white;
      border: none;
      padding: 16px;
      border-radius: 18px;
      font-weight: 700;
      text-transform: uppercase;
      font-size: 0.85rem;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      box-shadow: 0 4px 15px rgba(var(--ion-color-primary-rgb), 0.3);
      &:active { transform: scale(0.96); }
    }

    .btn-cancel {
      background: transparent;
      color: var(--ion-color-medium);
      border: none;
      padding: 10px;
      font-weight: 700;
      text-transform: uppercase;
      font-size: 0.75rem;
      &:active { opacity: 0.6; }
    }
  `]
})
export class BatteryPopoverComponent implements OnInit {
  @Input() brand: string = 'generic';

  title: string = '';
  message: string = 'BATTERY.GENERIC_MSG';
  steps: string[] = [];

  private popoverCtrl = inject(PopoverController);

  ngOnInit() {
    this.configureContent();
  }

  configureContent() {
    const brandNorm = (this.brand || 'generic').toLowerCase().trim();

    switch (brandNorm) {
      case 'xiaomi':
      case 'redmi':
      case 'poco':
        this.title = 'BATTERY.BRANDS.XIAOMI';
        this.steps = ['BATTERY.STEPS.AUTO_START', 'BATTERY.STEPS.NO_RESTRICTIONS'];
        break;
      case 'samsung':
        this.title = 'BATTERY.BRANDS.SAMSUNG';
        this.steps = ['BATTERY.STEPS.UNRESTRICTED', 'BATTERY.STEPS.INACTIVITY'];
        break;
      case 'huawei':
      case 'honor':
        this.title = 'BATTERY.BRANDS.HUAWEI';
        this.steps = ['BATTERY.STEPS.HUAWEI_MANAGE', 'BATTERY.STEPS.HUAWEI_AUTO', 'BATTERY.STEPS.BACKGROUND'];
        break;
      case 'oneplus':
      case 'oppo':
      case 'realme':
      case 'vivo':
        this.title = 'BATTERY.BRANDS.OPPO';
        this.steps = ['BATTERY.STEPS.ALLOW_BG', 'BATTERY.STEPS.AUTO_OPT'];
        break;
      case 'google':
      case 'pixel':
      case 'motorola':
        this.title = 'BATTERY.BRANDS.PIXEL';
        this.steps = ['BATTERY.STEPS.UNRESTRICTED'];
        break;
      default:
        this.title = 'BATTERY.BRANDS.DEFAULT';
        this.steps = ['BATTERY.STEPS.GENERIC_UNRESTRICTED', 'BATTERY.STEPS.BACKGROUND'];
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