import { Component, Input, inject } from '@angular/core';
import { IonicModule, PopoverController } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-color-popover',
  standalone: true,
  imports: [IonicModule, CommonModule, TranslateModule],
  template: `
    <ion-content scrollY="false">
      <div class="popover-island">
        <ion-list lines="none">
          <ion-item 
            *ngFor="let color of colors" 
            (click)="selectColor(color)"
            [class.selected-item]="color === currentColor"
            button 
            detail="false">
            <ion-label>{{ 'COLORS.' + color | translate }}</ion-label>
            <div class="color-preview" [style.background-color]="color"></div>
            <ion-icon 
              *ngIf="color === currentColor" 
              name="checkmark-circle" 
              slot="end" 
              color="primary">
            </ion-icon>
          </ion-item>
        </ion-list>
      </div>
    </ion-content>
  `,
  styles: [`
    ion-content { 
      --background: transparent; 
    }

    .popover-island {
      background: rgba(255, 255, 255, 0.95);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border-radius: 20px;
      border: 1px solid rgba(255, 255, 255, 0.4);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
      margin: 8px;
      overflow: hidden;
    }

    ion-list { 
      background: transparent; 
      padding: 4px 0;
    }

    ion-item {
      --padding-start: 16px;
      --background: transparent;
      --color: #333;
      font-weight: 500;
      margin: 2px 8px;
      border-radius: 12px;
    }

    .selected-item {
      --background: rgba(var(--ion-color-primary-rgb), 0.1);
      --color: var(--ion-color-primary);
    }

    .color-preview {
      width: 40px;
      height: 8px;
      border-radius: 4px;
      margin-left: 12px;
      box-shadow: inset 0 0 0 1px rgba(0,0,0,0.1);
    }

    ion-label {
      font-size: 14px;
      text-transform: capitalize;
    }
  `]
})
export class ColorPopoverComponent {
  @Input() colors: string[] = [];
  @Input() currentColor!: string;
  @Input() onSelect!: (color: string) => void;

  private popoverCtrl = inject(PopoverController);

  selectColor(color: string) {
    if (this.onSelect) {
      this.onSelect(color);
    }
    this.popoverCtrl.dismiss(color);
  }
}