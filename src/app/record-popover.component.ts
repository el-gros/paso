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

  public loading = false;
  private subscription?: Subscription;

  // Banderas anti-bucles
  private confirmedDelete = false;
  private confirmedStop = false;

  ngOnInit() {}
  ngOnDestroy() { this.subscription?.unsubscribe(); }

  // ==========================================================================
  // NAVEGACIÓN DESDE EL POPOVER PRINCIPAL
  // ==========================================================================
  handleSaveClick() {
    this.present.isRecordPopoverOpen = false;
    this.setTrackDetails();
  }

  handleDeleteClick() {
    this.present.isRecordPopoverOpen = false;
    this.present.isConfirmDeletionOpen = true;
  }

  // ==========================================================================
  // GESTIÓN DE BORRADO (Anti-loop fix)
  // ==========================================================================
  async confirmDelete() {
    this.confirmedDelete = true; // Marcamos que el usuario dijo SÍ
    this.present.isConfirmDeletionOpen = false; // Cerramos la ventana (esto dispara onDeleteDismiss)

    try {
      await this.trackManager.deleteTrackProcess();
      this.fs.displayToast(this.translate.instant('MAP.CURRENT_TRACK_DELETED'), 'success');
    } catch (error) {
      console.error('Error al borrar track:', error);
    }
  }

  cancelDelete() {
    this.present.isConfirmDeletionOpen = false;
  }

  onDeleteDismiss() {
    this.present.isConfirmDeletionOpen = false;
    // Si NO se confirmó el borrado (pulsó "NO" o fuera de la caja), reabrimos el menú principal
    if (!this.confirmedDelete) {
      this.present.isRecordPopoverOpen = true;
    }
    // Reseteamos la bandera para la próxima vez
    this.confirmedDelete = false;
  }

  // ==========================================================================
  // GESTIÓN DE PARADA
  // ==========================================================================
  async confirmStop() {
    this.confirmedStop = true; // Marcamos que el usuario dijo SÍ
    this.present.isConfirmStopOpen = false; // Cerramos la ventana

    try {
      this.subscription?.unsubscribe();
      const isSuccess = await this.trackManager.stopTrackingProcess();
      
      if (isSuccess) {
        this.fs.displayToast(this.translate.instant('MAP.TRACK_FINISHED'), 'success');
        await this.setTrackDetails();
      } else {
        this.fs.displayToast(this.translate.instant('MAP.TRACK_EMPTY'), 'warning');
      }
    } catch (error) {
      console.error('Error al detener track:', error);
    }
  }

  cancelStop() {
    this.present.isConfirmStopOpen = false;
  }

  onStopDismiss() {
    this.present.isConfirmStopOpen = false;
    this.confirmedStop = false; // Reseteamos la bandera
  }

  // ==========================================================================
  // GUARDAR RUTA Y UI DE CARGA
  // ==========================================================================
  async setTrackDetails() {
    const loadingOverlay = await this.loadingCtrl.create({
      message: this.translate.instant('RECORD.ANALYZING_ROUTE'),
      spinner: 'crescent',
      backdropDismiss: false,
    });
    await loadingOverlay.present();

    const proposedTexts = await this.trackManager.generateSmartTexts();
    await loadingOverlay.dismiss();

    const popover = await this.popoverController.create({
      component: SaveTrackPopover,
      componentProps: { modalEdit: proposedTexts },
      backdropDismiss: true,
      cssClass: 'top-glass-island-wrapper',
      translucent: true,
    });

    await popover.present();
    const { data, role } = await popover.onDidDismiss();

    if (role === 'cancel' || role === 'backdrop' || data?.action !== 'ok') {
      this.present.isRecordPopoverOpen = true; 
      return; 
    }

    const finalName = data.name || this.translate.instant('RECORD.DEFAULT_NAME');
    await this.saveFile(finalName, data.description);
  }

  async saveFile(name: string, description: string) {
    const loadingOverlay = await this.loadingCtrl.create({
      message: this.translate.instant('RECORD.SAVING_TRACK'),
      spinner: 'crescent',
      backdropDismiss: false,
      translucent: true,
      cssClass: 'custom-loading-save'
    });

    await loadingOverlay.present();
    this.loading = true; 

    try {
      await this.trackManager.processAndSaveTrack(name, description, (msg) => {
        loadingOverlay.message = msg;
      });

      this.fs.displayToast(this.translate.instant('MAP.SAVED'), 'success');
      
      // Cerramos todo
      this.present.isRecordPopoverOpen = false;
      this.present.isConfirmStopOpen = false;
      this.present.isConfirmDeletionOpen = false;
      
    } catch (e) {
      console.error('❌ Error crítico al guardar el Track:', e);
      this.fs.displayToast(this.translate.instant('RECORD.SAVE_ERROR'), 'danger');
    } finally {
      await loadingOverlay.dismiss();
      this.loading = false;
      this.cd.detectChanges();
    }
  }
}