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
        <div class="popover-header">
          <p class="header-title">{{ (edit ? 'ARCHIVE.EDIT_TRACK' : 'RECORD.SAVE_TRACK') | translate }}</p>
        </div>

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
    /* Configuración de la "Isla" */
    ion-content { 
      --background: transparent;
      --padding-top: 0;
    }

    .popover-island {
      background: rgba(255, 255, 255, 0.95);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border-radius: 24px;
      padding: 20px 15px;
      border: 1px solid rgba(255, 255, 255, 0.4);
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
      margin: 5px;
    }

    .popover-header {
      margin-bottom: 15px;
      text-align: center;
    }

    .header-title {
      margin: 0;
      font-size: 14px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #000;
    }

    /* Estilos del Formulario */
    .form-container {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .input-group {
      display: flex;
      flex-direction: column;
      gap: 5px;
    }

    .custom-label {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      color: var(--ion-color-primary, #3880ff);
      margin-left: 8px;
    }

    .custom-textarea {
      --padding-start: 12px;
      --padding-end: 12px;
      --padding-top: 10px;
      --padding-bottom: 10px;
      background: rgba(0, 0, 0, 0.05);
      border-radius: 14px;
      color: #333;
      font-size: 14px;
      --background: transparent;
    }

    /* Botones estilo Nav-Item (Iguales a los anteriores) */
    .button-grid.horizontal {
      display: flex;
      justify-content: center;
      gap: 40px;
      margin-top: 20px;
    }

    .nav-item-btn {
      background: transparent;
      border: none;
      display: flex;
      flex-direction: column;
      align-items: center;
      transition: all 0.2s ease;
      min-width: 60px;

      &:active {
        transform: scale(0.9);
        opacity: 0.7;
      }

      ion-icon {
        font-size: 26px;
        margin-bottom: 4px;
      }

      p {
        margin: 0;
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
        color: #333;
      }
    }

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