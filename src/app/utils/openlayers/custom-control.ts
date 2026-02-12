/*
import { Control } from 'ol/control';
import { TrackingControlService } from '../../services/trackingControl.service';
import { TranslateService } from '@ngx-translate/core'; // Importa el servicio, no el módulo

export class LocationButtonControl extends Control {
  constructor(
    private trackingService: TrackingControlService,
    private translate: TranslateService
  ) {
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
      // Cambia el texto de ayuda según el estado
      button.title = running 
        ? this.translate.instant('MAP_CONTROLS.STOP_TRACKING') 
        : this.translate.instant('MAP_CONTROLS.CENTER_LOCATION');
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
  */
import { Control } from 'ol/control';
import { TrackingControlService } from '../../services/trackingControl.service';
import { TranslateService } from '@ngx-translate/core';
import { Subscription } from 'rxjs';

export class LocationButtonControl extends Control {
  private subscription: Subscription;
  private button: HTMLButtonElement;

  constructor(
    private trackingService: TrackingControlService,
    private translate: TranslateService
  ) {
    const element = document.createElement('div');
    element.className = 'ol-control location-button-control';

    super({ element: element });

    this.button = document.createElement('button');
    this.button.type = 'button';
    // Importante para evitar retrasos en móviles
    this.button.style.touchAction = 'none';
    
    element.appendChild(this.button);

    this.subscription = this.trackingService.isRunning$.subscribe(running => {
      this.updateUI(running);
    });

    // --- MANEJO DE EVENTO DE BAJO NIVEL ---
    // pointerdown es el evento más rápido que existe (se dispara al tocar)
    const handlePress = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      
      console.log('📍 Acción inmediata detectada');

      if (this.trackingService.getIsRunning()) {
        this.trackingService.stop();
      } else {
        this.trackingService.start();
      }
    };

    // Usamos pointerdown para respuesta instantánea
    this.button.addEventListener('pointerdown', handlePress, { capture: true });
    
    // Fallback para navegadores antiguos
    this.button.addEventListener('touchstart', (e) => {
      e.preventDefault();
      e.stopPropagation();
    }, { passive: false });
  }

  private updateUI(isRunning: boolean) {
    const color = isRunning ? "#3880ff" : "#999999";
    const path = this.trackingService.arrowPath || "M12,2L4.5,20.29L5.21,21L12,18L18.79,21L19.5,20.29L12,2Z";

    this.button.innerHTML = `
      <svg viewBox="0 0 24 24" width="24" height="24" style="pointer-events: none; display: block; margin: auto;">
        <path fill="${color}" d="${path}"></path>
      </svg>
    `;
    
    this.button.style.opacity = isRunning ? "1" : "0.6";
  }

  override setMap(map: any) {
    super.setMap(map);
    if (!map && this.subscription) {
      this.subscription.unsubscribe();
    }
  }
}