import { Injectable } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { BehaviorSubject } from 'rxjs';
import { FunctionsService } from './functions.service'; // adjust the path if needed
import { Device } from '@capacitor/device';
import { firstValueFrom } from 'rxjs';

@Injectable({ providedIn: 'root' })

export class LanguageService {
  private currentLang$ = new BehaviorSubject<string>('en');
  private readonly SUPPORTED_LANGS = ['en', 'es', 'ca']; 
  
  constructor(
    private translate: TranslateService,
    public fs: FunctionsService
  ) {
    this.initLanguage();
  }

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
    // Basic normalization: ensures "en-US" becomes "en"
    const cleanLang = lang.split('-')[0].toLowerCase();
    const finalLang = this.SUPPORTED_LANGS.includes(cleanLang) ? cleanLang : 'en';
    await this.fs.storeSet('lang', finalLang);
    // Use firstValueFrom to ensure the translation file is loaded before moving on
    try {
      await firstValueFrom(this.translate.use(finalLang));
    } catch (e) {
      console.error("Could not load translation file", e);
    }
    this.currentLang$.next(finalLang);
  }

  async determineLanguage() {
    try {
      const info = await Device.getLanguageCode();
      let deviceLanguage = info.value; // base code like "es"
      console.log('Device Language:', deviceLanguage);
      // Optional mapping/override
      deviceLanguage = await this.fs.check(deviceLanguage, 'lang');
      // Apply language
      await this.setLanguage(deviceLanguage);
    } catch (error) {
      console.error('Error determining language:', error);
      await this.setLanguage('en'); // Safe fallback
    }
  }

}
