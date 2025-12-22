import { Component, EnvironmentInjector, inject } from '@angular/core';
import { ScreenOrientation } from '@capacitor/screen-orientation';
import { FunctionsService } from './services/functions.service';
import { IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { LocationManagerService } from './services/location-manager.service';
import { App } from '@capacitor/app';

@Component({
  selector: 'app-root',
  standalone: true,
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  imports: [
    IonicModule,
    CommonModule,
    FormsModule,
    TranslateModule
  ],
})
export class AppComponent {
  public environmentInjector = inject(EnvironmentInjector);

  constructor(
    public fs: FunctionsService,
    public locationService: LocationManagerService,
  ) {
    this.lockToPortrait();
    this.initStorage();
    App.addListener('appStateChange', ({ isActive }) => {
//      if (isActive) {
//        this.locationService.checkLocationPermissionStatus(); 
//      }
    });
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
