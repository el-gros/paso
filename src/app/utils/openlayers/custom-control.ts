import { Control } from 'ol/control';
import { TrackingControlService } from '../../services/trackingControl.service';

export class LocationButtonControl extends Control {
  constructor(private trackingService: TrackingControlService) {
    const element = document.createElement('div');
    element.className = 'ol-control location-button-control';

    super({ element: element });

    const button = document.createElement('button');
    const color = "#3880ff";

    button.innerHTML = `
      <svg viewBox="0 0 24 24" width="22" height="22" fill="${color}">
        <path d="${this.trackingService.arrowPath}"></path>
      </svg>
    `;

    element.appendChild(button);

    // 🚀 1. Iniciar activo al cargar
    setTimeout(() => this.trackingService.start(), 500);

    // 🔄 2. Sincronizar la opacidad del botón con el estado real del servicio
    this.trackingService.isRunning$.subscribe(running => {
      button.style.opacity = running ? "1" : "0.3";
    });

    // 👆 3. Lógica del Click (Toggle)
    button.addEventListener('click', () => {
      // .value nos da el estado actual del BehaviorSubject
      if ((this.trackingService as any).isRunning.value) {
        this.trackingService.stop();
      } else {
        this.trackingService.start();
      }
    });
  }
}