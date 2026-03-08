import { Injectable } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { Device } from '@capacitor/device';
import { Share } from '@capacitor/share';

// --- PLUGINS & ENV ---
import MyService from 'src/plugins/MyServicePlugin';
import { global } from '../../environments/environment';

// --- SERVICES ---
import { FunctionsService } from './functions.service';
import { SupabaseService } from './supabase.service';
import { LocationManagerService } from './location-manager.service';

@Injectable({ 
  providedIn: 'root'
})
export class LocationSharingService {
    
  constructor(
    private fs: FunctionsService,
    private translate: TranslateService,
    private supabaseService: SupabaseService,
    private locationService: LocationManagerService
  ) {}
    
  // ==========================================================================
  // 1. INICIALIZACIÓN
  // ==========================================================================
  async init(): Promise<void> {
    try {
      const info = await Device.getId();
      // Usamos el identificador único del dispositivo para trackear quién envía los puntos
      this.locationService.deviceId = info.identifier;
    } catch (error) {
      console.error('[LocationSharing] Error obteniendo ID del dispositivo:', error);
      this.locationService.deviceId = 'unknown_device';
    }
  }

  // ==========================================================================
  // 2. CONTROL DE COMPARTICIÓN (START / STOP)
  // ==========================================================================
  async startSharing(): Promise<boolean> {
    try {
      if (!this.locationService.deviceId) {
        await this.init();
      }

      const newToken = this.locationService.shareToken || this.generateSafeToken();
      
      this.locationService.shareToken = newToken;
      this.locationService.isSharing = true;

      // 1. EL DISPARO INICIAL: Subida inmediata del primer punto
      await this.sendInitialPointToSupabase(newToken);

      // 2. ENVIAR CONFIGURACIÓN AL PLUGIN NATIVO
      await MyService.updateSharingConfig({
        isSharing: true,
        shareToken: newToken,
        deviceId: this.locationService.deviceId ?? undefined,
        supabaseUrl: global.supabaseUrl,
        supabaseKey: global.supabaseKey
      });

      // 3. ABRIR MENÚ NATIVO PARA COMPARTIR ENLACE
      await this.openShareMenu(newToken);

      return true;

    } catch (err) {
      console.error("❌ Error activando sharing nativo:", err);
      // Revertimos el estado por si falla a medias
      this.locationService.isSharing = false;
      return false;
    }
  }

  async stopSharing(): Promise<void> {
    this.locationService.isSharing = false;
    this.locationService.shareToken = null;
    
    try {
      // 🚀 AVISAR AL PLUGIN QUE SE DETENGA
      await MyService.updateSharingConfig({ isSharing: false });
      this.fs.displayToast(this.translate.instant('SHARE.STOPPED'), 'warning');
    } catch (error) {
      console.error("❌ Error deteniendo sharing en el plugin nativo:", error);
    }
  }

  // ==========================================================================
  // 3. MÉTODOS PRIVADOS (Helpers)
  // ==========================================================================
  
  /**
   * Generador de Token a prueba de fallos
   */
  private generateSafeToken(): string {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
  }

  /**
   * Extrae la posición actual e inyecta el primer punto en Supabase
   */
  private async sendInitialPointToSupabase(token: string): Promise<void> {
    const loc = await this.locationService.getCurrentPosition(); 
    
    if (!loc) {
      console.warn("⏳ No hay ubicación GPS disponible todavía para el disparo inicial.");
      return;
    }

    try {
      // Desestructuramos el array asumiendo el estándar geográfico [longitud, latitud]
      const [longitud, latitud] = loc;

      await this.supabaseService.getClient().from('public_locations').insert([{
        share_token: token,
        owner_user_id: this.locationService.deviceId ?? 'unknown',
        lat: latitud, 
        lon: longitud,
        updated_at: new Date().toISOString()
      }]);
      
      console.log("📍 Primer punto inyectado en Supabase al instante");
    } catch (e) {
      console.warn("⚠️ Fallo subiendo el punto inicial rápido:", e);
    }
  }

  /**
   * Prepara los textos y lanza el diálogo nativo de iOS/Android para compartir
   */
  private async openShareMenu(token: string): Promise<void> {
    // Fallbacks para la traducción (evita que Share.share falle en silencio si la clave está vacía)
    const shareTitle = this.translate.instant('SHARE.TITLE_MODAL') || 'Seguimiento en vivo';
    const shareText = this.translate.instant('RECORD.SHARE_TEXT') || 'Sigue mi ruta en directo:';
    const url = `https://el-gros.github.io/visor/visor.html?t=${token}`;

    await Share.share({
      title: shareTitle,
      text: shareText,
      url: url,
      dialogTitle: shareTitle // A Android le gusta tener este campo también
    });
  }
}