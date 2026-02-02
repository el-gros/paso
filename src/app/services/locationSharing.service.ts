import { Injectable } from "@angular/core";
import { Device } from "@capacitor/device";
import { FunctionsService } from './functions.service';
import { TranslateService } from '@ngx-translate/core';
import { SocialSharing } from '@awesome-cordova-plugins/social-sharing/ngx';
import { SupabaseService } from './supabase.service';
import { Subscription } from 'rxjs';
import { LocationManagerService } from './location-manager.service'

@Injectable({ 
  providedIn: 'root'
})
export class LocationSharingService {
    

    subscription: Subscription | null = null;

    constructor(
        private fs: FunctionsService,
        private translate: TranslateService,
        private socialSharing: SocialSharing,
        private supabaseService: SupabaseService,
        private locationService: LocationManagerService
    ) {}
    
    async init() {
      const info = await Device.getId();
      this.locationService.deviceId = info.identifier;
    }

  async startSharing() {
    if (!this.locationService.deviceId) await this.init();
    
    // Generar token
    this.locationService.shareToken = crypto.randomUUID();
    this.locationService.isSharing = true;

    await this.fs.storeSet('share_token', this.locationService.shareToken);

    // Construir mensaje traducido
    const baseText = this.translate.instant('RECORD.SHARE_TEXT');
    const url = `https://el-gros.github.io/visor/visor.html?t=${this.locationService.shareToken}`;
    const fullMessage = `${baseText} ${url}`;

    try {
      await this.socialSharing.share(fullMessage);
    } catch (err) {
      console.error('Sharing failed', err);
      // Usamos una clave de error que ya deberías tener en tu sistema de traducción
      this.fs.displayToast('MAP.ERROR_IMPORT'); 
    }
  }

  async stopSharing() {
    if (!this.locationService.shareToken) return;
    // Optional: mark the share as inactive
    await this.supabaseService.supabase
      .from('shares')
      .update({ active: false })
      .eq('share_token', this.locationService.shareToken);
    // Clear token locally so no further locations are shared
    await this.fs.storeSet('share_token', null);
    this.locationService.shareToken = null;
    this.locationService.isSharing = false;
    // Unsubscribe from location service 
    if (this.subscription) {
      this.subscription.unsubscribe();
      this.subscription = null;
    }
  }


}