import { Injectable, NgZone } from '@angular/core';
import { Subject } from 'rxjs';

// --- INTERNAL IMPORTS ---
import { GeographyService } from './geography.service';
import { PresentService } from './present.service';
import { FunctionsService } from './functions.service';
import { ReferenceService } from './reference.service';
import { LocationManagerService } from './location-manager.service';
import MyService, { Location as PluginLocation } from '../../plugins/MyServicePlugin';

@Injectable({ providedIn: 'root' })
export class TrackingEngineService {
  
  // ==========================================================================
  // 1. ESTADO Y EVENTOS
  // ==========================================================================

  /** Notifica a los componentes que los datos del track han cambiado (para ChangeDetection) */
  public readonly onTrackUpdated$ = new Subject<void>();
  public firstPointReceived = false;

  // ==========================================================================
  // 2. HANDLERS NATIVOS
  // ==========================================================================
  private locListener: any;
  private routeListener: any;

  constructor(
    private zone: NgZone,
    private geography: GeographyService,
    private present: PresentService,
    private fs: FunctionsService,
    private reference: ReferenceService,
    private location: LocationManagerService
  ) {}

  // ==========================================================================
  // 3. CICLO DE VIDA DEL MOTOR
  // ==========================================================================

  /**
   * Inicializa los listeners y arranca el servicio nativo de seguimiento.
   */
  public async startEngine() {
    this.firstPointReceived = false;
    await MyService.removeAllListeners();
    
    await this.setupLocationListener();
    await this.setupRouteListener();

    try {
      await MyService.startService();
    } catch (err) {
      console.error("❌ Error al iniciar el servicio nativo:", err);
    }
  }

  public stopEngine() {
    if (this.locListener) this.locListener.remove();
    if (this.routeListener) this.routeListener.remove();
  }

  // ==========================================================================
  // 4. CONFIGURACIÓN DE LISTENERS
  // ==========================================================================

  /** Configura la recepción de puntos GPS desde el plugin nativo */
  private async setupLocationListener() {
    this.locListener = await MyService.addListener('location', (location: PluginLocation) => {
      this.zone.run(async () => {
        if (!location) return;

        const cleanLocation: PluginLocation = {
          latitude: Number(location.latitude),
          longitude: Number(location.longitude),
          accuracy: Number(location.accuracy) || 0,
          altitude: Number(location.altitude) || 0,
          altitudeAccuracy: Number(location.altitudeAccuracy) || 0,
          bearing: Number(location.bearing) || 0,
          speed: Number(location.speed) || 0,
          time: Number(location.time) || Date.now(),
          simulated: !!location.simulated
        };

        if (isNaN(cleanLocation.longitude) || isNaN(cleanLocation.latitude)) return;

        const success = this.location.processRawLocation(cleanLocation);
        
        if (success) {
          if (!this.firstPointReceived && this.geography.map) {
            console.log("🎯 Primer punto detectado. Centrando mapa...");
            this.geography.map?.getView().animate({
              center: [cleanLocation.longitude, cleanLocation.latitude],
              zoom: 17,
              duration: 1000
            });
            this.firstPointReceived = true;
          }

          if (this.location.state === 'tracking') {
            await this.present.updateTrack(cleanLocation);
          }
          
          this.geography.map?.render();
          this.onTrackUpdated$.next(); // 🔔 Tocar timbre para actualizar UI
        }
      }); 
    });
  }

  /** Configura las actualizaciones de estado de navegación (dentro/fuera de ruta) */
  private async setupRouteListener() {
    this.routeListener = await MyService.addListener('routeStatusUpdate', (data) => {
      this.zone.run(() => {
        this.fs.routeStatus = data.status;
        this.fs.matchIndex = data.matchIndex;

        const track = this.reference.archivedTrack;
        if (data.status === 'green' && data.matchIndex >= 0 && track) {
          const trackData = track.features[0].geometry.properties.data;
          const total = track.features[0].properties.totalDistance;
          this.fs.kmRecorridos = trackData[data.matchIndex].distance;
          this.fs.kmRestantes = total - this.fs.kmRecorridos;
        }
      });
    });
  }
}