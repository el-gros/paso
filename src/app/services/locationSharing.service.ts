import { Injectable } from "@angular/core";
import { Device } from "@capacitor/device";
import { FunctionsService } from './functions.service';
import { TranslateService } from '@ngx-translate/core';
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

  async startSharing(): Promise<boolean> {
    try {
      if (!this.locationService.deviceId) await this.init();

      // 👇 EL FIX: Guardia de seguridad contra dobles ejecuciones
      // Si ya estamos compartiendo, NO generamos un token nuevo.
      // Solo volvemos a abrir el diálogo con el token actual.
      if (this.locationService.isSharing && this.locationService.shareToken) {
        console.log("Ya hay un token activo. Re-abriendo menú de compartir...");
        try {
          await Share.share({
            title: this.translate.instant('SHARE.TITLE_MODAL') || 'Seguimiento',
            text: this.translate.instant('RECORD.SHARE_TEXT') || 'Mi ruta:',
            url: `https://el-gros.github.io/visor/visor.html?t=${this.locationService.shareToken}`,
          });
        } catch (e) {
          console.warn("Menú nativo ya abierto o cancelado", e);
        }
        return true; 
      }
      // 👆 FIN DEL FIX

      // A partir de aquí, la lógica normal para crear un token desde cero
      const newToken = crypto.randomUUID();
      const location = await firstValueFrom(this.locationService.latestLocation$).catch(() => null);

      // 1. CONFIGURAR TOKEN Y ACTIVAR YA EL SERVICIO
      this.locationService.shareToken = newToken;
      this.locationService.isSharing = true; 
      await this.fs.storeSet('share_token', newToken);

      // 2. INSERTAR PRIMER PUNTO
      if (location) {
        await this.supabaseService.supabase
          .from('public_locations')
          .insert([{
            share_token: newToken,
            owner_user_id: this.locationService.deviceId,
            lat: location.latitude,
            lon: location.longitude,
            updated_at: new Date().toISOString()
          }]);
      }

      // 3. INTENTAR MOSTRAR EL DIÁLOGO
      try {
        const url = `https://el-gros.github.io/visor/visor.html?t=${newToken}`;
        const canShare = await Share.canShare();
        if (canShare.value) {
          await Share.share({
            title: this.translate.instant('SHARE.TITLE_MODAL') || 'Seguimiento',
            text: this.translate.instant('RECORD.SHARE_TEXT') || 'Mi ruta:',
            url: url,
          });
        }
      } catch (shareError) {
        console.warn("El diálogo de compartir no se pudo mostrar, pero el tracking está activo", shareError);
      }

      return true; 
    } catch (err) {
      console.error("Fallo crítico en base de datos:", err);
      this.locationService.isSharing = false; 
      return false;
    }
  }

  async stopSharing() {
    // 1. Limpiar estados. Al poner isSharing en false, LocationManager dejará de enviar puntos.
    this.locationService.isSharing = false;
    this.locationService.shareToken = null;
    await this.fs.storeSet('share_token', null);
    this.fs.displayToast(this.translate.instant('SHARE.STOPPED'), 'warning');
  }
}