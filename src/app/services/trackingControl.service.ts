import { Injectable } from '@angular/core';
import { BehaviorSubject, Subscription } from 'rxjs';
import { Feature } from 'ol';
import Point from 'ol/geom/Point';
import { Style, Icon } from 'ol/style';

// --- INTERNAL IMPORTS ---
import { LocationManagerService } from './location-manager.service';
import { GeographyService } from './geography.service';
import { Location } from 'src/plugins/MyServicePlugin'; // Para tipar el payload del GPS

@Injectable({ 
  providedIn: 'root' 
})
export class TrackingControlService {
  
  // ==========================================================================
  // 1. ESTADO Y CONTROL
  // ==========================================================================
  private isRunning = new BehaviorSubject<boolean>(false);
  public readonly isRunning$ = this.isRunning.asObservable();

  private subscription: Subscription | null = null;
  private shouldCenterOnNextUpdate: boolean = false;

  // ==========================================================================
  // 2. OPENLAYERS (Caché y Marcadores)
  // ==========================================================================
  private locationFeature: Feature<Point> | null = null;
  private cachedStyle: Style | null = null; // 🚀 Novedad: Caché del estilo para ahorrar CPU

  // 🔹 Path compartido para que el botón y el marcador sean idénticos
  public readonly arrowPath = "M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z"; 
  private readonly markerColor = "#3880ff"; 

  constructor(
    private location: LocationManagerService,
    private geography: GeographyService,
  ) {}

  // ==========================================================================
  // 3. API PÚBLICA (Start / Stop)
  // ==========================================================================

  public async start(): Promise<void> {
    if (this.isRunning.value) return;
    
    this.isRunning.next(true);
    this.shouldCenterOnNextUpdate = true;
    this.ensureMarkerCreated();

    // 🚀 Tipamos 'loc' con la interfaz Location en lugar de 'any'
    this.subscription = this.location.latestLocation$.subscribe((loc: Location | null) => {
      if (!loc || !this.locationFeature) return;
      
      const coords = [loc.longitude, loc.latitude];
      
      // 1. Actualizamos posición
      this.locationFeature.getGeometry()!.setCoordinates(coords);
      
      // 2. Actualizamos rotación (ahora es súper ligero)
      this.updateMarkerRotation(loc.bearing || 0);

      // 3. Centramos el mapa si es el primer latido
      if (this.shouldCenterOnNextUpdate) {
        this.geography.map?.getView().animate({ center: coords, zoom: 16, duration: 800 });
        this.shouldCenterOnNextUpdate = false;
      }
    });
  }

  public stop(): void {
    this.isRunning.next(false);
    
    // 1. Cortar la escucha del GPS
    if (this.subscription) {
      this.subscription.unsubscribe();
      this.subscription = null;
    }

    // 2. Eliminar físicamente la flecha azul del mapa
    if (this.locationFeature) {
      this.geography.locationLayer?.getSource()?.removeFeature(this.locationFeature);
      this.locationFeature = null; 
    }
  }

  public getIsRunning(): boolean {
    return this.isRunning.value;
  }

  // ==========================================================================
  // 4. MÉTODOS PRIVADOS (Helpers de OpenLayers)
  // ==========================================================================

  /**
   * Asegura que el Feature de la flecha existe en la capa correspondiente.
   */
  private ensureMarkerCreated(): void {
    const source = this.geography.locationLayer?.getSource();
    if (!source || this.locationFeature) return;
    
    this.locationFeature = new Feature(new Point([0, 0]));
    source.addFeature(this.locationFeature);
    
    // Aplicamos el estilo base (con rotación 0) por primera vez
    this.updateMarkerRotation(0);
  }

  /**
   * Rota el marcador de forma ultra-eficiente reciclando el objeto Style.
   */
  private updateMarkerRotation(bearing: number): void {
    if (!this.locationFeature) return;

    // Si el estilo no existe en caché, lo creamos UNA SOLA VEZ
    if (!this.cachedStyle) {
      const markerSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24"><path fill="${this.markerColor}" d="${this.arrowPath}"></path></svg>`;
      const svgUrl = 'data:image/svg+xml;base64,' + window.btoa(markerSvg);
      
      this.cachedStyle = new Style({
        image: new Icon({
          src: svgUrl,
          anchor: [0.5, 0.5],
          rotateWithView: true,
          scale: 1.2,
          crossOrigin: 'anonymous'
        })
      });
    }

    // Aplicamos la rotación matemática al icono ya existente
    const radians = bearing * (Math.PI / 180);
    this.cachedStyle.getImage()?.setRotation(radians);
    
    // Le decimos a OpenLayers que use este estilo
    this.locationFeature.setStyle(this.cachedStyle);
  }
}