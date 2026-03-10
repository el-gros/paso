import { Component, Input, OnInit, inject } from '@angular/core';
import { PopoverController, IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms'; 
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
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
              class="custom-textarea"
              [placeholder]="isNaming ? ('RECORD.SEARCHING_PLACE' | translate) : ''">
            </ion-textarea>
          </div>
          
          <div class="input-group">
            <ion-label class="custom-label">{{ 'EDIT.DESCRIPTION' | translate }}</ion-label>
            <ion-textarea [(ngModel)]="modalEdit.description" rows="3" autoGrow="true" class="custom-textarea"></ion-textarea>
          </div>
        </div>

        <div class="button-grid">
          <button class="nav-item-btn green-pill ion-activatable" (click)="confirm()" [disabled]="isNaming">
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

    /* 🚀 Botones actualizados al estándar de la app */
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
  private http = inject(HttpClient);
  private translate = inject(TranslateService); // 🚀 NUEVO
  
  public isNaming = false;

  async ngOnInit() {
    this.modalEdit = { ...this.modalEdit };
    const coords = this.modalEdit.coords;

    if (!this.modalEdit.name && coords && coords.length > 0) {
      await this.generateSuggestedName(coords);
    }
  }

  async generateSuggestedName(coords: any[]) {
    this.isNaming = true;
    try {
      const start = coords[0];
      const end = coords[coords.length - 1];

      const startPlace = await this.getPlaceName(start[1], start[0]); 
      const endPlace = await this.getPlaceName(end[1], end[0]);

      if (startPlace && endPlace) {
        if (startPlace === endPlace) {
          // 🚀 Usamos TranslateService con parámetros dinámicos
          this.modalEdit.name = this.translate.instant('RECORD.ROUTE_AROUND', { place: startPlace });
        } else {
          this.modalEdit.name = `${startPlace} - ${endPlace}`;
        }
      }
    } catch (error) {
      console.error('Error sugiriendo nombre:', error);
    } finally {
      this.isNaming = false;
    }
  }

  private async getPlaceName(lat: number, lon: number): Promise<string> {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=14`;
    
    // 🚀 Añadimos un Header para no ser bloqueados por Nominatim (Buena práctica)
    const headers = new HttpHeaders({
      'User-Agent': 'PasoApp/1.0 (Contact: admin@pasoapp.com)'
    });

    try {
      const data: any = await firstValueFrom(this.http.get(url, { headers }));
      
      return data.address.village || 
             data.address.town || 
             data.address.city || 
             data.address.suburb || 
             this.translate.instant('RECORD.UNKNOWN_PLACE'); // 🚀 Texto traducido
    } catch {
      return '';
    }
  }

  public cancel() { 
    this.popoverCtrl.dismiss(); 
  }
  
  public confirm() { 
    this.popoverCtrl.dismiss({ action: 'ok', ...this.modalEdit }); 
  }
}