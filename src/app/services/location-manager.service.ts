import { Injectable } from '@angular/core';
import { BehaviorSubject, firstValueFrom } from 'rxjs';
import { filter, timeout } from 'rxjs/operators';
import { PopoverController } from '@ionic/angular';
import { TranslateService } from '@ngx-translate/core';
import { GeoidService } from './geoid.service';

// --- PLUGIN & INTERFACES ---
import MyService, { Location } from 'src/plugins/MyServicePlugin';
import { Track } from 'src/globald';

// --- SERVICES & COMPONENTS ---
import { ReferenceService } from '../services/reference.service';
import { FunctionsService } from '../services/functions.service';
import { GpsPopoverComponent } from '../gps-popover.component'; // Ajustado path (..// a ../)

@Injectable({
  providedIn: 'root'
})
export class LocationManagerService {

  // ==========================================================================
  // 1. CONFIGURACIÓN
  // ==========================================================================
  public threshold: number = 40;
  public altitudeThreshold: number = 40;
  public threshDist: number = 0.0000002;
  private readonly ALERT_COOLDOWN_MS: number = 10 * 60 * 1000; // 10 minutos

  // ==========================================================================
  // 2. ESTADO GENERAL (State)
  // ==========================================================================
  private _stateSubject = new BehaviorSubject<string>('inactive');
  public state$ = this._stateSubject.asObservable();

  get state(): string {
    return this._stateSubject.value;
  }
  
  set state(value: string) {
    if (this._stateSubject.value !== value) {
      this._stateSubject.next(value);
    }
  }

  // ==========================================================================
  // 3. DATOS DE SEGUIMIENTO (Públicos para Tab1 y otros componentes)
  // ==========================================================================
  public currentPoint: number = 0;
  public averagedSpeed: number = 0;
  public stopped: number = 0;
  
  public isSharing: boolean = false;
  public shareToken: string | null = null;
  public deviceId: string | null = null;
  
  public foreground: boolean = true;

  // ==========================================================================
  // 4. API REACTIVA DE UBICACIÓN
  // ==========================================================================
  private latestLocationSubject = new BehaviorSubject<Location | null>(null);
  public latestLocation$ = this.latestLocationSubject.asObservable();

  // ==========================================================================
  // 5. VARIABLES INTERNAS (Privadas)
  // ==========================================================================
  private invalidLocationCount: number = 0;
  private lastAlertTime: number = 0;

  constructor(
    private reference: ReferenceService,
    private fs: FunctionsService,
    private translate: TranslateService,
    private popoverController: PopoverController,
    private geoidService: GeoidService
  ) { }

  // ==========================================================================
  // MÉTODOS PÚBLICOS
  // ==========================================================================

  /**
   * Recibe y evalúa un punto GPS en bruto desde el plugin nativo.
   */
  public processRawLocation(raw: Location): boolean {
    const isBadQuality = (
      raw.accuracy > this.threshold ||
      !raw.altitude || raw.altitude === 0 ||
      raw.altitudeAccuracy > this.altitudeThreshold ||
      !raw.time
    );

    if (isBadQuality) {
        this.invalidLocationCount++;
        return false;
    }

    // --- CHIVATO DE DEPURACIÓN ---
    const altOriginal = raw.altitude;
    let origenDato = raw.isMSL ? "🤖 NATIVO ANDROID 15" : "🔴 ELIPSOIDE CRUDO";

    if (!raw.isMSL && this.foreground) {
      raw.altitude = this.geoidService.getCorrectedAltitude(raw.latitude, raw.longitude, raw.altitude);
      origenDato = "🧮 CORREGIDO POR TS (10 Grados)";
      raw.isMSL = true; 
    }

    // Imprimimos por consola de Chrome Inspect exactamente qué pasa
    console.log(`📍 GPS: ${origenDato} | Alt Original: ${altOriginal.toFixed(2)}m -> Alt Final: ${raw.altitude.toFixed(2)}m | Precisión GPS: ${raw.accuracy.toFixed(1)}m`);
    // -----------------------------

    this.invalidLocationCount = 0;
    this.latestLocationSubject.next(raw);
    return true;
  }
  
  /**
   * Intenta obtener la posición actual de forma síncrona/esperando un instante.
   */
  public async getCurrentPosition(): Promise<[number, number] | null> {
    // 1. Valor inmediato
    const last = this.latestLocationSubject.value;
    if (last) {
      return [last.longitude, last.latitude];
    }

    // 2. Esperar al siguiente (arranque en frío)
    try {
      const nextLoc = await firstValueFrom(
        this.latestLocation$.pipe(
          filter((v): v is Location => !!v), // Type guard vital para Typescript
          timeout(2000)
        )
      );
      return [nextLoc.longitude, nextLoc.latitude];
    } catch (err) {
      this.fs.displayToast(this.translate.instant('LOCATION.ERROR_TIMEOUT'), 'error');
      return null;
    }
  }

  /**
   * Añade el punto procesado al Track GeoJSON y recalcula el Bounding Box.
   */
  public async fillGeojson(track: Track | undefined, location: Location): Promise<Track | undefined> {
    if (!track) return undefined;
    
    // Add minimal data
    track.features[0].geometry.properties.data.push({
      altitude: location.altitude,
      speed: location.speed,
      time: location.time,
      compSpeed: location.speed,
      compAltitude: location.altitude,
      distance: 0,
      geoidApplied: true, 
      isMSL: location.isMSL || false
    });
    
    // Add coordinates
    track.features[0].geometry.coordinates.push([location.longitude, location.latitude]);
    
    // Update bbox
    const bbox = track.features[0].bbox || [Infinity, Infinity, -Infinity, -Infinity];
    track.features[0].bbox = [
      Math.min(bbox[0], location.longitude),
      Math.min(bbox[1], location.latitude),
      Math.max(bbox[2], location.longitude),
      Math.max(bbox[3], location.latitude)
    ];
    
    return track;
  }
  
  /**
   * Envía las coordenadas de la ruta cargada al plugin nativo para comparar desvíos.
   */
  public async sendReferenceToPlugin(): Promise<void> {
    const shouldSend = this.state === 'tracking' && this.fs.alert === 'on' && !!this.reference.archivedTrack;
    const coordinates = shouldSend ? this.reference.archivedTrack!.features[0].geometry.coordinates : [];
    
    try {
        await MyService.setReferenceTrack({ coordinates });
        console.log("📍 Track de referencia sincronizado con el servicio nativo");
    } catch (e) {
        console.error("❌ Error sincronizando track con nativo:", e);
    }
  }

  // ==========================================================================
  // MÉTODOS PRIVADOS
  // ==========================================================================

  private async checkAndShowGpsWarning(): Promise<void> {
    const now = Date.now();

    if (now - this.lastAlertTime > this.ALERT_COOLDOWN_MS) {
      this.lastAlertTime = now;
      this.invalidLocationCount = 0;

      if (this.foreground) {
        const popover = await this.popoverController.create({
          component: GpsPopoverComponent,
          cssClass: 'glass-island-wrapper',
          backdropDismiss: true,
          translucent: true
        });
        await popover.present();
      }
    }
  }

}