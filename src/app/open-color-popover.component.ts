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
          @for (color of colors; track color) {
            <ion-item 
              (click)="selectColor(color)"
              [class.selected-item]="color === currentColor"
              button 
              detail="false">
              <ion-label>{{ 'COLORS.' + color | translate }}</ion-label>
              <div class="color-track-preview" [style.background-color]="color"></div>
              
              @if (color === currentColor) {
                <ion-icon 
                  name="checkmark-sharp" 
                  slot="end" 
                  color="primary">
                </ion-icon>
              }
            </ion-item>
          }
        </ion-list>
      </div>
    </ion-content>
  `,
  styles: [`
    ion-content { 
      --background: transparent; 
    }

    .popover-island {
      background: rgba(255, 255, 255, 0.96);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border-radius: 24px;
      border: 1px solid rgba(255, 255, 255, 0.5);
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
      margin: 8px;
      overflow: hidden;
    }

    ion-list { 
      background: transparent; 
      padding: 8px;
    }

    ion-item {
      --padding-start: 12px;
      --background: transparent;
      --color: #444;
      --border-radius: 14px;
      margin-bottom: 4px;
      font-weight: 600;
      
      &::part(native) {
        padding-right: 12px;
      }
    }

    .selected-item {
      --background: rgba(var(--ion-color-primary-rgb), 0.08);
      --color: var(--ion-color-primary);
    }

    /* Muestra de color estilo "Ruta" */
    .color-track-preview {
      width: 45px;
      height: 6px;
      border-radius: 3px;
      margin-left: 10px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }

    ion-label {
      font-size: 0.9rem;
      letter-spacing: 0.3px;
    }

    ion-icon {
      font-size: 20px;
      margin: 0;
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