import { Injectable, NgZone } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { ReferenceService } from '../services/reference.service';
import { firstValueFrom, filter, timeout } from 'rxjs';
import MyService, { Location, RouteStatus } from 'src/plugins/MyServicePlugin';
import { FunctionsService } from '../services/functions.service';
import { TranslateService } from '@ngx-translate/core';
import { Track } from 'src/globald';
import { GpsPopoverComponent } from '..//gps-popover.component';
import { PopoverController } from '@ionic/angular';

@Injectable({
  providedIn: 'root'
})
export class LocationManagerService {

  threshold: number = 40;
  altitudeThreshold: number = 40;
  state: string = 'inactive';
  currentPoint: number = 0;
  averagedSpeed: number = 0;
  stopped: number = 0;
  threshDist: number = 0.0000002;
  isSharing = false;
  shareToken: string | null = null;
  deviceId: string | null = null;
  foreground: boolean = true;
  private invalidLocationCount: number = 0;
  private lastAlertTime: number = 0;
  private readonly ALERT_COOLDOWN_MS: number = 10 * 60 * 1000; // 10 minutos
  
  // ----------------------------------------------------------------------------
  // 1) PUBLIC API → components/services subscribe here
  // ----------------------------------------------------------------------------
  private latestLocationSubject = new BehaviorSubject<Location | null>(null);
  latestLocation$ = this.latestLocationSubject.asObservable();

  //public lastAccepted: Location | null = null;

  constructor(
    private reference: ReferenceService,
    private fs: FunctionsService,
    private translate: TranslateService,
    private popoverController: PopoverController
  ) { }

 
  // ----------------------------------------------------------------------------
  // 2) RAW + SAMPLING → (merged from the 3 services)
  // ----------------------------------------------------------------------------
  processRawLocation(raw: Location) {
    // 1. Filtros de calidad
    if (raw.accuracy > this.threshold ||
        !raw.altitude || raw.altitude == 0 ||
        raw.altitudeAccuracy > this.altitudeThreshold ||
        !raw.time) {
        
        // --- NUEVA LÓGICA DE FALLOS ---
        this.invalidLocationCount++;
        if (this.invalidLocationCount >= 5) {
          this.checkAndShowGpsWarning();
        }
        return false;
    }

    // --- REINICIAR CONTADOR SI LA LECTURA ES BUENA ---
    this.invalidLocationCount = 0;

    // 2. Notificar a la App (Mapa, etc)
    this.latestLocationSubject.next(raw);
    console.log('[LocationManager] new accepted location:', raw);

    return true;
  }

  // ----------------------------------------------------------------------------
  // 3) GESTIÓN DE AVISOS GPS
  // ----------------------------------------------------------------------------
  private async checkAndShowGpsWarning() {
    const now = Date.now();

    // Comprobar si han pasado 10 minutos desde la última alerta
    if (now - this.lastAlertTime > this.ALERT_COOLDOWN_MS) {
      this.lastAlertTime = now;
      this.invalidLocationCount = 0; // Reiniciamos para no saturar la lógica

      // Solo mostramos la alerta si la app está en primer plano
      if (this.foreground) {
        // Importamos el nuevo componente (ajusta la ruta según dónde lo hayas guardado)


        const popover = await this.popoverController.create({
          component: GpsPopoverComponent,
          cssClass: 'glass-island-wrapper', // Aplica tu ADN visual global
          backdropDismiss: true, // Permite cerrar tocando el fondo oscurecido, como tenías antes
          translucent: true
        });

        await popover.present();
      }
    }
  }

  async getCurrentPosition(): Promise<[number, number] | null> {
    // 1) Intentamos obtener el valor actual del Subject directamente
    const last = this.latestLocationSubject.value;
    
    if (last) {
      return [last.longitude, last.latitude];
    }

    // 2) Si no hay nada, esperamos al siguiente con un margen un poco mayor (ej. 2s)
    try {
      const nextLoc = await firstValueFrom(
        this.latestLocation$.pipe(
          filter(v => !!v),
          timeout(2000) // 1s a veces es poco para un arranque en frío
        )
      );
      return [nextLoc.longitude, nextLoc.latitude];
    } catch (err) {
      this.fs.displayToast(this.translate.instant('LOCATION.ERROR_TIMEOUT'), 'error');
      return null;
    }
  }

  async fillGeojson(track: Track | undefined, location: Location) {
    if (!track) return undefined;
    // Add minimal data
    track.features[0].geometry.properties.data.push({
      altitude: location.altitude,
      speed: location.speed,
      time: location.time,
      compSpeed: location.speed,  // Initial value; further processing can adjust it
      compAltitude: location.altitude, // Initial value; further processing can adjust it
      distance: 0  // Placeholder, will be computed later
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
    return track
  }
  
  async sendReferenceToPlugin() {
    let coordinates: number[][];
    if (this.state != 'tracking' || this.fs.alert != 'on' || !this.reference.archivedTrack) coordinates = []
    else coordinates = this.reference.archivedTrack.features[0].geometry.coordinates
    try {
        await MyService.setReferenceTrack({ coordinates: coordinates });
        console.log("📍 Track de referencia sincronizado con el servicio nativo");
    } catch (e) {
        console.error("❌ Error sincronizando track con nativo:", e);
    }
  }

}

    
