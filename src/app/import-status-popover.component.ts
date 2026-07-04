import { Component, Input } from '@angular/core';
import { IonicModule, PopoverController } from '@ionic/angular';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  standalone: true,
  selector: 'app-import-status-popover',
  template: `
    <div class="popover-island confirm-box" style="--width: 300px">
      <ion-icon [name]="icon" [color]="color" style="font-size: 48px; margin-bottom: 10px;"></ion-icon>
      <p class="confirm-title">{{ title | translate }}</p>
      <p style="font-size: 14px; margin-bottom: 20px;">{{ message | translate }}</p>
      <button class="glass-pill-btn green-pill" (click)="dismiss()">
        <ion-icon name="checkmark-outline"></ion-icon>
        <span>OK</span>
      </button>
    </div>
  `,
  imports: [IonicModule, TranslateModule]
})
export class ImportStatusPopover {
  @Input() title: string = '';
  @Input() message: string = '';
  @Input() icon: string = 'alert-outline';
  @Input() color: string = 'danger';

  constructor(private popoverCtrl: PopoverController) {}
  dismiss() { this.popoverCtrl.dismiss(); }
}