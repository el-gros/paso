import { Component, Input } from '@angular/core';
import { IonicModule, PopoverController } from '@ionic/angular';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  standalone: true,
  selector: 'app-import-status-popover',
  imports: [IonicModule, TranslateModule],
  template: `
    <ion-content scrollY="false" class="ion-no-padding">
      <div class="local-glass-island confirm-box">
        
        <div class="icon-container">
          <ion-icon [name]="icon" [color]="color"></ion-icon>
        </div>

        <p class="confirm-title">{{ title | translate }}</p>
        <p class="status-message">{{ message | translate }}</p>

        <div class="popover-button-grid">
          <button class="popover-btn btn-blue" (click)="dismiss()">
            <ion-icon name="checkmark-outline"></ion-icon>
            <span>OK</span>
          </button>
        </div>
        
      </div>
    </ion-content>
  `,
  styles: [`
    .confirm-box { padding: 24px; text-align: center; }
    .confirm-title { margin: 0 0 10px 0; font-size: 14px; font-weight: 800; text-transform: uppercase; color: #111; }
    .status-message { font-size: 14px; color: #666; margin-bottom: 20px; line-height: 1.4; }
    
    .icon-container { margin-bottom: 15px; }
    .icon-container ion-icon { font-size: 48px; }

    .btn-blue { color: var(--ion-color-primary); }
  `]
})
export class ImportStatusPopover {
  @Input() title: string = '';
  @Input() message: string = '';
  @Input() icon: string = 'alert-outline';
  @Input() color: string = 'danger';

  constructor(private popoverCtrl: PopoverController) {}
  dismiss() { this.popoverCtrl.dismiss(); }
}