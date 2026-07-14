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
  public analyzeCommand(text: string, currentState: AppState): string | null {
    if (!text) return null;
    const rawText = this.removeAccents(text.toLowerCase().trim());
    console.log(`[VoiceParser - Estado: ${currentState}] Escuchado: "${rawText}"`);

    // Comando de ayuda universal
    if (this.matchKeyword(rawText, 'VOICE_COMMANDS.HELP_COMMAND')) return 'help';
    if (this.matchKeyword(rawText, 'VOICE_COMMANDS.MAP')) return 'map';
    if (this.matchKeyword(rawText, 'VOICE_COMMANDS.ARCHIVE')) return 'archive';
    if (this.matchKeyword(rawText, 'VOICE_COMMANDS.DATA')) return 'data';
    if (this.matchKeyword(rawText, 'VOICE_COMMANDS.SETTINGS')) return 'settings';

    switch (currentState) {
      case 'CONFIRM_STOP':
      case 'CONFIRM_DELETE':
        if (this.matchKeyword(rawText, 'RECORD.DELETE_YES')) return 'yes';
        if (this.matchKeyword(rawText, 'RECORD.DELETE_NO')) return 'no';
        break;

      case 'TRACK_MENU':
        if (this.matchKeyword(rawText, 'RECORD.SAVE_TRACK')) return 'save';
        if (this.matchKeyword(rawText, 'RECORD.REMOVE')) return 'delete';
        break;

      case 'IDLE':
      case 'TRACKING':
      default:
        if (this.matchKeyword(rawText, 'VOICE_COMMANDS.RECORD')) return 'record';
        if (this.matchKeyword(rawText, 'VOICE_COMMANDS.STOP')) return 'stop';
        break;
    }

    return null;
  }

  /**
   * Generates el mensaje de ayuda contextual leyendo frases fijas del JSON para evitar errores fonéticos.
   */
  public getHelpMessage(currentState: AppState): string {
    const prefix = this.translate.instant('VOICE_COMMANDS.HELP_PREFIX') || 'Opcions: ';
    let rawMessage = '';

    if (currentState === 'CONFIRM_STOP' || currentState === 'CONFIRM_DELETE') {
      const optYes = this.translate.instant('RECORD.DELETE_YES') || 'sí';
      const optNo = this.translate.instant('RECORD.DELETE_NO') || 'no';
      rawMessage = prefix.includes('{0}') 
        ? prefix.replace('{0}', `${optYes} o ${optNo}`) 
        : `${prefix}${optYes} o ${optNo}`;
    } 
    else if (currentState === 'TRACK_MENU') {
      const optSave = this.translate.instant('RECORD.SAVE_TRACK') || 'guardar';
      const optDel = this.translate.instant('RECORD.REMOVE') || 'borrar';
      rawMessage = prefix.includes('{0}') 
        ? prefix.replace('{0}', `${optSave} o ${optDel}`) 
        : `${prefix}${optSave} o ${optDel}`;
    } 
    else if (currentState === 'TRACKING') {
      const trackHelp = this.translate.instant('VOICE_COMMANDS.HELP_TRACKING');
      rawMessage = (trackHelp && !trackHelp.includes('VOICE_COMMANDS.')) 
        ? trackHelp 
        : 'Les opcions de gravació són: parar, mapa, arxiu o dades.';
    } 
    else {
      const idleHelp = this.translate.instant('VOICE_COMMANDS.HELP_IDLE');
      rawMessage = (idleHelp && !idleHelp.includes('VOICE_COMMANDS.')) 
        ? idleHelp 
        : 'Les opcions disponibles són: gravar, mapa, arxiu o dades.';
    }

    return rawMessage;
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