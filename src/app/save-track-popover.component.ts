import { Component, Input, OnInit } from '@angular/core';
import { PopoverController, IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms'; 
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-save-track-popover',
  standalone: true,
  imports: [
    CommonModule, 
    FormsModule, 
    IonicModule,
    TranslateModule
  ],
  template: `
    <ion-content scrollY="false">
      <div class="popover-island">

        <div class="form-container">
          <div class="input-group">
            <ion-label class="custom-label">{{ 'EDIT_MODAL.NAME' | translate }}</ion-label>
            <ion-textarea 
              [(ngModel)]="modalEdit.name" 
              rows="2" 
              class="custom-textarea"
              placeholder="...">
            </ion-textarea>
          </div>
          
          <div class="input-group">
            <ion-label class="custom-label">{{ 'EDIT_MODAL.DESCRIPTION' | translate }}</ion-label>
            <ion-textarea 
              [(ngModel)]="modalEdit.description" 
              rows="3" 
              class="custom-textarea"
              placeholder="...">
            </ion-textarea>
          </div>
        </div>

        <div class="button-grid horizontal">
          <button class="nav-item-btn green-pill" (click)="confirm()">
            <ion-icon name="checkmark-sharp"></ion-icon>
            <p>OK</p>
          </button>
          <button class="nav-item-btn red-pill" (click)="cancel()">
            <ion-icon name="close-sharp"></ion-icon>
            <p>{{ 'EDIT_MODAL.CANCEL' | translate }}</p>
          </button>
        </div>
      </div>
    </ion-content>
  `,
styles: [`
    ion-content { 
      --background: transparent;
      --padding-top: 0;
    }

    .popover-island {
      /* Sincronizado con el resto: 0.9 de opacidad y 12px blur */
      background: rgba(255, 255, 255, 0.9) !important;
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border-radius: 28px;
      padding: 24px 16px;
      border: 1px solid rgba(255, 255, 255, 0.5);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
      margin: 8px;
    }

    /* --- FORMULARIO GLASS --- */
    .form-container {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .input-group {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .custom-label {
      font-size: 10px;
      font-weight: 800;
      text-transform: uppercase;
      color: var(--ion-color-primary);
      margin-left: 12px;
      letter-spacing: 0.5px;
    }

    .custom-textarea {
      /* Estilo similar a los campos de búsqueda anteriores */
      background: rgba(0, 0, 0, 0.05);
      border-radius: 16px;
      --padding-start: 14px;
      --padding-end: 14px;
      --padding-top: 12px;
      --padding-bottom: 12px;
      color: #333;
      font-size: 14px;
      transition: all 0.3s ease;
      border: 1px solid transparent;
      
      /* Efecto de foco sutil */
      &:focus-within {
        background: rgba(var(--ion-color-primary-rgb), 0.05);
        border: 1px solid rgba(var(--ion-color-primary-rgb), 0.2);
      }
    }

    /* --- BOTONES VERTICALES --- */
    .button-grid.horizontal {
      display: flex;
      justify-content: center;
      gap: 45px;
      margin-top: 24px;
    }

    .nav-item-btn {
      background: transparent !important;
      border: none;
      display: flex !important;
      flex-direction: column !important;
      align-items: center !important;
      min-width: 65px;
      cursor: pointer;
      transition: transform 0.1s ease;

      ion-icon {
        /* Iconos de confirmación más grandes (32px) al no tener círculo */
        font-size: 32px;
        margin-bottom: 4px;
      }

      p {
        margin: 0;
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      &:active {
        transform: scale(0.92);
        opacity: 0.7;
      }
    }

    /* Estilo "Limpio" para OK / Cancel */
    .green-pill ion-icon, .green-pill p { color: #2dd36f !important; }
    .red-pill ion-icon, .red-pill p { color: #eb445a !important; }
  `]
})
export class SaveTrackPopover implements OnInit {
  @Input() modalEdit: any;
  @Input() edit: boolean | undefined;

  constructor(private popoverCtrl: PopoverController) {}

  ngOnInit() {
    this.modalEdit = { ...this.modalEdit };
  }

  cancel() {
    this.popoverCtrl.dismiss();
  }

  confirm() {
    this.popoverCtrl.dismiss({
      action: 'ok',
      ...this.modalEdit
    });
  }
}