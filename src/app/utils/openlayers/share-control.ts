import { Control } from 'ol/control';
import { Map } from 'ol';
import { TranslateService } from '@ngx-translate/core';
import { LocationManagerService } from 'src/app/services/location-manager.service';
import { LocationSharingService } from 'src/app/services/locationSharing.service';

export class ShareControl extends Control {
  private button: HTMLButtonElement;
  private popup!: HTMLDivElement;
  private backdrop!: HTMLDivElement;
  
  // 🚀 NUEVO: Candado lógico para evitar toques múltiples
  private isProcessing: boolean = false; 

  constructor(
    private locationService: LocationManagerService,
    private locationSharing: LocationSharingService,
    private translate: TranslateService
  ) {
    const element = document.createElement('div');
    element.className = 'ol-control share-control';

    super({ element: element });

    // 1. CONFIGURACIÓN DEL BOTÓN PRINCIPAL
    this.button = document.createElement('button');
    this.button.type = 'button';
    this.button.style.touchAction = 'none';
    this.button.title = this.translate.instant('MAP.SHARE') || 'Share Location';

    this.button.addEventListener('pointerdown', (e) => this.handleMainButtonClick(e), { capture: true });
    
    this.button.addEventListener('touchstart', (e) => {
      e.preventDefault();
      e.stopPropagation();
    }, { passive: false });

    element.appendChild(this.button);

    this.initConfirmationUI();
    this.updateUI();
  }

  private initConfirmationUI() {
    this.backdrop = document.createElement('div');
    this.backdrop.className = 'share-backdrop';
    this.backdrop.style.touchAction = 'none';
    this.backdrop.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.hideConfirmation();
    });
    document.body.appendChild(this.backdrop);

    this.popup = document.createElement('div');
    this.popup.className = 'share-popup confirm-popover';
    this.renderPopupContent();
    document.body.appendChild(this.popup);
  }

  private renderPopupContent() {
    const txtConfirm = this.translate.instant('MAP.CONFIRM_SHARING') || '¿COMPARTIR UBICACIÓN?';
    const txtYes = this.translate.instant('RECORD.DELETE_YES') || 'SÍ';
    const txtNo = this.translate.instant('RECORD.DELETE_NO') || 'NO';

    this.popup.innerHTML = `
      <div class="popover-island confirm-box">
        <p class="confirm-title">${txtConfirm}</p>
        <div class="button-grid horizontal">
          <button id="btnShareYes" class="nav-item-btn green-pill" style="touch-action: none;">
            <ion-icon name="checkmark-sharp" style="font-size: 32px; pointer-events: none;"></ion-icon>
            <p style="pointer-events: none;">${txtYes}</p>
          </button>
          <button id="btnShareNo" class="nav-item-btn red-pill" style="touch-action: none;">
            <ion-icon name="close-sharp" style="font-size: 32px; pointer-events: none;"></ion-icon>
            <p style="pointer-events: none;">${txtNo}</p>
          </button>
        </div>
      </div>
    `;

    const btnYes = this.popup.querySelector('#btnShareYes') as HTMLButtonElement;
    const btnNo = this.popup.querySelector('#btnShareNo') as HTMLButtonElement;

    btnYes?.addEventListener('pointerdown', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      // 🚀 Evita clics repetidos si ya está procesando
      if (this.isProcessing) return; 

      this.isProcessing = true;
      this.hideConfirmation(); // Ocultamos el popup inmediatamente
      this.updateUI();         // Mostramos el spinner en el botón principal del mapa

      try {
        await this.locationSharing.startSharing(); 
      } catch (error) {
        console.error("Error al compartir:", error);
      } finally {
        // 🚀 Pase lo que pase, quitamos el candado al terminar
        this.isProcessing = false;
        this.updateUI();
      }
    });

    btnNo?.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.hideConfirmation();
    });
  }

  private async handleMainButtonClick(event: Event) {
    event.preventDefault();
    event.stopPropagation();
    
    // 🚀 Evita que detengan o inicien mientras está trabajando
    if (this.isProcessing) return;

    if (this.locationService.isSharing) {
      this.isProcessing = true;
      this.updateUI(); // Mostramos el spinner
      
      try {
        await this.locationSharing.stopSharing();
      } finally {
        this.isProcessing = false;
        this.updateUI();
      }
    } else {
      this.showConfirmation();
    }
  }

  public updateUI() {
    // 🚀 Si está procesando, dibujamos un spinner en lugar del icono
    if (this.isProcessing) {
      this.button.innerHTML = `
        <div style="position: relative; display: flex; align-items: center; justify-content: center; height: 100%;">
          <ion-spinner name="crescent" style="transform: scale(0.8); color: #999999;"></ion-spinner>
        </div>
      `;
      this.button.style.border = '1px solid #ccc';
      this.button.style.backgroundColor = '#f9f9f9';
      return; // Salimos para no dibujar el resto
    }

    const activeColor = '#3880ff';
    const inactiveColor = '#999999';
    const isSharing = this.locationService.isSharing; 
    
    const iconName = isSharing ? 'share-social-sharp' : 'share-social-outline';
    const color = isSharing ? activeColor : inactiveColor;

    this.button.innerHTML = `
      <div style="position: relative; display: flex; align-items: center; justify-content: center; height: 100%;">
        <ion-icon name="${iconName}" style="font-size: 24px; color: ${color}; transition: all 0.3s;"></ion-icon>
        ${isSharing ? '<span class="sharing-dot"></span>' : ''}
      </div>
    `;
    
    this.button.style.border = `1px solid ${isSharing ? activeColor : '#ccc'}`;
    this.button.style.backgroundColor = isSharing ? '#f0f7ff' : '#ffffff';
  }

  private showConfirmation() {
    this.backdrop.classList.add('active');
    this.popup.classList.add('active');
  }

  private hideConfirmation() {
    this.backdrop.classList.remove('active');
    this.popup.classList.remove('active');
  }

  override setMap(map: Map | null) {
    super.setMap(map);
    if (!map) {
      this.backdrop?.remove();
      this.popup?.remove();
    }
  }
}