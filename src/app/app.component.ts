import { Component, EnvironmentInjector, inject } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { ScreenOrientation } from '@capacitor/screen-orientation';
import { FunctionsService } from './services/functions.service'; // <-- adjust path as needed
import { SocialSharing } from '@awesome-cordova-plugins/social-sharing/ngx';
import { FilePath } from '@awesome-cordova-plugins/file-path/ngx';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  imports: [IonicModule, CommonModule],
  providers: [SocialSharing, FilePath]
})
export class AppComponent {
  public environmentInjector = inject(EnvironmentInjector);

  constructor(
    private fs: FunctionsService,
    private socialSharing: SocialSharing
  ) {
    this.lockToPortrait();
    this.initStorage();            // <-- call storage init on startup
  }

  async lockToPortrait() {
    try {
      await ScreenOrientation.lock({ orientation: 'portrait' });
      console.log('Screen orientation locked to portrait');
    } catch (err) {
      console.error('Error locking orientation:', err);
    }
  }

  private async initStorage() {
    try {
      await this.fs.init();
      console.log('Storage initialized');
    } catch (err) {
      console.error('Failed to initialize storage:', err);
    }
  }

    async shareFiles() {
    try {
      const mapFile = 'file:///storage/emulated/0/Android/data/your.app/files/map.png';
      const dataFile = 'file:///storage/emulated/0/Android/data/your.app/files/data.png';

      // WhatsApp: only supports ONE file at a time
      await this.socialSharing.shareViaWhatsApp('Here is the map', mapFile);

      // if you want to send the second one separately:
      await this.socialSharing.shareViaWhatsApp('Here is the data', dataFile);

    } catch (err) {
      console.error('Error sharing:', err);
    }
  }

}
