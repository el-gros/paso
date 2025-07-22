import { Injectable } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { BehaviorSubject } from 'rxjs';
import { FunctionsService } from './functions.service'; // adjust the path if needed
import { Device } from '@capacitor/device';

@Injectable({ providedIn: 'root' })
export class LanguageService {
  private currentLang$ = new BehaviorSubject<string>('en');

  constructor(
    private translate: TranslateService,
    private fs: FunctionsService
  ) {
//    this.fs.storeGet('lang').then((storedLang) => {
//      const lang = storedLang || 'en';
//      this.setLanguage(lang);
//    });
  }

  getCurrentLanguage() {
    return this.currentLang$.asObservable();
  }

  getCurrentLangValue(): string {
    return this.currentLang$.value;
  }

  async setLanguage(lang: string) {
    await this.fs.storeSet('lang', lang);
    this.translate.use(lang)
    this.currentLang$.next(lang);
  }

  async determineLanguage() {
    try {
      const info = await Device.getLanguageCode();
      let deviceLanguage = info.value.split('-')[0]; // base code like "es"
      console.log('Device Language:', deviceLanguage);
      // Optional mapping/override
      deviceLanguage = await this.fs.check(deviceLanguage, 'lang');
      // Apply language
      await this.setLanguage(deviceLanguage);
    } catch (error) {
      console.error('Error determining language:', error);
    }
  }

}
