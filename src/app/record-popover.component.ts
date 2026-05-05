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
import { TrackManagerService } from './services/track-manager.service'; // <-- EL NUEVO SERVICIO

@Component({
  standalone: true,
  selector: 'app-record-popover',
  imports: [IonicModule, FormsModule, TranslateModule],
  providers: [DecimalPipe, DatePipe],
  template: `
    <!-- Popover Principal -->
    <ion-popover
      [isOpen]="present.isRecordPopoverOpen"
      (didDismiss)="present.isRecordPopoverOpen = false"
      backdropDismiss="false"
      class="floating-popover"
    >
      <ng-template>
        <div class="popover-island">
          <div class="button-grid">
            <button class="nav-item-btn enabled primary-btn-style" (click)="handleSaveClick()">
              <ion-icon name="save-outline" class="primary-icon"></ion-icon>
              <p>{{ 'RECORD.SAVE_TRACK' | translate }}</p>
            </button>
            <button class="nav-item-btn danger-btn-style" (click)="handleDeleteClick()">
              <ion-icon name="trash-outline" class="danger-icon"></ion-icon>
              <p>{{ 'RECORD.REMOVE' | translate }}</p>
            </button>
          </div>
        </div>
      </ng-template>
    </ion-popover>

    <!-- Confirmación Parar -->
    <ion-popover
      [isOpen]="present.isConfirmStopOpen"
      (didDismiss)="onStopDismiss()"
      class="confirm-popover"
    >
      <ng-template>
        <div class="popover-island confirm-box">
          <p class="confirm-title">{{ 'RECORD.CONFIRM_STOP' | translate }}</p>
          <div class="button-grid horizontal">
            <button class="nav-item-btn green-pill" (click)="confirmStop()">
              <ion-icon name="checkmark-circle-outline"></ion-icon>
              <p>{{ 'RECORD.DELETE_YES' | translate }}</p>
            </button>
            <button class="nav-item-btn red-pill" (click)="cancelStop()">
              <ion-icon name="close-circle-outline"></ion-icon>
              <p>{{ 'RECORD.DELETE_NO' | translate }}</p>
            </button>
          </div>
        </div>
      </ng-template>
    </ion-popover>

    <!-- Confirmación Borrar -->
    <ion-popover
      [isOpen]="present.isConfirmDeletionOpen"
      (didDismiss)="onDeleteDismiss()"
      class="confirm-popover"
    >
      <ng-template>
        <div class="popover-island confirm-box">
          <p class="confirm-title">{{ 'RECORD.CONFIRM_DELETION' | translate }}</p>
          <div class="button-grid horizontal">
            <button class="nav-item-btn green-pill" (click)="confirmDelete()">
              <ion-icon name="checkmark-circle-outline"></ion-icon>
              <p>{{ 'RECORD.DELETE_YES' | translate }}</p>
            </button>
            <button class="nav-item-btn red-pill" (click)="cancelDelete()">
              <ion-icon name="close-circle-outline"></ion-icon>
              <p>{{ 'RECORD.DELETE_NO' | translate }}</p>
            </button>
          </div>
        </div>
      </ng-template>
    </ion-popover>
  `,
  styles: [
    `
      .popover-island { padding: 16px 10px; }
      .button-grid { display: flex; justify-content: space-around; align-items: center; gap: 5px; }
      .button-grid.horizontal { justify-content: center; gap: 40px; }
      .primary-icon { color: var(--ion-color-primary, #3880ff) !important; }
      .danger-icon { color: var(--ion-color-danger, #eb445a) !important; }
      .primary-btn-style p { color: var(--ion-color-primary, #3880ff) !important; }
      .danger-btn-style p { color: var(--ion-color-danger, #eb445a) !important; }
      .green-pill ion-icon, .green-pill p { color: var(--ion-color-success, #2dd36f) !important; }
      .red-pill ion-icon, .red-pill p { color: var(--ion-color-danger, #eb445a) !important; }
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