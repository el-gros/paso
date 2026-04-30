import { Injectable, inject } from '@angular/core';
import { SpeechRecognition } from '@capacitor-community/speech-recognition';
import { TranslateService } from '@ngx-translate/core';
import { Router } from '@angular/router';
import { FunctionsService } from './functions.service';
import { MapService } from './map.service';
import { GeographyService } from './geography.service';
import { LocationManagerService } from './location-manager.service';
import { PresentService } from './present.service';
import { ReferenceService } from './reference.service';

@Injectable({
  providedIn: 'root'
})
export class VoiceRunnerService {
  private translate = inject(TranslateService);
  private fs = inject(FunctionsService);
  private router = inject(Router);
  private mapService = inject(MapService);
  private geography = inject(GeographyService);
  private location = inject(LocationManagerService);
  private present = inject(PresentService);
  private reference = inject(ReferenceService);

  public isListening = false;
  private isToggling: boolean = false;

public async toggleVoiceControl() {
  if (this.isToggling) return;
  this.isToggling = true;

  try {
    if (this.isListening) {
      await this.stopListening();
    } else {
      // OPCIÓN A: Si usas el SpeechRecognition nativo del navegador
      // Simplemente arrancamos. El navegador gestionará el pop-up de permiso.
      await this.startListening();
      
      // Si después de startListening() sigue sin sonar, 
      // es probable que el error esté DENTRO de startListening.
    }
  } catch (error) {
    console.error("Error en el control de voz:", error);
    this.isListening = false;
  } finally {
    // Un pequeño delay antes de permitir otra pulsación
    setTimeout(() => { this.isToggling = false; }, 500);
  }
}

  async startListening() {
    if (this.isListening) return;
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
      const text = (result.matches && result.matches.length > 0) ? result.matches[0] : '';
      if (text) {
        this.processCommand(this.analyzeCommand(text));
      }
    } catch (error: any) {
      this.isListening = false; 
    }
  }

  async stopListening() {
    if (!this.isListening) return;
    try { await SpeechRecognition.stop(); this.isListening = false; } catch (e) {}
  }

  private analyzeCommand(text: string): string | null {
    if (!text) return null;
    const rawText = this.removeAccents(text.toLowerCase().trim());
    console.log("Analizando texto escuchado:", rawText);

    const helpKeywords = this.getKeywords('VOICE_COMMANDS.HELP_COMMAND');
    if (helpKeywords.some(kw => rawText.includes(kw))) {
        console.log("¡Comando HELP detectado!");
        return 'help';
    }

    const commands = {
      map: this.getKeywords('VOICE_COMMANDS.MAP'),
      archive: this.getKeywords('VOICE_COMMANDS.ARCHIVE'),
      data: this.getKeywords('VOICE_COMMANDS.DATA'),
      settings: this.getKeywords('VOICE_COMMANDS.SETTINGS'),
      search: this.getKeywords('VOICE_COMMANDS.SEARCH'),
      zoom: this.getKeywords('VOICE_COMMANDS.ZOOM'),
      record: this.getKeywords('VOICE_COMMANDS.RECORD'),
      stop: this.getKeywords('VOICE_COMMANDS.STOP'),
      help: this.getKeywords('VOICE_COMMANDS.HELP_COMMAND') // <-- Nuevo
    };

    if (commands.map.some(kw => rawText.includes(kw))) return 'map';
    if (commands.archive.some(kw => rawText.includes(kw))) return 'archive';
    if (commands.data.some(kw => rawText.includes(kw))) return 'data';
    if (commands.settings.some(kw => rawText.includes(kw))) return 'settings';
    if (commands.search.some(kw => rawText.includes(kw))) return 'search';
    if (commands.zoom.some(kw => rawText.includes(kw))) return 'zoom';
    if (commands.record.some(kw => rawText.includes(kw))) return 'record';
    if (commands.stop.some(kw => rawText.includes(kw))) return 'stop';
    if (commands.help.some(kw => rawText.includes(kw))) return 'help'; // <-- Nuevo
    
    return null;
  }

  private async processCommand(command: string | null) {
    if (!command) return;

    switch (command) {
      case 'map': this.fs.gotoPage('tab1'); break;
      case 'archive': this.fs.gotoPage('archive'); break;
      case 'data': this.fs.gotoPage('canvas'); break;
      case 'settings': this.fs.gotoPage('settings'); break;

      case 'search':
        if (!this.router.url.includes('tab1')) await this.fs.gotoPage('tab1');
        this.reference.isSearchGuidePopoverOpen = !this.reference.isSearchGuidePopoverOpen;
        break;

      case 'zoom':
        if (!this.router.url.includes('tab1')) await this.fs.gotoPage('tab1');
        this.mapService.cycleZoom(); 
        break;

      case 'record':
        if (this.location.state === 'tracking') {
          this.fs.displayToast('Ya estás grabando ⏺️', 'info');
        } else {
          if (!this.router.url.includes('tab1')) await this.fs.gotoPage('tab1');
          this.executeStartTracking();
        }
        break;

      case 'stop':
        if (this.location.state !== 'tracking') {
          this.fs.displayToast('No hay grabación activa ⏹️', 'info');
        } else {
          if (!this.router.url.includes('tab1')) await this.fs.gotoPage('tab1');
          this.present.isConfirmStopOpen = true;
        }
        break;

      case 'help': // <-- Nuevo
        await this.giveHelp();
        break;
    }
  }

  /**
   * Genera una respuesta de voz dinámica según la página actual
   */
  private async giveHelp() {
    const url = this.router.url;
    let keys: string[] = [];

    // 1. Definimos qué opciones mencionar según la ubicación
    if (url.includes('tab1')) {
      keys = ['RECORD', 'STOP', 'ZOOM', 'SEARCH', 'DATA', 'ARCHIVE', 'SETTINGS'];
    } else if (url.includes('settings')) {
      keys = ['MAP', 'DATA', 'ARCHIVE'];
    } else if (url.includes('archive')) {
      keys = ['MAP', 'DATA', 'SETTINGS'];
    } else if (url.includes('canvas')) {
      keys = ['MAP', 'ARCHIVE', 'SETTINGS'];
    } else {
      keys = ['MAP', 'DATA', 'ARCHIVE', 'SETTINGS'];
    }

    // 2. Extraemos la primera palabra de cada categoría del JSON
    const availableWords = keys.map(k => {
      const words = this.getKeywords(`VOICE_COMMANDS.${k}`);
      return words.length > 0 ? words[0] : '';
    }).filter(w => w !== '');

    // 3. Construimos y dictamos la frase
    const prefix = this.translate.instant('VOICE_COMMANDS.HELP_PREFIX');
    const rawMessage = prefix.replace('{0}', availableWords.join(', '));

    // Aplicamos el parche fonético solo para el habla, no para el Toast
    const phoneticMessage = this.applyPhoneticFixes(rawMessage);

    this.speak(phoneticMessage); // La app dirá "zum"
    this.fs.displayToast(rawMessage, 'info', 4000); // El usuario leerá "zoom"  }
  }

  /**
   * Motor de Texto a Voz (TTS) nativo del navegador
   */
    private speak(text: string) {
        // 1. Verificamos si el motor existe de forma segura
        const synth = window?.speechSynthesis;

        if (!synth) {
            console.warn("El motor de voz (speechSynthesis) no está disponible en este dispositivo.");
            // Si no puede hablar, al menos que el usuario lo vea en el Toast que ya tienes
            return;
        }

        try {
            // 2. Cancelamos cualquier locución previa
            synth.cancel();

            // 3. Creamos la locución
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = this.getLocale(this.translate.currentLang);
            utterance.rate = 0.9;

            // 4. Pequeño fix para Android: Las voces pueden tardar en cargar
            // Envolvemos el speak en un pequeño timeout si es necesario o lo lanzamos directo
            setTimeout(() => {
            synth.speak(utterance);
            }, 50);

        } catch (error) {
            console.error("Error intentando hablar:", error);
        }
    }

  private async executeStartTracking() {
    this.present.currentTrack = undefined;
    this.location.currentPoint = 0;
    this.present.filtered = 0;
    this.location.averagedSpeed = 0;
    this.present.computedDistances = 0;
    if (this.geography.currentLayer) this.geography.currentLayer.getSource()?.clear();
    this.location.state = 'tracking';
    await this.location.sendReferenceToPlugin();
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

  private getLocale(lang: string | undefined): string {
    const map: { [key: string]: string } = { 'es': 'es-ES', 'en': 'en-US', 'ca': 'ca-ES', 'fr': 'fr-FR', 'ru': 'ru-RU', 'zh': 'zh-CN' };
    return map[lang || 'es'] || 'es-ES';
  }

    /**
     * Corrige palabras que el TTS lee mal en ciertos idiomas
     */
    private applyPhoneticFixes(text: string): string {
    const lang = this.translate.currentLang;
    let fixedText = text;

    // Correcciones para Catalán
    if (lang === 'ca') {
        // Escribimos "zum" para que el motor catalán lo pronuncie parecido al inglés
        fixedText = fixedText.replace(/zoom/gi, 'zum'); 
    }

    // Correcciones para Español
    if (lang === 'es') {
        fixedText = fixedText.replace(/zoom/gi, 'zum');
    }

    // Puedes añadir más excepciones aquí
    return fixedText;
    }
}