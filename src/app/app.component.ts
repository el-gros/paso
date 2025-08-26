import { Component, EnvironmentInjector, inject } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { ScreenOrientation } from '@capacitor/screen-orientation';
import { FunctionsService } from './services/functions.service'; // <-- adjust path as needed

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  imports: [IonicModule, CommonModule],
  providers: []
})
export class AppComponent {
  public environmentInjector = inject(EnvironmentInjector);

  constructor(
    private fs: FunctionsService   // <-- inject service
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
}
