import { Component, Input, inject } from '@angular/core';
import { PopoverController, IonicModule } from '@ionic/angular';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-color-popover',
  standalone: true,
  imports: [IonicModule, TranslateModule],
  template: `
    <ion-content scrollY="false" class="ion-no-padding">
      <div class="local-glass-island compact-island">
        <ion-list lines="none" class="popover-list">
          
          @for (color of colors; track $index) {
            <ion-item
              button
              class="action-item"
              [class.selected-item]="color === currentColor"
              (click)="selectColor(color)"
              detail="false"
            >
              <ion-label class="color-name">
                <strong>{{ 'COLORS.' + color | translate }}</strong>
              </ion-label>

              <div
                class="color-track-preview"
                [style.background-color]="color"
              ></div>

              @if (color === currentColor) {
                <ion-icon
                  name="checkmark-circle"
                  slot="end"
                  class="check-icon"
                  [style.color]="color"
                ></ion-icon>
              }
            </ion-item>
          }

        </ion-list>
      </div>
    </ion-content>
  `,
  styles: [
    `
      /* 🚀 Solo estilos exclusivos de este componente */
      
      .selected-item {
        --background: rgba(0, 0, 0, 0.08); /* Sombreado más oscuro */
        box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.1); /* Efecto de "hundido" */
      }

      .color-name {
        text-transform: capitalize; /* Respetamos tu capitalización */
      }

      .color-track-preview {
        width: 32px;
        height: 10px;
        border-radius: 5px;
        margin-left: 12px;
        box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.3); /* Sombra interna más dura */
      }

      .check-icon {
        font-size: 20px;
        margin: 0;
        filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.2));
      }
    `,
  ],
})
export class ColorPopoverComponent {
  // ==========================================================================
  // 1. INPUTS Y PROPIEDADES
  // ==========================================================================

  @Input() colors: string[] = [];
  @Input() currentColor!: string;

  private popoverCtrl = inject(PopoverController);

  // ==========================================================================
  // 2. ACCIONES (API PÚBLICA)
  // ==========================================================================

  public selectColor(color: string) {
    this.popoverCtrl.dismiss({ selectedColor: color });
  }
}