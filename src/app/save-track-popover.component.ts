import { Component, Input, OnInit, inject } from '@angular/core';
import { PopoverController, IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms'; 
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { PresentService } from './services/present.service';
import { LocationManagerService } from './services/location-manager.service';

@Component({
  selector: 'app-save-track-popover',
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule, TranslateModule],
  template: `
    <ion-content scrollY="false" class="ion-no-padding">
      <div class="local-glass-island">
      
        <div class="popover-header">
          <ion-icon name="location-sharp" class="header-icon"></ion-icon>
          <h2>{{ 'CANVAS.TRACK' | translate | uppercase }}</h2>
        </div>

        <div class="form-container">
          <div class="input-group">
            <ion-label class="custom-label">{{ 'EDIT.NAME' | translate }}</ion-label>
            <ion-textarea 
              [(ngModel)]="modalEdit.name" 
              rows="1" 
              autoGrow="true" 
              class="custom-textarea">
            </ion-textarea>
          </div>
          
          <div class="input-group">
            <ion-label class="custom-label">{{ 'EDIT.DESCRIPTION' | translate }}</ion-label>
            <ion-textarea [(ngModel)]="modalEdit.description" rows="4" class="custom-textarea scrollable-textarea">
            </ion-textarea>
          </div>
        </div>

        <div class="button-grid">
          <button class="nav-item-btn green-pill ion-activatable" (click)="confirm()">
            <ion-icon name="checkmark-sharp"></ion-icon>
            <span>OK</span>
            <ion-ripple-effect></ion-ripple-effect>
          </button>
          <button class="nav-item-btn red-pill ion-activatable" (click)="cancel()">
            <ion-icon name="close-sharp"></ion-icon>
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
      display: flex;
      flex-direction: column;
      max-height: 90vh;
    }
    
    .popover-header {
      display: flex; align-items: center; gap: 10px; margin-bottom: 15px;
      padding-bottom: 10px; border-bottom: 1px solid rgba(0,0,0,0.05);
      
      .header-icon { font-size: 20px; color: var(--ion-color-primary); }
      h2 { margin: 0; font-size: 14px; font-weight: 800; text-transform: uppercase; color: #333; }
    }
    
    .form-container { display: flex; flex-direction: column; gap: 14px; overflow-y: auto; }
    
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

    .button-grid { 
      display: flex; 
      justify-content: center; 
      gap: 16px; 
      margin-top: 25px; 
    }

    .nav-item-btn {
      position: relative;
      overflow: hidden;
      flex: 1;
      min-width: 110px; 
      height: 75px; 
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      border: none;
      border-radius: 20px;
      background: white;
      box-shadow: 0 4px 10px rgba(0,0,0,0.1);
      cursor: pointer;
      transition: transform 0.1s;
      
      ion-icon { font-size: 28px; margin-bottom: 4px; pointer-events: none; }
      span { margin: 0; font-size: 11px; font-weight: 800; text-transform: uppercase; pointer-events: none; }
      
      &:active { transform: scale(0.94); }
      &:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
    }

    .green-pill { color: #2dd36f; }
    .red-pill { color: #eb445a; }
  `]
})
export class SaveTrackPopover implements OnInit { 
  @Input() modalEdit: any;

  // Inyecciones
  public location = inject(LocationManagerService);
  public present = inject(PresentService);
  private popoverCtrl = inject(PopoverController);
  private translate = inject(TranslateService); 
  
  ngOnInit() {
    // Simplemente aseguramos que el objeto exista y lo copiamos para editarlo
    this.modalEdit = { name: '', description: '', ...this.modalEdit };
  }

  public cancel() { 
    this.popoverCtrl.dismiss(null, 'cancel'); 
  }
  
  public confirm() { 
    this.popoverCtrl.dismiss({ action: 'ok', ...this.modalEdit }); 
  }
}