import { Component, Input, OnInit, inject } from '@angular/core';
import { PopoverController, IonicModule } from '@ionic/angular';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-battery-popover',
  standalone: true,
  imports: [IonicModule, TranslateModule],
  template: `
    <ion-content scrollY="false" class="ion-no-padding">
      <div class="local-glass-island">
        
        <div class="popover-header">
          <div class="icon-circle">
            <ion-icon name="battery-dead" color="danger"></ion-icon>
          </div>
          <div class="header-text">
            <h2>{{ title | translate }}</h2>
            <span class="brand-tag">{{ brand }}</span>
          </div>
        </div>

        <p class="message">
          {{ 'BATTERY.GENERIC_MSG' | translate }}
        </p>

        <div class="steps-container">
          @for (step of steps; track $index) {
            <div class="step-item">
              <ion-icon name="chevron-forward-outline" color="primary"></ion-icon>
              <p>{{ step | translate }}</p>
            </div>
          }
        </div>

        <div class="popover-button-grid">
          <button class="popover-btn btn-blue" (click)="confirmar()">
            <ion-icon name="settings"></ion-icon>
            <span>{{ 'BATTERY.CONFIRM' | translate }}</span>
          </button>
          <button class="popover-btn btn-gray" (click)="cerrar()">
            <span>{{ 'BATTERY.CANCEL' | translate }}</span>
          </button>
        </div>

      </div>
    </ion-content>
  `,
  styles: [`
    .popover-header { display: flex; align-items: center; gap: 15px; margin-bottom: 18px; }
    .icon-circle { background: rgba(235, 68, 90, 0.1); padding: 10px; border-radius: 15px; }
    .icon-circle ion-icon { font-size: 32px; display: block; }
    
    .header-text h2 { margin: 0; font-weight: 800; font-size: 1.1rem; color: #1a1a1a; text-transform: uppercase; }
    .brand-tag { font-size: 0.7rem; font-weight: 700; color: var(--ion-color-medium); text-transform: uppercase; letter-spacing: 1px; }

    .message { font-size: 0.9rem; color: #555; line-height: 1.5; margin-bottom: 20px; }
    
    .steps-container { background: rgba(0, 0, 0, 0.03); border-radius: 20px; padding: 15px; margin-bottom: 24px; }
    .step-item { display: flex; align-items: flex-start; gap: 10px; margin-bottom: 12px; }
    .step-item p { margin: 0; font-size: 0.85rem; font-weight: 600; color: #333; }
    
    /* Adaptación de colores globales */
    .btn-blue { color: var(--ion-color-primary); }
    .btn-gray { color: var(--ion-color-medium); font-size: 12px; }
  `]
})
export class BatteryPopoverComponent implements OnInit {
  @Input() brand: string = 'generic';
  public title: string = '';
  public steps: string[] = [];

  private popoverCtrl = inject(PopoverController);

  ngOnInit() {
    this.configureContent();
  }

  private configureContent() {
    const brandNorm = (this.brand || 'generic').toLowerCase().trim();
    switch (brandNorm) {
      case 'xiaomi': case 'redmi': case 'poco':
        this.title = 'BATTERY.BRANDS.XIAOMI';
        this.steps = ['BATTERY.STEPS.AUTO_START', 'BATTERY.STEPS.NO_RESTRICTIONS'];
        break;
      case 'samsung':
        this.title = 'BATTERY.BRANDS.SAMSUNG';
        this.steps = ['BATTERY.STEPS.UNRESTRICTED', 'BATTERY.STEPS.INACTIVITY'];
        break;
      case 'huawei': case 'honor':
        this.title = 'BATTERY.BRANDS.HUAWEI';
        this.steps = ['BATTERY.STEPS.HUAWEI_MANAGE', 'BATTERY.STEPS.HUAWEI_AUTO', 'BATTERY.STEPS.BACKGROUND'];
        break;
      case 'oneplus': case 'oppo': case 'realme': case 'vivo':
        this.title = 'BATTERY.BRANDS.OPPO';
        this.steps = ['BATTERY.STEPS.ALLOW_BG', 'BATTERY.STEPS.AUTO_OPT'];
        break;
      case 'google': case 'pixel': case 'motorola':
        this.title = 'BATTERY.BRANDS.PIXEL';
        this.steps = ['BATTERY.STEPS.UNRESTRICTED'];
        break;
      default:
        this.title = 'BATTERY.BRANDS.DEFAULT';
        this.steps = ['BATTERY.STEPS.GENERIC_UNRESTRICTED', 'BATTERY.STEPS.BACKGROUND'];
        break;
    }
  }

  public confirmar() { this.popoverCtrl.dismiss({ action: 'settings' }); }
  public cerrar() { this.popoverCtrl.dismiss({ action: 'cancel' }); }
}