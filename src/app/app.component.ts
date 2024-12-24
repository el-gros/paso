import { Component, EnvironmentInjector, inject } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { SocialSharing } from '@awesome-cordova-plugins/social-sharing/ngx';
import { ScreenOrientation } from '@capacitor/screen-orientation';
//import { HttpClientModule} from '@angular/common/http';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule ],
  providers: [ SocialSharing
//    SQLiteConnection, SQLiteDBConnection
  ]
})
export class AppComponent {
  public environmentInjector = inject(EnvironmentInjector);

  constructor() {      
    this.lockToPortrait();
  }
  
  async lockToPortrait() {
    try {
      await ScreenOrientation.lock({ orientation: 'portrait' });
      console.log('Screen orientation locked to portrait');
    } catch (err) {
      console.error('Error locking orientation:', err);
    }
  }

}