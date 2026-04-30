import { Injectable, inject } from '@angular/core';
import { TextToSpeech } from '@capacitor-community/text-to-speech';
import { TranslateService } from '@ngx-translate/core';

@Injectable({
  providedIn: 'root'
})
export class TtsService {
  private translate = inject(TranslateService);

  // Mapeo para que el motor de voz use el acento correcto
  private langMap: { [key: string]: string } = {
    'es': 'es-ES',
    'en': 'en-US',
    'ca': 'ca-ES',
    'fr': 'fr-FR',
    'ru': 'ru-RU',
    'zh': 'zh-CN'
  };

  async speak(text: string) {
    if (!text) return;

    try {
      // Detectamos el idioma actual de la app
      const currentLang = this.translate.currentLang || 'es';
      const speechLang = this.langMap[currentLang] || 'es-ES';

      await TextToSpeech.speak({
        text: text,
        lang: speechLang,
        rate: 1.0, 
        pitch: 1.0,
        volume: 1.0,
        category: 'ambient',
      });
    } catch (error) {
      console.error('Error en TTS:', error);
    }
  }
}