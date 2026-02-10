import { Component, Input, OnInit, inject } from '@angular/core';
import { PopoverController, IonicModule } from '@ionic/angular';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms'; 
import { TranslateModule } from '@ngx-translate/core';
import { Waypoint } from 'src/globald';

@Component({
  selector: 'app-wpt-popover',
  standalone: true,
  imports: [
    CommonModule, 
    FormsModule, 
    IonicModule,
    TranslateModule
  ],
  providers: [DecimalPipe],
  template: `
    <ion-content scrollY="false">
      <div class="popover-island">
        
        <div class="popover-header">
          <h2 class="main-title">{{ (edit ? 'WPT.HEADER' : (wptEdit.name ?? '')) | translate }}</h2>
          @if (showAltitude && wptEdit.altitude) {
            <span class="altitude-badge">
              <ion-icon name="trending-up-outline"></ion-icon>
              {{ wptEdit.altitude | number:'1.1-1' }} m
            </span>
          }
        </div>

        <div class="form-container">
          @if (edit) {
            <div class="input-group">
              <ion-label class="custom-label">{{ 'WPT.NAME' | translate }}</ion-label>
              <ion-textarea 
                [(ngModel)]="editableWpt.name" 
                rows="1" 
                autoGrow="true"
                class="custom-textarea"
                [placeholder]="'WPT.NAME' | translate">
              </ion-textarea>
            </div>
          }

          <div class="input-group">
            <ion-label class="custom-label">{{ 'WPT.COMMENT' | translate }}</ion-label>
            <ion-textarea 
              [(ngModel)]="editableWpt.comment" 
              [readonly]="!edit"
              [rows]="edit ? 3 : 1" 
              autoGrow="true"
              class="custom-textarea"
              [class.readonly-view]="!edit"
              [placeholder]="edit ? '...' : ''">
            </ion-textarea>
          </div>
        </div>

        @if (edit) {
          <div class="button-grid horizontal">
            <button class="nav-item-btn green-pill" (click)="confirm()">
              <ion-icon name="checkmark-sharp"></ion-icon>
              <p>OK</p>
            </button>
            <button class="nav-item-btn red-pill" (click)="cancel()">
              <ion-icon name="close-sharp"></ion-icon>
              <p>{{ 'EDIT.CANCEL' | translate }}</p>
            </button>
          </div>
        } @else {
          <div class="edit-toggle-container">
            <button class="edit-circle-btn" (click)="edit = true">
              <ion-icon name="create-outline"></ion-icon>
            </button>
          </div>
        }
      </div>
    </ion-content>
  `,
  styles: [`
    ion-content { 
      --background: transparent;
      --padding-top: 0;
    }

    .popover-island {
      padding: 20px 16px;
    }

    .popover-header {
      margin-bottom: 18px;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 1px solid rgba(0,0,0,0.05);
      padding-bottom: 10px;
    }

    .main-title {
      margin: 0;
      font-size: 1.1rem;
      font-weight: 700;
      color: #333;
    }

    .altitude-badge {
      background: var(--ion-color-step-100, #f4f4f4);
      padding: 4px 8px;
      border-radius: 6px;
      font-size: 0.75rem;
      font-weight: 600;
      color: #666;
      display: flex;
      align-items: center;
      gap: 4px;
    }

    /* --- FORMULARIO --- */
    .form-container {
      display: flex;
      flex-direction: column;
      gap: 14px;
    }

    .input-group {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .custom-label {
      font-size: 9px;
      font-weight: 800;
      text-transform: uppercase;
      color: var(--ion-color-primary);
      margin-left: 8px;
      letter-spacing: 0.5px;
    }

    .custom-textarea {
      background: rgba(0, 0, 0, 0.04);
      border-radius: 12px;
      --padding-start: 12px;
      --padding-end: 12px;
      --padding-top: 10px;
      --padding-bottom: 10px;
      color: #333;
      font-size: 14px;
      border: 1px solid transparent;

      &.readonly-view {
        background: transparent;
        --padding-start: 4px;
        font-style: italic;
        color: #555;
      }

      &:focus-within {
        border: 1px solid rgba(var(--ion-color-primary-rgb), 0.2);
      }
    }

    /* --- BOTONES --- */
    .button-grid.horizontal {
      display: flex;
      justify-content: center;
      gap: 30px;
      margin-top: 20px;
    }

    .edit-toggle-container {
      display: flex;
      justify-content: flex-end;
      margin-top: 10px;
    }

    .edit-circle-btn {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: var(--ion-color-primary);
      color: white;
      border: none;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
      box-shadow: 0 4px 10px rgba(var(--ion-color-primary-rgb), 0.3);
      
      &:active {
        transform: scale(0.9);
      }
    }
  `]
})
export class WptPopoverComponent implements OnInit {
  @Input() wptEdit!: Waypoint;
  @Input() edit: boolean = false;
  @Input() showAltitude: boolean = false;

  // Usamos una copia local para no modificar el original hasta confirmar
  editableWpt: any;

  private popoverCtrl = inject(PopoverController);

  ngOnInit() {
    this.editableWpt = { ...this.wptEdit };
  }

  cancel() {
    this.popoverCtrl.dismiss();
  }

  confirm() {
    this.popoverCtrl.dismiss({
      action: 'ok',
      name: this.editableWpt.name,
      comment: this.editableWpt.comment
    });
  }
}