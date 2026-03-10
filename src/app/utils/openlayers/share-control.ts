import { Control } from 'ol/control';
import { Map } from 'ol';
import { TranslateService } from '@ngx-translate/core';
import { LocationManagerService } from 'src/app/services/location-manager.service';
import { LocationSharingService } from 'src/app/services/locationSharing.service';

export class ShareControl extends Control {
  private button: HTMLButtonElement;
  private popup!: HTMLDivElement;
  private backdrop!: HTMLDivElement;

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
    this.button.style.touchAction = 'none'; // 🚀 Cero lag en móviles
    this.button.title = this.translate.instant('MAP.SHARE') || 'Share Location'; // Accesibilidad

    // 🚀 Usamos pointerdown para respuesta instantánea y arrow function
    this.button.addEventListener('pointerdown', (e) => this.handleMainButtonClick(e), { capture: true });
    
    // Fallback de seguridad para toques fantasmas
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

    // 🚀 Eventos de los botones internos optimizados
    const btnYes = this.popup.querySelector('#btnShareYes') as HTMLButtonElement;
    const btnNo = this.popup.querySelector('#btnShareNo') as HTMLButtonElement;

    btnYes?.addEventListener('pointerdown', async (e) => {
      e.preventDefault();
      e.stopPropagation(); // Evita clics en el mapa subyacente
      
      const success = await this.locationSharing.startSharing(); 
      if (success) {
        this.updateUI();
      }
      this.hideConfirmation();
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
    
    if (this.locationService.isSharing) {
      await this.locationSharing.stopSharing();
      this.updateUI();
    } else {
      this.showConfirmation();
    }
  }

  // 🚀 Función pública para que otros componentes puedan forzar el refresco
  public updateUI() {
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