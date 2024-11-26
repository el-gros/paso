import { Component, EnvironmentInjector, inject } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { SocialSharing } from '@awesome-cordova-plugins/social-sharing/ngx';

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
   }


}