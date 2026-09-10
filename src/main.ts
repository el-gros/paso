import {
  enableProdMode,
  importProvidersFrom,
  provideZoneChangeDetection,
} from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { RouteReuseStrategy, provideRouter } from '@angular/router';

// 👇 CAMBIO 1: Importamos IonicRouteStrategy y provideIonicAngular desde /standalone
import {
  IonicRouteStrategy,
  provideIonicAngular,
} from '@ionic/angular/standalone';

import { IonicStorageModule } from '@ionic/storage-angular';
import { routes } from './app/app.routes';
import { AppComponent } from './app/app.component';
import { environment } from './environments/environment';
import {
  provideHttpClient,
  withInterceptorsFromDi,
  withXhr,
} from '@angular/common/http';

// 1. Import the new standalone translation providers
import { provideTranslateService } from '@ngx-translate/core';
import { provideTranslateHttpLoader } from '@ngx-translate/http-loader';

// 👇 AQUÍ: 1. Importas la función de tus iconos
import { registerIonicIcons } from './app/app.icons';

if (environment.production) {
  enableProdMode();
}

// 👇 AQUÍ: 2. Ejecutas la función justo antes de arrancar la app
registerIonicIcons();

bootstrapApplication(AppComponent, {
  providers: [
    provideZoneChangeDetection(),
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },

    // 👇 CAMBIO 2: Inyectamos el core de Ionic (Esto habilita PopoverController, ModalController, etc.)
    provideIonicAngular({}),

    importProvidersFrom(IonicStorageModule.forRoot()),

    // Correct HttpClient provider for standalone (required)
    provideHttpClient(withXhr(), withInterceptorsFromDi()),

    // 2. Use the new v17 provider functions instead of the factory
    provideTranslateService({
      loader: provideTranslateHttpLoader({
        prefix: './assets/i18n/',
        suffix: '.json',
      }),
    }),

    provideRouter(routes),
  ],
}).catch((err) => console.error(err));
