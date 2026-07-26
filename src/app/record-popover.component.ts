import {
  Component,
  ChangeDetectorRef,
  inject,
  OnInit,
  OnDestroy,
} from '@angular/core';
import { DecimalPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  IonicModule,
  PopoverController,
  LoadingController,
} from '@ionic/angular';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { Subscription } from 'rxjs';

// Servicios
import { FunctionsService } from './services/functions.service';
import { PresentService } from './services/present.service';
import { SaveTrackPopover } from './save-track-popover.component';
import { TrackManagerService } from './services/track-manager.service'; 
import { StateService } from './services/state.service';
import { VoiceRunnerService } from './services/voice-runner.service';
@Component({
  standalone: true,
  selector: 'app-record-popover',
  imports: [IonicModule, FormsModule, TranslateModule],
  providers: [DecimalPipe, DatePipe],
  template: `
    <ion-popover
      [isOpen]="present.isRecordPopoverOpen"
      (didDismiss)="present.isRecordPopoverOpen = false"
      backdropDismiss="false"
      class="floating-popover"
    >
      <ng-template>
        <div class="local-glass-island">
          <div class="popover-button-grid">
            <button class="popover-btn btn-blue enabled" (click)="handleSaveClick()">
              <ion-icon name="save-outline"></ion-icon>
              <span>{{ 'RECORD.SAVE_TRACK' | translate }}</span>
            </button>
            <button class="popover-btn btn-red" (click)="handleDeleteClick()">
              <ion-icon name="trash-outline"></ion-icon>
              <span>{{ 'RECORD.REMOVE' | translate }}</span>
            </button>
          </div>
        </div>
      </ng-template>
    </ion-popover>

    <ion-popover
      [isOpen]="present.isConfirmStopOpen"
      (didDismiss)="onStopDismiss()"
      class="confirm-popover"
    >
      <ng-template>
        <div class="local-glass-island confirm-box">
          <p class="confirm-title">{{ 'RECORD.CONFIRM_STOP' | translate }}</p>
          <div class="popover-button-grid">
            <button class="popover-btn btn-green" (click)="confirmStop()">
              <ion-icon name="checkmark-outline"></ion-icon>
              <span>{{ 'RECORD.DELETE_YES' | translate }}</span>
            </button>
            <button class="popover-btn btn-red" (click)="cancelStop()">
              <ion-icon name="close-outline"></ion-icon>
              <span>{{ 'RECORD.DELETE_NO' | translate }}</span>
            </button>
          </div>
        </div>
      </ng-template>
    </ion-popover>

    <ion-popover
      [isOpen]="present.isConfirmDeletionOpen"
      (didDismiss)="onDeleteDismiss()"
      class="confirm-popover"
    >
      <ng-template>
        <div class="local-glass-island confirm-box">
          <p class="confirm-title">{{ 'RECORD.CONFIRM_DELETION' | translate }}</p>
          <div class="popover-button-grid">
            <button class="popover-btn btn-green" (click)="confirmDelete()">
              <ion-icon name="checkmark-outline"></ion-icon>
              <span>{{ 'RECORD.DELETE_YES' | translate }}</span>
            </button>
            <button class="popover-btn btn-red" (click)="cancelDelete()">
              <ion-icon name="close-outline"></ion-icon>
              <span>{{ 'RECORD.DELETE_NO' | translate }}</span>
            </button>
          </div>
        </div>
      </ng-template>
    </ion-popover>
  `,
  styles: [
    `
      .confirm-box { padding: 24px 16px; text-align: center; }
      .confirm-title { margin-bottom: 20px; font-size: 14px; font-weight: 800; color: #111; text-transform: uppercase; }
      
      .btn-blue { color: var(--ion-color-primary); }
      .btn-red { color: var(--ion-color-danger); }
      .btn-green { color: var(--ion-color-success); }
      
      .enabled ion-icon { animation: pulse 2s infinite; }
      @keyframes pulse { 0% { transform: scale(1); } 50% { transform: scale(1.1); } 100% { transform: scale(1); } }
    `,
  ],
})
export class RecordPopoverComponent implements OnInit, OnDestroy {
  public fs = inject(FunctionsService);
  public present = inject(PresentService);
  private translate = inject(TranslateService);
  private popoverController = inject(PopoverController);
  private cd = inject(ChangeDetectorRef);
  private loadingCtrl = inject(LoadingController);
  private trackManager = inject(TrackManagerService);
  public state = inject(StateService); // <-- Inyecta el servicio aquí
  public loading = false;
  private subscription?: Subscription;
  public voiceRunner = inject(VoiceRunnerService);

  // Banderas anti-bucles
  private confirmedDelete = false;
  private confirmedStop = false;

  ngOnInit() {
    // En el ngOnInit de tu RecordPopoverComponent (o en tu PresentService):
    this.state.state$.subscribe(currentState => {
      this.present.isConfirmStopOpen = (currentState === 'CONFIRM_STOP');
      this.present.isRecordPopoverOpen = (currentState === 'TRACK_MENU');
      this.present.isConfirmDeletionOpen = (currentState === 'CONFIRM_DELETE');
    });
    }
  ngOnDestroy() { this.subscription?.unsubscribe(); }

  // ==========================================================================
  // NAVEGACIÓN DESDE EL POPOVER PRINCIPAL
  // ==========================================================================
  handleSaveClick() {
    this.present.isRecordPopoverOpen = false;
    this.trackManager.setTrackDetails(); // <-- Asegúrate de que use this.trackManager
  }

  handleDeleteClick() {
    // Usamos el StateService en lugar de this.present.isConfirmDeletionOpen = true
    this.state.transitionTo('CONFIRM_DELETE');
  }

  // ==========================================================================
  // GESTIÓN DE BORRADO (Anti-loop fix)
  // ==========================================================================
  async confirmDelete() {
    this.confirmedDelete = true; // Marcamos que el usuario dijo SÍ
    
    // 1. PRIMERO devolvemos la máquina de estados a reposo (IDLE).
    // Esto hará que tu ngOnInit ponga isConfirmDeletionOpen en false automáticamente
    // y le dirá al micrófono que ya no esperamos un "Sí/No".
    this.state.transitionTo('IDLE');

    try {
      await this.trackManager.deleteTrackProcess();
      this.fs.displayToast(this.translate.instant('MAP.CURRENT_TRACK_DELETED'), 'success');
    } catch (error) {
      console.error('Error al borrar track:', error);
    }
  }

  cancelDelete() {
    // Si pulsa "No", volvemos al menú del track anterior usando el estado
    this.state.transitionTo('TRACK_MENU');
  }

  onDeleteDismiss() {
    // Este evento salta cuando el popover se cierra (por botón o tocando fuera)
    if (!this.confirmedDelete) {
      // Si se cerró tocando fuera del recuadro (sin pulsar el botón SÍ),
      // nos aseguramos de que el sistema y la voz vuelvan al menú principal
      this.state.transitionTo('TRACK_MENU');
    }
    // Reseteamos la bandera para la próxima vez
    this.confirmedDelete = false;
  }
  
  // ==========================================================================
  // GESTIÓN DE PARADA
  // ==========================================================================
  async confirmStop() {
    this.confirmedStop = true;
    this.present.isConfirmStopOpen = false;

    try {
      this.subscription?.unsubscribe();
      const isSuccess = await this.trackManager.stopTrackingProcess();

      if (isSuccess) {
        this.fs.displayToast(this.translate.instant('MAP.TRACK_FINISHED'), 'success');
        
        // ❌ Antes tenías: await this.setTrackDetails();
        // ✅ CÁMBIALO POR ESTO: Llamamos al método centralizado en el servicio
        await this.trackManager.setTrackDetails(); 

      } else {
        this.fs.displayToast(this.translate.instant('MAP.TRACK_EMPTY'), 'warning');
        this.state.transitionTo('IDLE');
        await this.trackManager.deleteTrackProcess();
      }
    } catch (error) {
      console.error('Error al detener track:', error);
      this.state.transitionTo('IDLE');
    }
  }

  cancelStop() {
    this.present.isConfirmStopOpen = false;
  }

  onStopDismiss() {
    if (this.state.current === 'CONFIRM_STOP') {
      this.voiceRunner.cancelStop();
    }
    //this.present.isConfirmStopOpen = false;
    //this.confirmedStop = false; // Reseteamos la bandera
  }

}