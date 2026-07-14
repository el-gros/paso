// src/app/services/voice/voice-runner.service.ts
import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { FunctionsService } from './functions.service';
import { TrackManagerService } from './track-manager.service';
import { StateService } from './state.service';
import { PresentService } from './present.service';
import { ReferenceService } from './reference.service';
import { VoiceDriverService } from './voice-driver.service';
import { VoiceParserService } from './voice-parser.service';

@Injectable({
  providedIn: 'root'
})
export class VoiceRunnerService {
  private translate = inject(TranslateService);
  private fs = inject(FunctionsService);
  private router = inject(Router);
  private trackManager = inject(TrackManagerService);
  private state = inject(StateService);
  private present = inject(PresentService);
  private reference = inject(ReferenceService);
  
  // Servicios modulares de voz
  private driver = inject(VoiceDriverService);
  private parser = inject(VoiceParserService);

  /**
   * Getter público para que tus plantillas HTML ([class.is-listening]="voiceRunner.isListening")
   * sigan funcionando exactamente igual sin tocar ninguna página.
   */
  public get isListening(): boolean {
    return this.driver.isListening;
  }

  /**
   * Acción disparada por el botón flotante de micrófono en la UI.
   */
  public async toggleVoiceControl(): Promise<void> {
    if (this.driver.isListening) {
      await this.driver.stopListening();
    } else {
      await this.startListeningCycle();
    }
  }

  /**
   * Inicia el ciclo completo: escuchar -> analizar -> ejecutar.
   */
  public async startListeningCycle(): Promise<void> {
    const text = await this.driver.listen();
    if (text) {
      const command = this.parser.analyzeCommand(text, this.state.current);
      await this.processCommand(command);
    }
  }

  // ==========================================================================
  // PROCESADOR DE COMANDOS POR ESTADO
  // ==========================================================================
  private async processCommand(command: string | null): Promise<void> {
    if (!command) {
      this.fs.displayToast('Comando no válido para el estado actual 🤷‍♂️', 'warning');
      return;
    }

    if (command === 'help') {
      this.giveStatefulHelp();
      return;
    }

    switch (this.state.current) {
      case 'IDLE':
        await this.handleIdleState(command);
        break;
      case 'TRACKING':
        await this.handleTrackingState(command);
        break;
      case 'CONFIRM_STOP':
        await this.handleConfirmStop(command);
        break;
      case 'TRACK_MENU':
        await this.handleTrackMenu(command);
        break;
      case 'CONFIRM_DELETE':
        await this.handleConfirmDelete(command);
        break;
    }
  }

  // --- LOGICA: ESTADO REPOSO (IDLE) ---
  private async handleIdleState(command: string): Promise<void> {
    switch (command) {
      case 'record':
        if (!this.router.url.includes('tab1')) await this.fs.gotoPage('tab1');
          
        // 1. Ejecutamos la lógica de negocio (sin avisos dentro)
        await this.executeStartTracking(); 
        
        // 2. Transicionamos el estado
        this.state.transitionTo('TRACKING'); 
        
        // 3. Notificamos al usuario de forma multilingüe
        const startMsg = this.translate.instant('RECORD.STARTING');
        this.fs.displayToast(`${startMsg} ⏺️`, 'success');
        this.safeSpeak(startMsg);
        
        break;

      case 'map': 
        if (this.router.url.includes('tab1')) {
          const msg = this.translate.instant('VOICE_COMMANDS.ALREADY_IN_MAP');
          this.fs.displayToast(`${msg} 🗺️`, 'info');
          this.safeSpeak(msg);
        } else {
          this.fs.gotoPage('tab1'); 
        }
        break;

      case 'archive': 
        if (this.router.url.includes('archive')) {
          const msg = this.translate.instant('VOICE_COMMANDS.ALREADY_IN_ARCHIVE');
          this.fs.displayToast(`${msg} 📁`, 'info');
          this.safeSpeak(msg);
        } else {
          this.fs.gotoPage('archive'); 
        }
        break;

      case 'settings': 
        if (this.router.url.includes('settings')) {
          const msg = this.translate.instant('VOICE_COMMANDS.ALREADY_IN_SETTINGS');
          this.fs.displayToast(`${msg} ⚙️`, 'info');
          this.safeSpeak(msg);
        } else {
          this.fs.gotoPage('settings'); 
        }
        break;

      case 'data':
        if (this.router.url.includes('canvas')) {
          const msg = this.translate.instant('VOICE_COMMANDS.ALREADY_IN_DATA');
          this.fs.displayToast(`${msg} 📊`, 'info');
          this.safeSpeak(msg);
        } else if (!this.present.currentTrack && !this.reference.archivedTrack) {
          const noTracksMsg = this.translate.instant('VOICE_COMMANDS.NO_TRACKS');
          this.fs.displayToast(`${noTracksMsg} 📊`, 'info');
          this.safeSpeak(noTracksMsg);
        } else {
          this.fs.gotoPage('canvas'); 
        }
        break;
        
      case 'stop':
        this.fs.displayToast('No hay grabación activa ⏹️', 'info');
        this.safeSpeak('No hay grabación activa');
        break;
    }
  }

  // --- LOGICA: ESTADO GRABANDO (TRACKING) ---
  private async handleTrackingState(command: string): Promise<void> {
    switch (command) {
      case 'stop':
        if (!this.router.url.includes('tab1')) await this.fs.gotoPage('tab1');
        this.state.transitionTo('CONFIRM_STOP');
        this.promptStateQuestion('RECORD.CONFIRM_STOP');
        break;

      case 'record':
        this.fs.displayToast('Ya estás grabando ⏺️', 'info');
        this.safeSpeak('Grabación activa');
        break;

      case 'map': 
        if (this.router.url.includes('tab1')) {
          const msg = this.translate.instant('VOICE_COMMANDS.ALREADY_IN_MAP');
          this.fs.displayToast(`${msg} 🗺️`, 'info');
          this.safeSpeak(msg);
        } else {
          this.fs.gotoPage('tab1'); 
        }
        break;

      case 'archive': 
        if (this.router.url.includes('archive')) {
          const msg = this.translate.instant('VOICE_COMMANDS.ALREADY_IN_ARCHIVE');
          this.fs.displayToast(`${msg} 📁`, 'info');
          this.safeSpeak(msg);
        } else {
          this.fs.gotoPage('archive'); 
        }
        break;

      case 'data':
        if (this.router.url.includes('canvas')) {
          const msg = this.translate.instant('VOICE_COMMANDS.ALREADY_IN_DATA');
          this.fs.displayToast(`${msg} 📊`, 'info');
          this.safeSpeak(msg);
        } else {
          this.fs.gotoPage('canvas');
        }
        break;
    }
  }

  // --- LOGICA: CONFIRMACIÓN DE PARADA (CONFIRM_STOP) ---
  private async handleConfirmStop(command: string): Promise<void> {
    if (command === 'yes') {
      try {
        const isSuccess = await this.trackManager.stopTrackingProcess();
        if (isSuccess) {
          const finishedMsg = this.translate.instant('MAP.TRACK_FINISHED');
          this.fs.displayToast(finishedMsg, 'success');
          this.safeSpeak(finishedMsg);
          
          // 1. Avanzamos al menú de Guardar / Borrar
          this.state.transitionTo('TRACK_MENU');
          
          // 2. Encadenamos la siguiente pregunta y abrimos el micrófono
          setTimeout(() => {
            const saveOpt = this.translate.instant('RECORD.SAVE_TRACK') || 'Guardar';
            const delOpt = this.translate.instant('RECORD.REMOVE') || 'Borrar';
            
            const prompt = `¿${saveOpt}, o ${delOpt}?`;
            this.fs.displayToast(prompt, 'info', 4000);
            this.safeSpeak(prompt);
            
            // ¡Clave para manos libres! Reactivamos el reconocimiento de voz
            setTimeout(() => { this.startListeningCycle(); }, 2000);
          }, 1500);

        } else {
          this.state.transitionTo('IDLE');
        }
      } catch (error) {
        console.error('Error al detener track:', error);
        this.state.transitionTo('IDLE');
      }
    } else if (command === 'no') {
      this.state.transitionTo('TRACKING');
      this.fs.displayToast('Continuando grabación...', 'info');
      this.safeSpeak('Continuando');
    }
  }

  // --- LOGICA: MENÚ POST-GRABACIÓN (TRACK_MENU) ---
  private async handleTrackMenu(command: string): Promise<void> {
    if (command === 'save') {
      this.state.transitionTo('IDLE');
      this.fs.displayToast('Abriendo opciones de guardado...', 'success');
      this.safeSpeak('Guardando');
    } else if (command === 'delete') {
      this.state.transitionTo('CONFIRM_DELETE');
      this.promptStateQuestion('RECORD.CONFIRM_DELETION');
    }
  }

  // --- LOGICA: CONFIRMACIÓN DE BORRADO (CONFIRM_DELETE) ---
  private async handleConfirmDelete(command: string): Promise<void> {
    if (command === 'yes') {
      try {
        await this.trackManager.deleteTrackProcess();
        this.fs.displayToast(this.translate.instant('MAP.CURRENT_TRACK_DELETED'), 'success');
        this.safeSpeak('Trayecto eliminado');
      } finally {
        this.state.transitionTo('IDLE'); 
      }
    } else if (command === 'no') {
      this.state.transitionTo('TRACK_MENU');
      this.safeSpeak('Borrado cancelado');
    }
  }

  // ==========================================================================
  // AYUDAS Y MÉTODOS AUXILIARES
  // ==========================================================================
  private giveStatefulHelp(): void {
    const rawMessage = this.parser.getHelpMessage(this.state.current);
    this.fs.displayToast(rawMessage, 'info', 4000);
    this.safeSpeak(rawMessage);

    // Si estamos en menús de confirmación críticos, reactivamos escucha automáticamente
    if (['CONFIRM_STOP', 'CONFIRM_DELETE', 'TRACK_MENU'].includes(this.state.current)) {
      setTimeout(() => { this.startListeningCycle(); }, 3000);
    }
  }

  private promptStateQuestion(translationKey: string): void {
    const question = this.translate.instant(translationKey);
    const optYes = this.translate.instant('RECORD.DELETE_YES');
    const optNo = this.translate.instant('RECORD.DELETE_NO');
    const fullPrompt = `${question}. ¿${optYes}, o ${optNo}?`;

    this.fs.displayToast(fullPrompt, 'warning', 4000);
    this.safeSpeak(fullPrompt);

    setTimeout(() => { this.startListeningCycle(); }, 2500);
  }

  private async executeStartTracking(): Promise<void> {
    try {
      await this.trackManager.startTracking();
    } catch (error) {
      console.error("Error al arrancar el track en el TrackManager:", error);
    }
  }

  /**
   * Método puente que elimina cualquier emoji por código antes de pasarlo al altavoz.
   * Evita que el móvil pronuncie "mapa mundial", "carpeta" o "gráfico de barras".
   */
  private safeSpeak(text: string): void {
    if (!text) return;
    const cleanText = text.replace(/[\u1000-\uFFFF]|\p{Emoji_Presentation}|\p{Extended_Pictographic}/gu, '').trim();
    this.driver.speak(cleanText);
  }

  public cancelStop(): void {
    if (this.state.current === 'CONFIRM_STOP') {
        this.state.transitionTo('TRACKING');
        this.fs.displayToast('Continuando grabación...', 'info');
        this.safeSpeak('Continuando');
    }
  }
}