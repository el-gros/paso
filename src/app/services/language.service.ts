import { Injectable } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { BehaviorSubject } from 'rxjs';
import { FunctionsService } from './functions.service';
import { Device } from '@capacitor/device';
import { firstValueFrom } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class LanguageService {
  private currentLang$ = new BehaviorSubject<string>('en');
  private readonly SUPPORTED_LANGS = ['en', 'es', 'ca', 'fr', 'ru', 'zh']; 
  
  constructor(
    private translate: TranslateService,
    public fs: FunctionsService
  ) {
    // No llamamos a initLanguage aquí para evitar condiciones de carrera 
    // con la inicialización del Storage de FunctionsService.
  }

  async initLanguage() {
    // Aseguramos que el storage esté listo antes de pedir nada
    await this.fs.init(); 
    
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
    const cleanLang = lang.split('-')[0].toLowerCase();
    const finalLang = this.SUPPORTED_LANGS.includes(cleanLang) ? cleanLang : 'en';
    
    await this.fs.storeSet('lang', finalLang);
    
    try {
      // Configuramos el idioma por defecto por si faltan llaves en el elegido
      this.translate.setDefaultLang('en');
      await firstValueFrom(this.translate.use(finalLang));
    } catch (e) {
      console.error("Error cargando el archivo JSON de traducción:", e);
    }
    
    this.currentLang$.next(finalLang);
  }

  async determineLanguage() {
    try {
      const info = await Device.getLanguageCode();
      // Aplicamos directamente el código del dispositivo (setLanguage ya limpia y valida)
      await this.setLanguage(info.value);
    } catch (error) {
      console.error('Error detectando idioma del dispositivo:', error);
      await this.setLanguage('en'); 
    }
  }
}