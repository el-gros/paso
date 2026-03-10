import { Control } from 'ol/control';
import { Map } from 'ol';
import { TrackingControlService } from '../../services/trackingControl.service';
import { TranslateService } from '@ngx-translate/core';
import { Subscription } from 'rxjs';

export class LocationButtonControl extends Control {
  private subscription: Subscription;
  private button: HTMLButtonElement;
  private svgPath: SVGPathElement; // 👈 Guardamos referencia directa al path

  constructor(
    private trackingService: TrackingControlService,
    private translate: TranslateService // 👈 ¡Ahora sí lo usaremos!
  ) {
    const element = document.createElement('div');
    element.className = 'ol-control location-button-control';
    super({ element: element });

    // 1. CONFIGURACIÓN DEL BOTÓN
    this.button = document.createElement('button');
    this.button.type = 'button';
    // Le añadimos accesibilidad/tooltip usando tu servicio de traducciones
    this.button.title = this.translate.instant('MAP.TRACKING_BTN') || 'Location'; 
    this.button.style.touchAction = 'none';

    // 2. CREACIÓN DEL SVG (Solo se crea una vez en memoria)
    this.button.innerHTML = `
      <svg viewBox="0 0 24 24" width="24" height="24" style="pointer-events: none; display: block; margin: auto;">
        <path d="M12,2L4.5,20.29L5.21,21L12,18L18.79,21L19.5,20.29L12,2Z" fill="#999999"></path>
      </svg>
    `;
    this.svgPath = this.button.querySelector('path') as SVGPathElement;
    element.appendChild(this.button);

    // 3. EVENTOS Y SUSCRIPCIONES
    this.subscription = this.trackingService.isRunning$.subscribe(running => {
      this.updateUI(running);
    });

    const handlePress = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      
      if (this.trackingService.getIsRunning()) {
        this.trackingService.stop();
      } else {
        this.trackingService.start();
      }
    };

    this.button.addEventListener('pointerdown', handlePress, { capture: true });
    this.button.addEventListener('touchstart', (e) => {
      e.preventDefault();
      e.stopPropagation();
    }, { passive: false });
  }

  // 4. ACTUALIZACIÓN QUIRÚRGICA DE UI
  private updateUI(isRunning: boolean) {
    const color = isRunning ? "#3880ff" : "#999999";
    const pathData = this.trackingService.arrowPath || "M12,2L4.5,20.29L5.21,21L12,18L18.79,21L19.5,20.29L12,2Z";

    // 🚀 Cambiamos solo los atributos, sin tocar el innerHTML
    this.svgPath.setAttribute('fill', color);
    this.svgPath.setAttribute('d', pathData);
    this.button.style.opacity = isRunning ? "1" : "0.6";
  }

  // 5. LIMPIEZA TOTAL
  override setMap(map: Map | null) {
    super.setMap(map);
    if (!map && this.subscription) {
      this.subscription.unsubscribe();
    }
  }
}