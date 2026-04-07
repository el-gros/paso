import { Component, Input, inject } from '@angular/core';
import { PopoverController, IonicModule } from '@ionic/angular';

import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-color-popover',
  standalone: true,
  imports: [IonicModule, TranslateModule],
  template: `
    <ion-content class="ion-no-padding">
      <div class="popover-island">
        <ion-list lines="none">
          @for (color of colors; track $index) {
          <ion-item
            (click)="selectColor(color)"
            [class.selected-item]="color === currentColor"
            button
            detail="false"
          >
            <ion-label class="color-name">{{
              'COLORS.' + color | translate
            }}</ion-label>

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
            >
            </ion-icon>
            }
          </ion-item>
          }
        </ion-list>
      </div>
    </ion-content>
  `,
  styles: [
    `
      ion-content {
        --background: transparent;
      }

      /* --- ESTILO ISLA FLOTANTE --- */
      .popover-island {
        background: rgba(255, 255, 255, 0.85);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        margin: 10px;
        border-radius: 20px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
        overflow: hidden;
        border: 1px solid rgba(255, 255, 255, 0.4);
      }

      ion-list {
        background: transparent;
        padding: 6px; /* Más compacto */
      }

      ion-item {
        --padding-start: 14px;
        --background: transparent;
        --color: #333;
        --border-radius: 12px;
        --min-height: 40px; /* 🚀 Reduce la altura de cada ítem */

        margin-bottom: 2px; /* 🚀 Menos espacio entre ítems */
        font-weight: 500;
        transition: all 0.2s ease;

        &::part(native) {
          padding-right: 14px;
          min-height: 40px; /* Obliga a Ionic a encoger el ítem interno */
        }
      }

      /* 🚀 Color activo con más sombreado y contraste */
      .selected-item {
        --background: rgba(0, 0, 0, 0.08); /* Sombreado más oscuro */
        font-weight: 700;
        box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.1); /* Efecto de "hundido" */
      }

      .color-name {
        font-size: 0.95rem; /* Un pelín más pequeño para encajar mejor */
        text-transform: capitalize;
        margin: 0;
      }

      .color-track-preview {
        width: 32px;
        height: 10px;
        border-radius: 5px;
        margin-left: 12px;
        box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.3); /* Sombra interna más dura */
      }

      .check-icon {
        font-size: 20px; /* Icono ligeramente más pequeño */
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
