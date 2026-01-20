/*
import Control from 'ol/control/Control';
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import { Icon, Style } from 'ol/style';
import { GeographyService } from '../../services/geography.service';

export class CustomControl extends Control {
  private button: HTMLButtonElement;
  private positionFeature: Feature<Point>;

  public isActive = true;

  private sharpIcon = 'assets/icons/navigate-sharp-blue.svg';
  private outlineIcon = 'assets/icons/navigate-outline-blue.svg';

  /** Callbacks 
  private activateCallback?: () => void;
  private deactivateCallback?: () => void;

  constructor(
    private geography: GeographyService
  ) {
    const element = document.createElement('div');
    element.className = 'ol-unselectable ol-control custom-control';

    const button = document.createElement('button');
    button.style.width = '30px';
    button.style.height = '30px';
    button.style.border = 'none';
    button.style.borderRadius = '50%';
    button.style.backgroundColor = 'white';
    button.style.display = 'flex';
    button.style.justifyContent = 'center';
    button.style.alignItems = 'center';
    button.style.cursor = 'pointer';
    button.innerHTML = `<img src="assets/icons/navigate-sharp-blue.svg" style="width:22px;height:22px;" />`;

    element.appendChild(button);

    super({ element });
    this.button = button;

    // Handle clicks
    this.button.addEventListener('click', () => this.handleClick());

    // Marker feature
    this.positionFeature = new Feature();
    this.setMarkerIcon(this.sharpIcon);
    this.geography.locationLayer?.getSource()?.addFeature(this.positionFeature);
  }

  /** Public API for listening 
  public onActivate(cb: () => void) {
    this.activateCallback = cb;
  }

  public onDeactivate(cb: () => void) {
    this.deactivateCallback = cb;
  }

  public isControlActive(): boolean {
    return this.isActive;
  }

  /** -------- BUTTON CLICK LOGIC -------- 
  private handleClick() {
    if (this.isActive) {
      this.isActive = false;
      this.setButtonIcon(this.outlineIcon);
      this.deactivateCallback?.();
    } else {
      this.isActive = true;
      this.setButtonIcon(this.sharpIcon);
      this.activateCallback?.();
    }
  }

  /** -------- ICON HANDLING -------- 
  private setButtonIcon(iconPath: string) {
    this.button.innerHTML =
      `<img src="${iconPath}" style="width:22px;height:22px;" />`;
  }

  private setMarkerIcon(iconPath: string) {
    const style = new Style({
      image: new Icon({
        src: iconPath,
        size: [48, 48],
        anchor: [0.5, 0.5],
        rotateWithView: true,
        crossOrigin: 'anonymous',
      }),
    });
    this.positionFeature.setStyle(style);
  }


}*/

import Control from 'ol/control/Control';
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import { Icon, Style } from 'ol/style';
import { GeographyService } from '../../services/geography.service';
import { MapService } from '../../services/map.service'; // Inyectamos el servicio

export class CustomControl extends Control {
  private button: HTMLButtonElement;
  private positionFeature: Feature<Point>;
  public isActive = true;

  // Iconos SVG definidos como Strings para mayor control (más estrechos y apuntados)
  // El 'd' de este path es una flecha de navegación estilizada
  private arrowPath = "M12 2L7 22l5-4 5 4z";
  
  constructor(
    private geography: GeographyService,
    private mapService: MapService // Añadido
  ) {
    const element = document.createElement('div');
    element.className = 'ol-unselectable ol-control custom-control';

    const button = document.createElement('button');
    // ... estilos de botón (puedes moverlos a CSS para limpiar el TS)
    button.style.cssText = `
      width: 34px; height: 34px; border: none; border-radius: 50%;
      background: white; display: flex; justify-content: center;
      align-items: center; cursor: pointer; box-shadow: 0 2px 5px rgba(0,0,0,0.2);
    `;

    element.appendChild(button);
    super({ element });
    this.button = button;

    this.button.addEventListener('click', () => this.handleClick());

    this.positionFeature = new Feature();
    this.updateVisuals(); 

    // Añadir al mapa
    this.geography.locationLayer?.getSource()?.addFeature(this.positionFeature);
  }

  private handleClick() {
    this.isActive = !this.isActive;
    this.updateVisuals();

    // COMUNICACIÓN DIRECTA CON EL SISTEMA REACTIVO
    if (this.isActive) {
      this.mapService.locationActivated$.next();
    } else {
      this.mapService.locationDeactivated$.next();
    }
  }

  private updateVisuals() {
    const color = "#1e88e5"; // Azul navegación
    const opacity = this.isActive ? "1" : "0.4"; // Atenuado si está inactivo
    
    // Icono del botón (Flecha más estrecha)
    this.button.innerHTML = `
      <svg viewBox="0 0 24 24" width="22" height="22" fill="${color}" style="opacity: ${opacity}">
        <path d="${this.arrowPath}"></path>
      </svg>
    `;

    // Icono del Marcador en el mapa
    const markerSvg = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="48" height="48">
        <path fill="${color}" stroke="white" stroke-width="1" d="${this.arrowPath}"></path>
      </svg>
    `;

    const style = new Style({
      image: new Icon({
        src: 'data:image/svg+xml;base64,' + btoa(markerSvg),
        anchor: [0.5, 0.5],
        rotateWithView: true
      }),
    });
    this.positionFeature.setStyle(style);
  }

  // Ahora isControlActive() es útil para chequeos rápidos
  public isControlActive(): boolean {
    return this.isActive;
  }
}
