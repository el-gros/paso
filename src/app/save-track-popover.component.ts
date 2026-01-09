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
    <ion-content class="ion-padding">
      <div class="popover-header">
        <ion-label><strong>{{ (edit ? 'ARCHIVE.EDIT_TRACK' : 'RECORD.SAVE_TRACK') | translate }}</strong></ion-label>
      </div>

      <ion-list lines="none">
        <ion-item>
          <ion-label position="stacked">{{ 'EDIT_MODAL.NAME' | translate }}</ion-label>
          <ion-textarea 
            [(ngModel)]="modalEdit.name" 
            rows="3" 
            class="custom-textarea">
          </ion-textarea>
        </ion-item>
        
        <ion-item>
          <ion-label position="stacked">{{ 'EDIT_MODAL.DESCRIPTION' | translate }}</ion-label>
          <ion-textarea 
            [(ngModel)]="modalEdit.description" 
            rows="5" 
            class="custom-textarea">
          </ion-textarea>
        </ion-item>
      </ion-list>

      <div class="button-container">
        <button class="record-button green-color" (click)="confirm()">
          <ion-icon name="checkmark-sharp"></ion-icon>
          <span>OK</span>
        </button>
        <button class="record-button red-color" (click)="cancel()">
          <ion-icon name="close-sharp"></ion-icon>
          <span>{{ 'EDIT_MODAL.CANCEL' | translate }}</span>
        </button>
      </div>
    </ion-content>
  `,
  styles: [`
    ion-content { --background: var(--ion-item-background); }
    ion-list { background: transparent; }
    
    .popover-header {
      margin-bottom: 10px;
      text-align: center;
      font-size: 1.1rem;
    }

    .custom-textarea {
      --padding-start: 8px;
      --padding-end: 8px;
      background: rgba(var(--ion-text-color-rgb, 0, 0, 0), 0.05);
      border-radius: 8px;
      margin-top: 8px;
      --background: transparent;
    }

    /* Este contenedor permite que el gap de 8px funcione de verdad */
    .button-container { 
      display: flex !important; 
      justify-content: center !important; 
      gap: 8px !important; 
      align-items: center; 
      margin-top: 20px;
      width: 100%;
    }

    /* Neutralizamos cualquier margen del .record-button global */
    .record-button {
      margin: 0 !important;
      flex-shrink: 0; /* Evita que los botones se deformen */
    }
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