// src/app/services/voice/voice-parser.service.ts
import { Injectable, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { AppState } from './state.service';

@Injectable({
  providedIn: 'root'
})
export class VoiceParserService {
  private translate = inject(TranslateService);

  /**
   * Analiza el texto bruto escuchado y devuelve la acción correspondiente al estado actual.
   */
  public analyzeCommand(text: string, state: AppState): string | null {
    // 1. Limpieza total de caracteres especiales
    const clean = text.toLowerCase().trim().replace(/[.,\/#!$%\^&\*;:{}=\-_`~?¡¿]/g, "");

    // 2. Lógica para Estados de Confirmación (SÍ / NO)
    // Como SÍ/NO no siempre están en el JSON o pueden variar mucho, los blindamos aquí:
    if (['CONFIRM_STOP', 'CONFIRM_DELETE', 'TRACK_MENU', 'WAITING_SAVE'].includes(state)) {
      if (/^(s[íi]|yes|acord|vale|guardar|ok|d'acord|confirmar)$/.test(clean)) return 'yes';
      if (/^(no|cancelar|descartar|tancar)$/.test(clean)) return 'no';
    }

    // 3. Lógica Dinámica para el resto de Comandos desde el JSON
    // Obtenemos todo el objeto VOICE_COMMANDS del idioma actual
    const commands = this.translate.instant('VOICE_COMMANDS') as { [key: string]: string };

    if (commands) {
      for (const [key, synonymsString] of Object.entries(commands)) {
        // Convertimos la cadena "grabar, iniciar, comenzar..." en un array ["grabar", "iniciar", ...]
        const synonyms = synonymsString.split(',').map(s => s.trim().toLowerCase());

        // Si el texto del usuario incluye alguno de los sinónimos
        if (synonyms.some(syn => clean.includes(syn))) {
          
          // Mapeamos las claves del JSON a lo que espera tu VoiceRunner
          if (key === 'RECORD') return 'record';
          if (key === 'MAP') return 'map';
          if (key === 'ARCHIVE') return 'archive';
          if (key === 'DATA') return 'data';
          if (key === 'SETTINGS') return 'settings';
          if (key === 'STOP') return 'stop';
          if (key === 'HELP_COMMAND') return 'help';
          // Añade aquí cualquier otra clave si fuera necesario
        }
      }
    }

    return null;
  }

/**
   * Generates el mensaje de ayuda contextual leyendo frases fijas del JSON para evitar errores fonéticos.
   */
  public getHelpMessage(state: AppState): string {
    switch (state) {
      case 'TRACKING':
        return this.translate.instant('VOICE_COMMANDS.HELP_TRACKING');
      case 'CONFIRM_STOP':
        return this.translate.instant('VOICE_COMMANDS.HELP_CONFIRM_STOP');
      case 'CONFIRM_DELETE':
        return this.translate.instant('VOICE_COMMANDS.HELP_CONFIRM_DELETE');
        
      // 🚀 AÑADE ESTO:
      case 'WAITING_SAVE':
        return this.translate.instant('VOICE_COMMANDS.HELP_WAITING_SAVE'); 

      case 'IDLE':
      default:
        return this.translate.instant('VOICE_COMMANDS.HELP_IDLE');
    }
  }

  private matchKeyword(rawText: string, translationKey: string): boolean {
    const keywords = this.getKeywords(translationKey);
    return keywords.some(kw => rawText.includes(kw));
  }

  private getKeywords(key: string): string[] {
    const translated = this.translate.instant(key);
    if (!translated || translated === key) return [];
    if (Array.isArray(translated)) return translated.map((s: string) => this.removeAccents(String(s).trim().toLowerCase()));
    if (typeof translated === 'string') return translated.split(',').map((s: string) => this.removeAccents(s.trim().toLowerCase()));
    return [];
  }

  private removeAccents(text: string): string {
    return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }
}