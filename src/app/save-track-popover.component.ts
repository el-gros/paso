import {
  Component,
  Input,
  OnInit,
  inject,
  ChangeDetectionStrategy,
} from '@angular/core';
import { PopoverController } from '@ionic/angular/standalone';
// 1. Importamos los iconos
import { addIcons } from 'ionicons';
import { locationOutline, checkmarkOutline, closeOutline } from 'ionicons/icons';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { PresentService } from './services/present.service';
import { LocationManagerService } from './services/location-manager.service';
import { IONIC_COMPONENTS, ANGULAR_COMMON } from './ionic-imports';

@Component({
  selector: 'app-save-track-popover',
  standalone: true,
  // 2. Ya no hace falta FormsModule
  imports: [
    ...IONIC_COMPONENTS,
    TranslateModule,
    ...ANGULAR_COMMON,
  ],
  template: `
    <ion-content scrollY="false" class="ion-no-padding">
      <div class="local-glass-island">
        <div class="popover-header">
          <ion-icon name="location-outline" class="header-icon"></ion-icon>
          <h2>{{ 'CANVAS.TRACK' | translate | uppercase }}</h2>
        </div>

        <div class="form-container">
          <div class="input-group">
            <ion-label class="custom-label">{{
              'EDIT.NAME' | translate
            }}</ion-label>
            <!-- 3. Sustituimos ngModel por value e ionInput -->
            <ion-textarea
              [value]="modalEdit.name"
              (ionInput)="modalEdit.name = $event.detail.value"
              rows="1"
              autoGrow="true"
              class="custom-textarea"
            >
            </ion-textarea>
          </div>

          <div class="input-group">
            <ion-label class="custom-label">{{
              'EDIT.DESCRIPTION' | translate
            }}</ion-label>
            <!-- 4. Sustituimos ngModel por value e ionInput -->
            <ion-textarea
              [value]="modalEdit.description"
              (ionInput)="modalEdit.description = $event.detail.value"
              rows="4"
              class="custom-textarea scrollable-textarea"
            >
            </ion-textarea>
          </div>
        </div>

        <div class="popover-button-grid">
          <button
            class="popover-btn btn-green ion-activatable"
            (click)="confirm()"
          >
            <ion-icon name="checkmark-outline"></ion-icon>
            <span>{{ 'RECORD.DELETE_YES' | translate }}</span>
            <ion-ripple-effect></ion-ripple-effect>
          </button>
          <button
            class="popover-btn btn-red ion-activatable"
            (click)="cancel()"
          >
            <ion-icon name="close-outline"></ion-icon>
            <span>{{ 'RECORD.DELETE_NO' | translate }}</span>
            <ion-ripple-effect></ion-ripple-effect>
          </button>
        </div>
      </div>
    </ion-content>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [
    `
      ion-content {
        --background: transparent;
      }

      /* 🚀 Conservamos solo los estilos específicos del formulario */
      .form-container {
        display: flex;
        flex-direction: column;
        gap: 14px;
        overflow-y: auto;
      }
      .scrollable-textarea {
        max-height: 150px;
        overflow-y: auto;
      }

      .custom-label {
        font-size: 10px;
        font-weight: 800;
        color: var(--ion-color-primary);
        text-transform: uppercase;
        margin-bottom: 4px;
        display: block;
      }

      .custom-textarea {
        background: rgba(0, 0, 0, 0.05);
        border-radius: 14px;
        --padding-start: 12px;
        margin: 0;
      }

      /* Modificadores de color para los botones globales */
      .btn-green {
        color: #2dd36f;
      }
      .btn-red {
        color: #eb445a;
      }
    `,
  ],
})
export class SaveTrackPopover implements OnInit {
  // ==========================================================================
  // 1. INPUTS Y PROPIEDADES
  // ==========================================================================

  @Input() modalEdit: any;

  public location = inject(LocationManagerService);
  public present = inject(PresentService);
  private popoverCtrl = inject(PopoverController);
  private translate = inject(TranslateService);

  // ==========================================================================
  // 2. CICLO DE VIDA
  // ==========================================================================
  
  constructor() {
    // 5. Registramos los iconos que usa este popover
    addIcons({ locationOutline, checkmarkOutline, closeOutline });
  }

  ngOnInit() {
    this.modalEdit = { name: '', description: '', ...this.modalEdit };
  }

  // ==========================================================================
  // 3. ACCIONES (API PÚBLICA)
  // ==========================================================================

  public cancel() {
    this.popoverCtrl.dismiss(null, 'cancel');
  }

  public confirm() {
    this.popoverCtrl.dismiss({ action: 'ok', ...this.modalEdit });
  }
}