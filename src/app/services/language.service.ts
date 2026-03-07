import { Injectable } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { BehaviorSubject, Observable, firstValueFrom } from 'rxjs';
import { Device } from '@capacitor/device';
import { FunctionsService } from './functions.service';

@Injectable({ providedIn: 'root' })
export class LanguageService {
  
  // --- CONSTANTS ---
  private readonly SUPPORTED_LANGS = ['en', 'es', 'ca', 'fr', 'ru', 'zh']; 
  private readonly DEFAULT_LANG = 'en';

  // --- STATE ---
  private _currentLang = new BehaviorSubject<string>(this.DEFAULT_LANG);
  
  // 🚀 Mejor práctica: Exponer el observable directamente como propiedad readonly
  public readonly currentLang$: Observable<string> = this._currentLang.asObservable();
  
  constructor(
    private translate: TranslateService,
    public fs: FunctionsService
  ) {
    // No llamamos a initLanguage aquí para evitar condiciones de carrera 
    // con la inicialización del Storage de FunctionsService.
  }

  // --- INITIALIZATION ---
  async initLanguage(): Promise<void> {
    // Aseguramos que el storage esté listo antes de pedir nada
    await this.fs.init(); 
    
    const storedLang = await this.fs.storeGet('lang');
    if (storedLang) {
      await this.setLanguage(storedLang);
    } else {
      await this.determineLanguage();
    }
  }

  // --- PUBLIC METHODS ---
  get currentLangValue(): string {
    return this._currentLang.value;
  }

  async setLanguage(lang: string): Promise<void> {
    const cleanLang = lang.split('-')[0].toLowerCase();
    const finalLang = this.SUPPORTED_LANGS.includes(cleanLang) ? cleanLang : this.DEFAULT_LANG;
    
    await this.fs.storeSet('lang', finalLang);
    
    try {
      // Configuramos el idioma por defecto por si faltan llaves en el elegido
      this.translate.setDefaultLang(this.DEFAULT_LANG);
      await firstValueFrom(this.translate.use(finalLang));
      
      // Emitimos el nuevo idioma a toda la app
      this._currentLang.next(finalLang);
    } catch (e) {
      console.error("[LanguageService] Error cargando el archivo JSON de traducción:", e);
    }
  }

  async determineLanguage(): Promise<void> {
    try {
      const info = await Device.getLanguageCode();
      // Aplicamos directamente el código del dispositivo (setLanguage ya limpia y valida)
      await this.setLanguage(info.value);
    } catch (error) {
      console.error('[LanguageService] Error detectando idioma del dispositivo:', error);
      await this.setLanguage(this.DEFAULT_LANG); 
    }
  }
}