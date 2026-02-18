import { Component, Input, OnInit, inject } from '@angular/core';
import { PopoverController, IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms'; 
import { TranslateModule } from '@ngx-translate/core';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { PresentService } from './services/present.service';

@Component({
  selector: 'app-save-track-popover',
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule, TranslateModule, HttpClientModule],
  template: `
    <ion-content scrollY="false" class="ion-no-padding">
      <div class="local-glass-island">
        
        <div class="form-container">
          <div class="input-group">
            <ion-label class="custom-label">{{ 'EDIT.NAME' | translate }}</ion-label>
            <ion-textarea 
              [(ngModel)]="modalEdit.name" 
              rows="1" 
              autoGrow="true" 
              class="custom-textarea"
              [placeholder]="isNaming ? 'Cercant lloc...' : ''">
            </ion-textarea>
          </div>
          
          <div class="input-group">
            <ion-label class="custom-label">{{ 'EDIT.DESCRIPTION' | translate }}</ion-label>
            <ion-textarea [(ngModel)]="modalEdit.description" rows="3" autoGrow="true" class="custom-textarea"></ion-textarea>
          </div>
        </div>

        <div class="button-grid">
          <button class="nav-item-btn green-pill" (click)="confirm()" [disabled]="isNaming">
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
    ion-content { 
      --background: transparent; 
      --overflow: hidden;
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

    .form-container { display: flex; flex-direction: column; gap: 14px; }
    
    .custom-label { 
      font-size: 10px; 
      font-weight: 800; 
      color: var(--ion-color-primary); 
      text-transform: uppercase; 
    }
    
    .custom-textarea { 
      background: rgba(0, 0, 0, 0.05); 
      border-radius: 14px; 
      --padding-start: 12px; 
    }

    .button-grid { 
      display: flex; 
      justify-content: center; 
      gap: 16px; 
      margin-top: 25px; 
    }

    .nav-item-btn {
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
    }

    .nav-item-btn ion-icon { font-size: 28px; margin-bottom: 4px; }
    .nav-item-btn p { margin: 0; font-size: 11px; font-weight: 800; }
    .nav-item-btn:active { transform: scale(0.94); }

    .green-pill { color: #2dd36f; }
    .red-pill { color: #eb445a; }
  `]
})
export class SaveTrackPopover implements OnInit { 
  @Input() modalEdit: any;

  // Inyectamos los servicios
  public present = inject(PresentService);
  private popoverCtrl = inject(PopoverController);
  private http = inject(HttpClient);
  
  public isNaming = false;

  async ngOnInit() {
    this.modalEdit = { ...this.modalEdit };

    // Obtenemos las coordenadas AQUÍ, es más seguro que en las propiedades de la clase
    const coords = this.present.currentTrack?.features?.[0]?.geometry?.coordinates;

    // Si el nombre viene vacío, intentamos sugerir uno
    if (!this.modalEdit.name && coords && coords.length > 0) {
      await this.generateSuggestedName(coords);
    }
  }

  async generateSuggestedName(coords: any[]) {
    this.isNaming = true;
    try {
      const start = coords[0];
      const end = coords[coords.length - 1];

      // Nominatim usa lat, lon. OpenLayers usa lon, lat. Invertimos.
      const startPlace = await this.getPlaceName(start[1], start[0]); 
      const endPlace = await this.getPlaceName(end[1], end[0]);

      if (startPlace && endPlace) {
        if (startPlace === endPlace) {
          this.modalEdit.name = `Ruta per ${startPlace}`;
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
    try {
      const data: any = await firstValueFrom(this.http.get(url));
      
      // Priorizamos: Pueblo/Ciudad > Barrio > Municipio
      return data.address.village || 
             data.address.town || 
             data.address.city || 
             data.address.suburb || 
             'Lloc desconegut';
    } catch {
      return '';
    }
  }

  cancel() { this.popoverCtrl.dismiss(); }
  confirm() { this.popoverCtrl.dismiss({ action: 'ok', ...this.modalEdit }); }
}