import {
  enableProdMode,
  importProvidersFrom,
  provideZoneChangeDetection,
} from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { RouteReuseStrategy, provideRouter } from '@angular/router';
import { IonicModule, IonicRouteStrategy } from '@ionic/angular';
import { IonicStorageModule } from '@ionic/storage-angular';
import { routes } from './app/app.routes';
import { AppComponent } from './app/app.component';
import { environment } from './environments/environment';
import {
  provideHttpClient,
  withInterceptorsFromDi,
} from '@angular/common/http';

// 1. Import the new standalone translation providers
import { provideTranslateService } from '@ngx-translate/core';
import { provideTranslateHttpLoader } from '@ngx-translate/http-loader';

//import { SocialSharing } from '@awesome-cordova-plugins/social-sharing/ngx';
//import { FilePath } from '@awesome-cordova-plugins/file-path/ngx';
//import { File } from '@awesome-cordova-plugins/file/ngx';

if (environment.production) {
  enableProdMode();
}

bootstrapApplication(AppComponent, {
  providers: [
    provideZoneChangeDetection(),
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },

    importProvidersFrom(IonicModule.forRoot({})),
    importProvidersFrom(IonicStorageModule.forRoot()),

    // Correct HttpClient provider for standalone (required)
    provideHttpClient(withInterceptorsFromDi()),

    // 2. Use the new v17 provider functions instead of the factory
    provideTranslateService({
      loader: provideTranslateHttpLoader({
        prefix: './assets/i18n/',
        suffix: '.json'
      })
    }),

    provideRouter(routes),
  ],
}).catch((err) => console.error(err));