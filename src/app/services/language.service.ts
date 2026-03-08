import { Injectable } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { BehaviorSubject, Observable, firstValueFrom, of } from 'rxjs';
import { catchError, timeout } from 'rxjs/operators';
import { Device } from '@capacitor/device';
import { FunctionsService } from './functions.service';

@Injectable({ providedIn: 'root' })
export class LanguageService {
  
  // --- CONFIGURACIÓN ---
  private readonly SUPPORTED_LANGS = ['en', 'es', 'ca', 'fr', 'ru', 'zh']; 
  private readonly DEFAULT_LANG = 'en';

  // --- ESTADO REACTIVO ---
  private _currentLang = new BehaviorSubject<string>(this.DEFAULT_LANG);
  
  /**
   * Observable para que los componentes se suscriban a cambios de idioma
   */
  public readonly currentLang$: Observable<string> = this._currentLang.asObservable();
  
  constructor(
    private translate: TranslateService,
    private fs: FunctionsService
  ) {
    // Establecemos el fallback por si falta alguna llave en los JSON secundarios
    this.translate.setDefaultLang(this.DEFAULT_LANG);
  }

  /**
   * INICIALIZACIÓN: Llama a esto desde app.component.ts
   * Se encarga de preparar el storage y cargar el idioma correcto.
   */
  async initLanguage(): Promise<void> {
    try {
      // 1. Asegurar que el storage de Capacitor esté listo
      await this.fs.init(); 
      
      // 2. Intentar recuperar el idioma guardado por el usuario
      const storedLang = await this.fs.storeGet('lang');
      
      if (storedLang) {
        await this.setLanguage(storedLang);
      } else {
        // 3. Si es la primera vez, detectar el del dispositivo
        await this.determineLanguage();
      }
    } catch (err) {
      console.error("[LanguageService] Error en init, usando default:", err);
      await this.setLanguage(this.DEFAULT_LANG);
    }
  }

  /**
   * Getter síncrono para obtener el código de idioma actual
   */
  get currentLangValue(): string {
    return this._currentLang.value;
  }

  /**
   * CAMBIAR IDIOMA: Limpia el código, lo guarda y carga el JSON de traducción.
   */
  async setLanguage(lang: string): Promise<void> {
    // Limpiamos formatos tipo 'es-ES' a 'es'
    const cleanLang = lang.split('-')[0].toLowerCase();
    const finalLang = this.SUPPORTED_LANGS.includes(cleanLang) ? cleanLang : this.DEFAULT_LANG;
    
    // Guardamos la preferencia (sin bloquear la ejecución)
    this.fs.storeSet('lang', finalLang);
    
    try {
      // Cargamos el archivo JSON de assets/i18n/
      // Usamos timeout para que la app no se cuelgue si el archivo no carga
      await firstValueFrom(
        this.translate.use(finalLang).pipe(
          timeout(2000),
          catchError(err => {
            console.error(`[LanguageService] Error al cargar JSON para ${finalLang}:`, err);
            return of(null);
          })
        )
      );
      
      // Notificamos el cambio a toda la app
      this._currentLang.next(finalLang);
      
    } catch (e) {
      console.error("[LanguageService] Error crítico en setLanguage:", e);
    }
  }

  /**
   * DETECTAR IDIOMA DEL MÓVIL: Lee el código de idioma del hardware.
   */
  public async determineLanguage(): Promise<void> {
    try {
      const info = await Device.getLanguageCode();
      await this.setLanguage(info.value);
    } catch (error) {
      console.error('[LanguageService] Error detectando hardware:', error);
      await this.setLanguage(this.DEFAULT_LANG); 
    }
  }
}