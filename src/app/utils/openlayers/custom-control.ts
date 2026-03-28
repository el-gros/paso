import { Control } from 'ol/control';
import { Map } from 'ol';
import Overlay from 'ol/Overlay'; // 👈 ¡NUEVO! Importamos Overlay
import { TrackingControlService } from '../../services/trackingControl.service';
import { TranslateService } from '@ngx-translate/core';
import { SearchService } from '../../services/search.service';
import { Subscription, firstValueFrom } from 'rxjs';

export class LocationButtonControl extends Control {
  private subscription: Subscription;
  private button: HTMLButtonElement;
  private svgPath: SVGPathElement;
  private labelElement: HTMLDivElement;
  private labelOverlay: Overlay; // 👈 Referencia a la superposición en el mapa
  private labelTimeout: any;

  constructor(
    private trackingService: TrackingControlService,
    private translate: TranslateService,
    private searchService: SearchService
  ) {
    const element = document.createElement('div');
    element.className = 'ol-control location-button-control';
    super({ element: element });

    // 1. CONFIGURACIÓN DEL BOTÓN
    this.button = document.createElement('button');
    this.button.type = 'button';
    this.button.title = this.translate.instant('MAP.TRACKING_BTN') || 'Location'; 
    this.button.style.touchAction = 'none';

    this.button.innerHTML = `
      <svg viewBox="0 0 24 24" width="24" height="24" style="pointer-events: none; display: block; margin: auto;">
        <path d="M12,2L4.5,20.29L5.21,21L12,18L18.79,21L19.5,20.29L12,2Z" fill="#999999"></path>
      </svg>
    `;
    this.svgPath = this.button.querySelector('path') as SVGPathElement;
    element.appendChild(this.button);

    // 2. CONFIGURACIÓN DEL RÓTULO (Píldora gráfica)
    this.labelElement = document.createElement('div');
    Object.assign(this.labelElement.style, {
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      padding: '8px 16px',
      borderRadius: '20px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
      fontSize: '15px',
      fontWeight: '800',
      color: '#333',
      whiteSpace: 'normal',
      maxWidth: '80vw',
      textAlign: 'center',
      lineWeight: '1.4',
      opacity: '0',
      pointerEvents: 'none',
      transition: 'opacity 0.3s ease-in-out',
      // Ya no necesitamos posiciones absolutas de pantalla, OpenLayers lo colocará
    });

    // 3. CREACIÓN DEL OVERLAY DE OPENLAYERS
    this.labelOverlay = new Overlay({
      element: this.labelElement,
      positioning: 'bottom-center', // 👈 Anclamos el centro inferior al punto
      offset: [0, -25], // 👈 Lo elevamos 25 píxeles para que flote SOBRE el punto azul
      stopEvent: false
    });

    // 4. EVENTOS Y SUSCRIPCIONES
    this.subscription = this.trackingService.isRunning$.subscribe(running => {
      this.updateUI(running);
    });

    const handlePress = async (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      
      if (this.trackingService.getIsRunning()) {
        this.trackingService.stop();
      } else {
        this.trackingService.start();
        this.showLocationLabel();
      }
    };

    this.button.addEventListener('pointerdown', handlePress, { capture: true });
    this.button.addEventListener('touchstart', (e) => {
      e.preventDefault();
      e.stopPropagation();
    }, { passive: false });
  }

  // ACTUALIZACIÓN QUIRÚRGICA DE UI
  private updateUI(isRunning: boolean) {
    const color = isRunning ? "#3880ff" : "#999999";
    const pathData = this.trackingService.arrowPath || "M12,2L4.5,20.29L5.21,21L12,18L18.79,21L19.5,20.29L12,2Z";

    this.svgPath.setAttribute('fill', color);
    this.svgPath.setAttribute('d', pathData);
    this.button.style.opacity = isRunning ? "1" : "0.6";
  }

  // ==========================================
  // MOTOR DEL RÓTULO (ANCLADO AL MAPA)
  // ==========================================

  private async showLocationLabel() {
    const map = this.getMap();
    if (!map) return;

    // Ponemos el texto inicial y lo hacemos visible
    this.labelElement.textContent = (this.translate.instant('RECORD.SEARCHING_PLACE') as string) || 'Buscando lugar...';
    this.labelElement.style.opacity = '1';

    try {
      // Damos 300ms a que el mapa termine la animación de centrado
      await new Promise(resolve => setTimeout(resolve, 300));

      const center = map.getView().getCenter();
      if (!center) throw new Error("No map center");

      // 🚀 Clavamos el Overlay en las coordenadas centrales
      this.labelOverlay.setPosition(center);

      // 🚀 ¡AQUÍ ESTÁ LA CORRECCIÓN!
      // Al usar geographic(), center ya es directamente [longitud, latitud]
      const lon = center[0];
      const lat = center[1];
      
      const placeName = await this.fetchPlaceName(lat, lon);

      this.labelElement.textContent = `📍 ${placeName}`;

    } catch (error) {
      console.warn('Error al obtener el rótulo', error);
      this.labelElement.textContent = (this.translate.instant('RECORD.UNKNOWN_PLACE') as string) || 'Lugar desconocido';
    }

    // Ocultamos a los 4 segundos
    if (this.labelTimeout) clearTimeout(this.labelTimeout);
    this.labelTimeout = setTimeout(() => {
      this.labelElement.style.opacity = '0';
    }, 4000);
  }

  private async fetchPlaceName(lat: number, lon: number): Promise<string> {
    try {
      const result = await firstValueFrom(this.searchService.reverseGeocode(lat, lon));
      if (result) {
        const shortName: string = result.short_name ?? '';
        const longName: string = result.name ?? '';
        if (shortName !== '' && shortName !== '(no name)') return shortName;
        if (longName !== '') return longName;
      }
      return (this.translate.instant('RECORD.UNKNOWN_PLACE') as string) || 'Lugar desconocido';
    } catch (error) {
      return (this.translate.instant('RECORD.UNKNOWN_PLACE') as string) || 'Lugar desconocido';
    }
  }

  // ==========================================
  // INYECCIÓN Y LIMPIEZA DEL CONTROL EN EL MAPA
  // ==========================================
  
  override setMap(map: Map | null) {
    // 1. Si quitamos el control, retiramos también su Overlay
    const oldMap = this.getMap();
    if (oldMap) {
      oldMap.removeOverlay(this.labelOverlay);
    }

    super.setMap(map);

    if (map) {
      // 2. Al añadir el control al mapa, insertamos nuestro Overlay (aunque esté oculto al 0% de opacidad)
      map.addOverlay(this.labelOverlay);
    } else {
      if (this.subscription) this.subscription.unsubscribe();
      if (this.labelTimeout) clearTimeout(this.labelTimeout);
    }
  }
}