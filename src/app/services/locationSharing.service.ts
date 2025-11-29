import { Injectable } from "@angular/core";
import { Device } from "@capacitor/device";
import { FunctionsService } from './functions.service';
import { TranslateService } from '@ngx-translate/core';
import { SocialSharing } from '@awesome-cordova-plugins/social-sharing/ngx';
import { SupabaseService } from './supabase.service';
import { Subscription } from 'rxjs';
import { LocationManagerService } from './location-manager.service'
import { Location } from 'src/globald';

@Injectable({ 
  providedIn: 'root'
})
export class LocationSharingService {
    
    isSharing = false;
    shareToken: string | null = null;
    deviceId: string | null = null;
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
      this.deviceId = info.identifier;
    }

    async startSharing() {
      if (!this.deviceId) await this.init();
      this.shareToken = crypto.randomUUID(); // unguessable token
      this.isSharing = true;

      // optional: store token locally so you can stop later
      await this.fs.storeSet('share_token', this.shareToken);

      // Send URL to share
      const text = this.translate.instant('RECORD.SHARE_TEXT') +
        ' https://el-gros.github.io/visor/visor.html?t=' + this.shareToken;
      try {
        await this.socialSharing.share(
          text
        );
        // Subscribe to LocationService
        this.subscription = this.locationService.latestLocation$.subscribe(async loc => {
          if (!loc) return;
          await this.shareLocationIfActive(loc)
        });
      } catch (err) {
        console.error('Sharing failed', err);
      }

    } 

  async stopSharing() {
    if (!this.shareToken) return;
    // Optional: mark the share as inactive
    await this.supabaseService.supabase
      .from('shares')
      .update({ active: false })
      .eq('share_token', this.shareToken);
    // Clear token locally so no further locations are shared
    await this.fs.storeSet('share_token', null);
    this.shareToken = null;
    this.isSharing = false;
    // Unsubscribe from location service 
    if (this.subscription) {
      this.subscription.unsubscribe();
      this.subscription = null;
    }
  }

    // call this from your background geolocation callback
    async shareLocationIfActive(location: Location ) {
      if (!this.isSharing || !this.shareToken) return;
      try {
        await this.supabaseService.supabase
          .from('public_locations')
          .insert([{
            share_token: this.shareToken,
            owner_user_id: this.deviceId,
            lat: location.latitude,
            lon: location.longitude,
            updated_at: new Date().toISOString()
          }]);
          console.log('location updated at supabase: ', location)
      } catch (err) {
        console.error('Share failed', err);
      }
    }

}