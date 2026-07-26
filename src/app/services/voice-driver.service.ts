// src/app/services/voice/voice-driver.service.ts
import { Injectable, inject } from '@angular/core';
import { SpeechRecognition } from '@capacitor-community/speech-recognition';
import { TranslateService } from '@ngx-translate/core';

@Injectable({
  providedIn: 'root'
})
export class VoiceDriverService {
  private translate = inject(TranslateService);
  
  public isListening = false;
  private isToggling = false;

  /**
   * Enciende el micrófono y devuelve el texto escuchado o una cadena vacía.
   */
  public async listen(): Promise<string> {
    if (this.isListening || this.isToggling) return '';
    this.isToggling = true;

    try {
      const permissions = await SpeechRecognition.checkPermissions();
      if (permissions.speechRecognition !== 'granted') {
        await SpeechRecognition.requestPermissions();
      }
      
      this.isListening = true;
      const result = await SpeechRecognition.start({
        language: this.getLocale(this.translate.currentLang),
        partialResults: false,
        popup: false 
      });
      
      this.isListening = false;
      return (result.matches && result.matches.length > 0) ? result.matches[0] : '';
    } catch (error) {
      console.error("Error en el reconocimiento de voz (Driver):", error);
      this.isListening = false;
      return '';
    } finally {
      setTimeout(() => { this.isToggling = false; }, 500);
    }
  }

  /**
   * Detiene la escucha activa del micrófono.
   */
  public async stopListening(): Promise<void> {
    if (!this.isListening) return;
    try { 
      await SpeechRecognition.stop(); 
      this.isListening = false; 
    } catch (e) {
      console.error("Error al detener escucha:", e);
    }
  }

  /**
   * Reproduce texto por voz aplicando correcciones fonéticas según el idioma.
   */
  public speak(text: string): Promise<void> {
    return new Promise((resolve) => {
      const synth = window?.speechSynthesis;
      if (!synth || !text) {
        resolve();
        return;
      }

      try {
        // 1. Limpieza global de emojis y símbolos que rompen el Web Speech API en móviles
        const cleanText = text.replace(/[\u1000-\uFFFF]|\p{Emoji_Presentation}|\p{Extended_Pictographic}/gu, '').trim();
        if (!cleanText) {
          resolve();
          return;
        }

        // 2. Si ya está hablando, cancelamos la locución anterior
        if (synth.speaking || synth.pending) {
          synth.cancel();
        }

        const fixedText = this.applyPhoneticFixes(cleanText);
        const utterance = new SpeechSynthesisUtterance(fixedText);
        utterance.lang = this.getLocale(this.translate.currentLang);
        utterance.rate = 0.9;
        
        utterance.onend = () => resolve();
        utterance.onerror = (error) => {
          console.error("Error en TTS (Driver):", error);
          resolve();
        };

        // ⚠️ CLAVE: Subimos a 200ms. 50ms es insuficiente en móviles cuando se ha hecho 
        // un synth.cancel() y provoca que el sistema silencie la nueva locución.
        setTimeout(() => { synth.speak(utterance); }, 200);
      } catch (error) {
        console.error("Error en TTS (Driver):", error);
        resolve();
      }
    });
  }

  private getLocale(lang: string | undefined): string {
    const map: { [key: string]: string } = { 'es': 'es-ES', 'en': 'en-US', 'ca': 'ca-ES', 'fr': 'fr-FR', 'ru': 'ru-RU', 'zh': 'zh-CN' };
    return map[lang || 'es'] || 'es-ES';
  }

  private applyPhoneticFixes(text: string): string {
    const lang = this.translate.currentLang;
    let fixedText = text;
    if (lang === 'ca' || lang === 'es') {
      fixedText = fixedText.replace(/zoom/gi, 'zum'); 
    }
    return fixedText;
  }
}