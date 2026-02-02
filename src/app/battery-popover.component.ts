import { Component, Input, OnInit, inject } from '@angular/core';
import { PopoverController, IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

@Component({
  selector: 'app-battery-popover',
  standalone: true,
  imports: [IonicModule, CommonModule, TranslateModule],
  template: `
    <ion-content class="ion-padding">
      <div style="display: flex; align-items: center; margin-bottom: 12px;">
        <ion-icon name="battery-dead" color="danger" style="font-size: 28px; margin-right: 10px;"></ion-icon>
        <h4 style="margin: 0; font-weight: bold;">{{ title | translate }}</h4>
      </div>
      
      <p style="font-size: 0.95em; color: var(--ion-color-step-700);">
        {{ message | translate }}
      </p>
      
      <ion-list lines="none" style="background: transparent;">
        <ion-item *ngFor="let step of steps" style="--min-height: 35px; --background: transparent;">
          <ion-icon name="settings-outline" slot="start" color="primary" style="font-size: 18px;"></ion-icon>
          <ion-label class="ion-text-wrap" style="font-size: 0.85em;">{{ step | translate }}</ion-label>
        </ion-item>
      </ion-list>

      <div style="margin-top: 15px;">
        <ion-button expand="block" (click)="confirmar()">
          {{ 'BATTERY.CONFIRM' | translate }}
        </ion-button>
        <ion-button expand="block" fill="clear" size="small" color="medium" (click)="cerrar()">
          {{ 'BATTERY.CANCEL' | translate }}
        </ion-button>
      </div>
    </ion-content>
  `
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