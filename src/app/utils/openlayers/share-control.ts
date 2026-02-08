import { Control } from 'ol/control';
import { TranslateService } from '@ngx-translate/core';
import { LocationManagerService } from 'src/app/services/location-manager.service';

export class ShareControl extends Control {
  // Callbacks para conectar con los servicios externos
  public onShareStart?: () => Promise<boolean | void>;
  public onShareStop?: () => Promise<void>;
  
  private isSharing = false;
  private button: HTMLButtonElement;
  private popup!: HTMLDivElement;
  private backdrop!: HTMLDivElement;

  constructor(
    private locationService: LocationManagerService,
    private translate: TranslateService
  ) {
    const element = document.createElement('div');
    element.className = 'share-control ol-unselectable ol-control';

    super({ element: element });

    // 1. Botón principal
    this.button = document.createElement('button');
    this.button.type = 'button';
    this.button.className = 'share-main-button';
    
    this.button.addEventListener('click', this.handleMainButtonClick.bind(this), false);
    
    // Bloqueo de propagación para OpenLayers
    element.addEventListener('pointerdown', (e) => e.stopPropagation());
    element.addEventListener('mousedown', (e) => e.stopPropagation());

    element.appendChild(this.button);

    // 2. Inicializar Interfaz de confirmación
    this.initConfirmationUI();
    
    // 3. Sincronizar estado actual y dibujar
    this.isSharing = this.locationService.isSharing;
    this.updateUI();
  }

  private initConfirmationUI() {
    // Backdrop (Fondo oscuro)
    this.backdrop = document.createElement('div');
    this.backdrop.className = 'share-backdrop';
    this.backdrop.addEventListener('click', () => this.hideConfirmation());
    document.body.appendChild(this.backdrop);

    // Popup de Confirmación
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
          <button id="btnShareYes" class="nav-item-btn green-pill">
            <ion-icon name="checkmark-sharp" style="font-size: 32px; pointer-events: none;"></ion-icon>
            <p style="pointer-events: none;">${txtYes}</p>
          </button>
          
          <button id="btnShareNo" class="nav-item-btn red-pill">
            <ion-icon name="close-sharp" style="font-size: 32px; pointer-events: none;"></ion-icon>
            <p style="pointer-events: none;">${txtNo}</p>
          </button>
        </div>
      </div>
    `;

    this.popup.querySelector('#btnShareYes')?.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (this.onShareStart) {
        const success = await this.onShareStart(); 
        if (success !== false) {
          this.isSharing = true; 
          this.updateUI();
        }
      }
      this.hideConfirmation();
    });

    this.popup.querySelector('#btnShareNo')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.hideConfirmation();
    });
  }

  private async handleMainButtonClick(event: Event) {
    event.preventDefault();
    event.stopPropagation();

    if (this.isSharing) {
      if (this.onShareStop) await this.onShareStop();
      this.isSharing = false;
      this.updateUI();
    } else {
      this.showConfirmation();
    }
  }

  private showConfirmation() {
    this.backdrop.classList.add('active');
    this.popup.classList.add('active');
  }

  private hideConfirmation() {
    this.backdrop.classList.remove('active');
    this.popup.classList.remove('active');
  }

  private updateUI() {
    if (this.isSharing) {
      // Icono de compartir estándar (Azul)
      this.button.innerHTML = `
        <ion-icon name="share-social-sharp" 
                  style="font-size: 24px; color: #3880ff; pointer-events: none;">
        </ion-icon>
      `;
      this.button.style.backgroundColor = '#f0f7ff';
      this.button.style.border = '1px solid #3880ff';
    } else {
      // Icono de compartir con barra roja diagonal (Tachado)
      this.button.innerHTML = `
        <div style="position: relative; display: flex; align-items: center; justify-content: center; width: 24px; height: 24px;">
          <ion-icon name="share-social-sharp" 
                    style="font-size: 24px; color: #999; opacity: 0.5; pointer-events: none;">
          </ion-icon>
          <div style="
            position: absolute;
            width: 28px;
            height: 2px;
            background-color: #ff4444;
            transform: rotate(-45deg);
            box-shadow: 0 0 2px white;
            pointer-events: none;
          "></div>
        </div>
      `;
      this.button.style.backgroundColor = '#ffffff';
      this.button.style.border = '1px solid #ccc';
    }
  }
}