import { Component, Input, OnInit, inject } from '@angular/core';
import { PopoverController, ModalController, IonicModule } from '@ionic/angular'; 
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms'; 
import { TranslateModule } from '@ngx-translate/core';
import { Waypoint } from '../globald';
import { Capacitor } from '@capacitor/core';
import { PhotoViewerComponent } from './photo-viewer.component';

@Component({
  selector: 'app-waypoint-popover',
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule, TranslateModule],
  template: `
    <ion-content scrollY="false" class="ion-no-padding">
      <div class="local-glass-island">
        
        <div class="popover-header">
          <ion-icon name="location-outline" class="header-icon"></ion-icon>
          <h2>{{ 'EDIT.HEADER' | translate }}</h2>
        </div>

        @if (editableWpt.photos && editableWpt.photos.length > 0) {
          <div class="photo-preview-container ion-activatable" (click)="openPhotoViewer()">
            <img [src]="getWebUrl(editableWpt.photos[0])" class="waypoint-photo" loading="lazy" />
            
            <div class="photo-badge">
              <ion-icon name="expand-outline"></ion-icon> 
            </div>
            
            @if(editableWpt.photos.length > 1) {
              <div class="photo-count-badge">
                +{{ editableWpt.photos.length - 1 }}
              </div>
            }
            
            <ion-ripple-effect></ion-ripple-effect>
          </div>
        }
        
        <div class="meta-tags-row">
          @if (editableWpt.altitude !== undefined && editableWpt.altitude !== null) {
            <span class="meta-tag">
              <ion-icon name="trending-up-outline"></ion-icon>
              {{ editableWpt.altitude | number:'1.0-0' }} m
            </span>
          }
        </div>
        
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
          <button class="nav-item-btn green-pill ion-activatable" (click)="confirm()">
            <ion-icon name="checkmark-outline"></ion-icon>
            <span>{{ 'GENERIC.OK' | translate }}</span>
            <ion-ripple-effect></ion-ripple-effect>
          </button>
          <button class="nav-item-btn red-pill ion-activatable" (click)="cancel()">
            <ion-icon name="close-outline"></ion-icon>
            <span>{{ 'EDIT.CANCEL' | translate }}</span>
            <ion-ripple-effect></ion-ripple-effect>
          </button>
        </div>

      </div>
    </ion-content>
  `,
  styles: [`
    ion-content { 
      --background: transparent; 
    }

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
      cursor: pointer; 
      transition: transform 0.2s;
      background: #f0f0f0; /* Color de fondo mientras carga */
      
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
      
      /* 🚀 Nuevo Badge si hay más de 1 foto */
      .photo-count-badge {
        position: absolute;
        bottom: 10px;
        right: 10px;
        background: rgba(0, 0, 0, 0.6);
        color: white;
        padding: 4px 8px;
        border-radius: 12px;
        font-size: 11px;
        font-weight: 800;
        backdrop-filter: blur(4px);
      }
    }
    
    .meta-tags-row {
      display: flex;
      gap: 8px;
      margin-bottom: 15px;
    }

    .meta-tag {
      display: flex;
      align-items: center;
      gap: 4px;
      background: rgba(0,0,0,0.05);
      color: #666;
      padding: 4px 10px;
      border-radius: 8px;
      font-size: 11px;
      font-weight: 600;
    }
    
    .popover-header {
      display: flex; align-items: center; gap: 10px; margin-bottom: 15px;
      padding-bottom: 10px; border-bottom: 1px solid rgba(0,0,0,0.05);
      
      .header-icon { font-size: 20px; color: var(--ion-color-primary); }
      h2 { margin: 0; font-size: 14px; font-weight: 800; text-transform: uppercase; color: #333; }
    }
    
    .form-container { display: flex; flex-direction: column; gap: 14px; }
    
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

    .button-grid { 
      display: flex; 
      justify-content: center; 
      gap: 16px; 
      margin-top: 25px; 
    }

    .nav-item-btn {
      position: relative;
      overflow: hidden;
      flex: 1; min-width: 100px; height: 70px; 
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      border: none; border-radius: 20px; background: white;
      box-shadow: 0 4px 10px rgba(0,0,0,0.05);
      cursor: pointer;
      transition: transform 0.1s;
      
      ion-icon { font-size: 28px; margin-bottom: 4px; pointer-events: none; }
      span { margin: 0; font-size: 11px; font-weight: 800; text-transform: uppercase; pointer-events: none; }
      
      &:active { transform: scale(0.94); }
    }
    
    .green-pill { color: #2dd36f; }
    .red-pill { color: #eb445a; }
  `]
})
export class WptPopoverComponent implements OnInit {

  // ==========================================================================
  // 1. INPUTS Y PROPIEDADES
  // ==========================================================================

  @Input() wptEdit!: Waypoint;
  @Input() edit: boolean = false;
  @Input() showAltitude: boolean = false;

  public editableWpt: any;

  private popoverCtrl = inject(PopoverController);
  private modalCtrl = inject(ModalController); 

  // ==========================================================================
  // 2. CICLO DE VIDA
  // ==========================================================================

  ngOnInit() {
    this.editableWpt = { ...this.wptEdit };
  }

  // ==========================================================================
  // 3. ACCIONES (API PÚBLICA)
  // ==========================================================================

  /** Abre el visor de fotos a pantalla completa */
  public async openPhotoViewer() {
    if (!this.editableWpt.photos || this.editableWpt.photos.length === 0) return;

    const modal = await this.modalCtrl.create({
      component: PhotoViewerComponent,
      componentProps: {
        // 🚀 Le pasamos el array COMPLETO para que el usuario pueda usar el carrusel
        photos: this.editableWpt.photos 
      },
      cssClass: 'fullscreen-modal' 
    });

    await modal.present();
  }

  public cancel() {
    this.popoverCtrl.dismiss();
  }

  public confirm() {
    this.popoverCtrl.dismiss({
      action: 'ok',
      ...this.editableWpt 
    });
  }

  // ==========================================================================
  // 4. HELPERS VISUALES
  // ==========================================================================

  public getWebUrl(path: string): string {
    return path ? Capacitor.convertFileSrc(path) : '';
  }

}