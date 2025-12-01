import { Control } from 'ol/control';
import { LocationManagerService } from '../../services/location-manager.service';
import { TranslateService } from '@ngx-translate/core';

export class ShareControl extends Control {

  public onShareStart?: () => void; // event to Tab1
  public onShareStop?: () => void;  // event to Tab1

  private isConfirming = false;
  private isSharing = false;

  private button: HTMLButtonElement;
  private popup: HTMLDivElement;
  private backdrop: HTMLDivElement;

  constructor(
    private locationService: LocationManagerService,
    private translate: TranslateService
  ) {

    // MAIN container
    const element = document.createElement('div');
    element.className = 'ol-unselectable ol-control share-control';

    // MAIN button
    const button = document.createElement('button');
    button.style.width = '30px';
    button.style.height = '30px';
    button.style.borderRadius = '50%';
    button.style.border = 'none';
    button.style.cursor = 'pointer';
    button.style.padding = '0';
    button.style.display = 'flex';
    button.style.justifyContent = 'center';
    button.style.alignItems = 'center';
    element.appendChild(button);

    super({ element });

    this.button = button;
    this.setButtonBlue();

    // ---------------------------------------------------
    // BACKDROP
    // ---------------------------------------------------
    this.backdrop = document.createElement('div');
    this.backdrop.style.position = 'fixed';
    this.backdrop.style.top = '0';
    this.backdrop.style.left = '0';
    this.backdrop.style.width = '100vw';
    this.backdrop.style.height = '100vh';
    this.backdrop.style.background = 'rgba(0,0,0,0.35)';
    this.backdrop.style.zIndex = '9998';
    this.backdrop.style.display = 'none';
    this.backdrop.style.pointerEvents = 'auto';
    document.body.appendChild(this.backdrop);

    this.backdrop.addEventListener('click', () => this.onConfirmNo());

    // ---------------------------------------------------
    // POPUP
    // ---------------------------------------------------
    this.popup = document.createElement('div');
    this.popup.style.position = 'fixed';
    this.popup.style.top = '50%';
    this.popup.style.left = '50%';
    this.popup.style.transform = 'translate(-50%, -50%)';
    this.popup.style.zIndex = '9999';
    this.popup.style.background = 'white';
    this.popup.style.padding = '5px';
    this.popup.style.borderRadius = '8px';
    this.popup.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
    this.popup.style.display = 'none';
    this.popup.style.width = '220px';
    this.popup.style.textAlign = 'center';
    this.popup.style.fontSize = '14px';
    document.body.appendChild(this.popup);

    const txtConfirm = this.translate.instant('MAP.CONFIRM_SHARING');
    const txtYes = this.translate.instant('MAP.YES');
    const txtNo = "No";

    this.popup.innerHTML = `
      <div style="margin:10px 0; font-weight:bold; font-size:15px;">
          ${txtConfirm}
      </div>

      <div style="display:flex; gap:12px; justify-content:center;">
          <button id="yesShare" style="
              display:flex; flex-direction:column;
              align-items:center; justify-content:center;
              width:60px; height:60px; border:none;
              border-radius:15px; font-weight:600;
              box-shadow:0 4px 10px rgba(0,0,0,0.2);
              background-color:green; color:white;">
              <img src="assets/icons/happy-outline.svg"
                style="width:22px;height:22px;margin-bottom:4px;" />
              <span>${txtYes}</span>
          </button>

          <button id="noShare" style="
              display:flex; flex-direction:column;
              align-items:center; justify-content:center;
              width:60px; height:60px; border:none;
              border-radius:15px; font-weight:600;
              box-shadow:0 4px 10px rgba(0,0,0,0.2);
              background-color:red; color:white;">
              <img src="assets/icons/sad-outline.svg"
                style="width:22px;height:22px;margin-bottom:4px;" />
              <span>${txtNo}</span>
          </button>
      </div>
    `;

    // Button events
    button.addEventListener('click', () => this.onMainButton());
    this.popup.querySelector('#yesShare')!.addEventListener('click', () => this.onConfirmYes());
    this.popup.querySelector('#noShare')!.addEventListener('click', () => this.onConfirmNo());
  }

  // ---------------------------------------------------
  // MAIN BUTTON LOGIC
  // ---------------------------------------------------
  private onMainButton() {
    if (this.isSharing) {
      // 🔥 Already sharing: clicking lock means STOP
      this.stopSharingState();
      return;
    }

    // Not sharing: show confirmation popup
    this.showConfirmation();
  }

  // ---------------------------------------------------
  // POPUP
  // ---------------------------------------------------
  private showConfirmation() {
    this.isConfirming = true;
    this.backdrop.style.display = 'block';
    this.popup.style.display = 'block';
    document.body.style.overflow = 'hidden';
  }

  private hideConfirmation() {
    this.isConfirming = false;
    this.popup.style.display = 'none';
    this.backdrop.style.display = 'none';
    document.body.style.overflow = '';
  }

  // ---------------------------------------------------
  // CONFIRMATION BUTTONS
  // ---------------------------------------------------
  private onConfirmYes() {
    this.hideConfirmation();

    this.isSharing = true;
    this.setButtonLocked();   // 🔥 new icon

    if (this.onShareStart) this.onShareStart();
  }

  private onConfirmNo() {
    this.hideConfirmation();

    if (!this.isSharing) {
      this.setButtonBlue(); // Do nothing, stay blue
      return;
    }
  }

  // ---------------------------------------------------
  // STOP SHARING (button lock clicked)
  // ---------------------------------------------------
  private stopSharingState() {
    this.isSharing = false;
    this.setButtonBlue();

    if (this.onShareStop) this.onShareStop();
  }

  // ---------------------------------------------------
  // BUTTON STYLES
  // ---------------------------------------------------
  private setButtonBlue() {
    this.button.innerHTML = `
      <img src="assets/icons/lock-closed-outline-blue.svg"
           style="width:22px;height:22px;" />
    `;
    this.button.style.backgroundColor = 'transparent';
  }

  private setButtonLocked() {
    this.button.innerHTML = `
      <img src="assets/icons/share-outline-blue.svg"
           style="width:22px;height:22px;" />
    `;
    this.button.style.backgroundColor = 'transparent';
  }
}
