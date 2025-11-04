/**
 * Service for managing application language settings.
 *
 * Initializes the language based on stored preferences or device settings,
 * provides observables for the current language, and allows updating and persisting
 * the selected language using TranslateService and FunctionsService.
 */

import { Injectable } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { BehaviorSubject } from 'rxjs';
import { FunctionsService } from './functions.service'; // adjust the path if needed
import { Device } from '@capacitor/device';
import { firstValueFrom } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class LanguageService {
  private currentLang$ = new BehaviorSubject<string>('en');

  constructor(
    private translate: TranslateService,
    public fs: FunctionsService
  ) {
    this.initLanguage();
  }

  /*
   initLanguage
   getCurrentLanguage
   getCurrentLangValue
   setLanguage
   determineLanguage
  */

  private async initLanguage() {
    const storedLang = await this.fs.storeGet('lang');
    if (storedLang) {
      await this.setLanguage(storedLang);
    } else {
      await this.determineLanguage();
    }
  }

  getCurrentLanguage() {
    return this.currentLang$.asObservable();
  }

  getCurrentLangValue(): string {
    return this.currentLang$.value;
  }

  async setLanguage(lang: string) {
    await this.fs.storeSet('lang', lang);
    await firstValueFrom(this.translate.use(lang));
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
