import { Component, Input, OnInit, inject } from '@angular/core';
import { PopoverController, ModalController, IonicModule } from '@ionic/angular'; // Añadido ModalController
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms'; 
import { TranslateModule } from '@ngx-translate/core';
import { Waypoint } from 'src/globald';
import { Capacitor } from '@capacitor/core';
import { PhotoViewerComponent } from './photo-viewer.component'; // <-- Ajusta la ruta

@Component({
  selector: 'app-waypoint-popover',
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule, TranslateModule],
  template: `
    <ion-content scrollY="false" class="ion-no-padding">
      <div class="local-glass-island">
        
        <div class="popover-header">
          <ion-icon name="location-sharp" class="header-icon"></ion-icon>
          <h2>{{ 'EDIT.HEADER' | translate }}</h2>
        </div>

        @if (editableWpt.photos && editableWpt.photos.length > 0) {
          <div class="photo-preview-container" (click)="openPhotoViewer()">
            <img [src]="getWebUrl(editableWpt.photos[0])" class="waypoint-photo" />
            <div class="photo-badge">
              <ion-icon name="expand-outline"></ion-icon> </div>
          </div>
        }
        
        <div class="form-container">
          <div class="input-group">
            <ion-label class="custom-label">{{ 'EDIT.NAME' | translate }}</ion-label>
            <ion-textarea [(ngModel)]="editableWpt.name" rows="1" autoGrow="true" class="custom-textarea"></ion-textarea>
          </div>
          
          <div class="input-group">
            <ion-label class="custom-label">{{ 'EDIT.DESCRIPTION' | translate }}</ion-label>
            <ion-textarea [(ngModel)]="editableWpt.comment" rows="3" autoGrow="true" class="custom-textarea"></ion-textarea>
          </div>
        </div>

        <div class="button-grid">
          <button class="nav-item-btn green-pill" (click)="confirm()">
            <ion-icon name="checkmark-sharp"></ion-icon>
            <p>OK</p>
          </button>
          <button class="nav-item-btn red-pill" (click)="cancel()">
            <ion-icon name="close-sharp"></ion-icon>
            <p>{{ 'EDIT.CANCEL' | translate }}</p>
          </button>
        </div>

      </div>
    </ion-content>
  `,
  styles: [`
    ion-content { --background: transparent; }
    .local-glass-island {
      background: rgba(255, 255, 255, 0.96) !important;
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border-radius: 30px;
      border: 1px solid rgba(255, 255, 255, 0.6);
      box-shadow: 0 12px 40px rgba(0, 0, 0, 0.25);
      padding: 24px;
    }

    .photo-preview-container {
      position: relative;
      width: 100%;
      height: 120px;
      margin-bottom: 18px;
      border-radius: 18px;
      overflow: hidden;
      box-shadow: 0 4px 12px rgba(0,0,0,0.1);
      cursor: pointer; /* Indicar que es clicable */
      transition: transform 0.2s;
      
      &:active { transform: scale(0.98); }

      .waypoint-photo {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .photo-badge {
        position: absolute;
        top: 10px;
        right: 10px;
        background: rgba(0, 0, 0, 0.5);
        color: white;
        padding: 5px;
        border-radius: 50%;
        display: flex;
        ion-icon { font-size: 14px; }
      }
    }

    /* ... Resto de tus estilos se mantienen igual ... */
    .popover-header {
      display: flex; align-items: center; gap: 10px; margin-bottom: 15px;
      padding-bottom: 10px; border-bottom: 1px solid rgba(0,0,0,0.05);
      .header-icon { font-size: 20px; color: var(--ion-color-primary); }
      h2 { margin: 0; font-size: 14px; font-weight: 800; text-transform: uppercase; color: #333; }
    }
    .form-container { display: flex; flex-direction: column; gap: 14px; }
    .custom-label { font-size: 10px; font-weight: 800; color: var(--ion-color-primary); text-transform: uppercase; }
    .custom-textarea { background: rgba(0, 0, 0, 0.05); border-radius: 14px; --padding-start: 12px; }
    .button-grid { display: flex; justify-content: center; gap: 16px; margin-top: 25px; }
    .nav-item-btn {
      flex: 1; min-width: 100px; height: 70px; 
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      border: none; border-radius: 20px; background: white;
      box-shadow: 0 4px 10px rgba(0,0,0,0.05);
      ion-icon { font-size: 28px; margin-bottom: 4px; }
      p { margin: 0; font-size: 11px; font-weight: 800; }
      &:active { transform: scale(0.94); }
    }
    .green-pill { color: #2dd36f; }
    .red-pill { color: #eb445a; }
  `]
})
export class WptPopoverComponent implements OnInit {
  @Input() wptEdit!: Waypoint;
  @Input() edit: boolean = false;
  @Input() showAltitude: boolean = false;

  editableWpt: any;

  private popoverCtrl = inject(PopoverController);
  private modalCtrl = inject(ModalController); // Inyectamos el ModalController

  ngOnInit() {
    this.editableWpt = { ...this.wptEdit };
  }

  getWebUrl(path: string): string {
    return Capacitor.convertFileSrc(path);
  }

  // Nueva función para abrir el visor
  async openPhotoViewer() {
    if (!this.editableWpt.photos || this.editableWpt.photos.length === 0) return;

    const modal = await this.modalCtrl.create({
      component: PhotoViewerComponent,
      componentProps: {
        // Le pasamos solo la foto de este waypoint como un array
        photos: [this.editableWpt.photos[0]]
      },
      cssClass: 'fullscreen-modal' // Opcional, si quieres aplicar estilos específicos al modal
    });

    await modal.present();
  }

  cancel() {
    this.popoverCtrl.dismiss();
  }

  confirm() {
    this.popoverCtrl.dismiss({
      action: 'ok',
      ...this.editableWpt 
    });
  }
}