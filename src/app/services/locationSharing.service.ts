import { Injectable } from "@angular/core";
import { Device } from "@capacitor/device";
import { FunctionsService } from './functions.service';
import { TranslateService } from '@ngx-translate/core';
import MyService from 'src/plugins/MyServicePlugin'; 
import { global } from '../../environments/environment';
import { SupabaseService } from './supabase.service';
import { Subscription, take } from 'rxjs'; // Añadimos take
import { LocationManagerService } from './location-manager.service'
import { Share } from '@capacitor/share';
import { firstValueFrom } from 'rxjs';

@Injectable({ 
  providedIn: 'root'
})
export class LocationSharingService {
    
    // Ya no necesitamos la variable 'subscription' porque el flujo es pasivo a través de LocationManager

    constructor(
        private fs: FunctionsService,
        private translate: TranslateService,
        private supabaseService: SupabaseService,
        private locationService: LocationManagerService
    ) {}
    
    async init() {
      const info = await Device.getId();
      // Usamos el identificador único del dispositivo para trackear quién envía los puntos
      this.locationService.deviceId = info.identifier;
    }

  // En LocationSharingService
async startSharing(): Promise<boolean> {
    try {
      if (!this.locationService.deviceId) await this.init();

      // 🛡️ PARACAÍDAS 1: Generador de Token a prueba de fallos
      const generateSafeToken = () => {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) {
          return crypto.randomUUID();
        }
        return Math.random().toString(36).substring(2) + Date.now().toString(36);
      };

      const newToken = this.locationService.shareToken || generateSafeToken();
      this.locationService.shareToken = newToken;
      this.locationService.isSharing = true;

      // 🚀 EL DISPARO INICIAL: Subida inmediata del primer punto desde TS
      // ⚠️ IMPORTANTE: Cambia 'currentLocation' por la variable exacta donde guardas la lat/lon actual en LocationManagerService
      const loc = await this.locationService.getCurrentPosition(); 
      
      if (loc) {
        try {
          // 2. Extraemos los datos del array. 
          // OJO: Asumo el estándar [longitud, latitud]. Si en tu base de datos salen al revés, intercámbialos.
          const longitud = loc[0]; 
          const latitud = loc[1];

          await this.supabaseService.getClient().from('public_locations').insert([{
            share_token: newToken,
            owner_user_id: this.locationService.deviceId ?? 'unknown',
            lat: latitud, 
            lon: longitud,
            updated_at: new Date().toISOString()
          }]);
          console.log("📍 Primer punto inyectado en Supabase al instante");
        } catch (e) {
          console.warn("Fallo subiendo el punto inicial rápido:", e);
        }
      } else {
        console.warn("⏳ No hay ubicación GPS disponible todavía para el disparo inicial.");
      }
      
      // 🚀 ENVIAR CONFIGURACIÓN AL PLUGIN NATIVO
      await MyService.updateSharingConfig({
        isSharing: true,
        shareToken: newToken,
        deviceId: this.locationService.deviceId ?? undefined,
        supabaseUrl: global.supabaseUrl,
        supabaseKey: global.supabaseKey
      });

      // 🛡️ PARACAÍDAS 2: Fallbacks para la traducción (evita que Share.share falle en silencio si la clave está vacía)
      const shareTitle = this.translate.instant('SHARE.TITLE_MODAL') || 'Seguimiento en vivo';
      const shareText = this.translate.instant('RECORD.SHARE_TEXT') || 'Sigue mi ruta en directo:';

      // Abrir menú nativo de compartir
      const url = `https://el-gros.github.io/visor/visor.html?t=${newToken}`;
      await Share.share({
        title: shareTitle,
        text: shareText,
        url: url,
        dialogTitle: shareTitle // A Android le gusta tener este campo también
      });

      return true;
    } catch (err) {
      console.error("❌ Error activando sharing nativo:", err);
      // Revertimos el estado por si falla a medias
      this.locationService.isSharing = false;
      return false;
    }
  }

  async stopSharing() {
    this.locationService.isSharing = false;
    this.locationService.shareToken = null;
    
    // 🚀 AVISAR AL PLUGIN QUE SE DETENGA
    await MyService.updateSharingConfig({ isSharing: false });
    
    this.fs.displayToast(this.translate.instant('SHARE.STOPPED'), 'warning');
  }

}