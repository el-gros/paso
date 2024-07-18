import { Component, EnvironmentInjector, inject } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { Storage } from '@ionic/storage-angular';
//import { SQLiteConnection, SQLiteDBConnection } from '@capacitor-community/sqlite';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule ],
  providers: [Storage,
//    SQLiteConnection, SQLiteDBConnection
  ]
})
export class AppComponent {
  public environmentInjector = inject(EnvironmentInjector);

  constructor(

  ) { 
   }



}