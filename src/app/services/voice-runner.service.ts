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
import { PopoverController } from '@ionic/angular';

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
  private popoverCtrl = inject(PopoverController);

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
    console.log('🎤 DEBUG: El sistema ha escoltat exactament: "', text, '"'); // 👈 AQUEST LOG ÉS VITAL

    if (text) {
      const command = this.parser.analyzeCommand(text, this.state.current);
      console.log('🤖 DEBUG: L\'analitzador ha interpretat l\'ordre com: ', command); // 👈 PER VEURE PER QUÈ TORNA NULL
      await this.processCommand(command);
    }
  }

  // ==========================================================================
  // PROCESADOR DE COMANDOS POR ESTADO
  // ==========================================================================
  private async processCommand(command: string | null): Promise<void> {
    if (!command) {
      this.fs.displayToast(this.translate.instant('VOICE.INVALID_STATE'), 'warning');
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
      case 'WAITING_SAVE':
        await this.handleWaitingSave(command);
        break;
    }
  }

  // --- LOGICA: ESTADO REPOSO (IDLE) ---
  private async handleIdleState(command: string): Promise<void> {
    switch (command) {
      case 'record':
        if (!this.router.url.includes('tab1')) await this.fs.gotoPage('tab1');
          
        // 1. Ejecutamos la lógica que inicia el track y muestra el Toast visual
        await this.executeStartTracking(); 
        
        // 2. Transicionamos el estado (el TrackManager ya lo hace, pero dejarlo aquí es seguro)
        this.state.transitionTo('TRACKING'); 
        
        // 3. El Runner solo se encarga de la voz (el Toast ya lo gestionó el servicio anterior)
        const startMsg = this.translate.instant('RECORD.STARTING');
        await this.safeSpeak(startMsg); // <-- Si safeSpeak es asíncrono, puedes poner await
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
        // CORREGIDO: Usando claves de traducción en lugar de texto duro
        const noTrackMsg = this.translate.instant('VOICE_COMMANDS.NO_ACTIVE_RECORDING') || 'No active recording';
        this.fs.displayToast(`${noTrackMsg} ⏹️`, 'info');
        this.safeSpeak(noTrackMsg);
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
        this.fs.displayToast(this.translate.instant('RECORD.ALREADY_RECORDING'), 'info');
        this.safeSpeak(this.translate.instant('RECORD.ALREADY_RECORDING'));
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
          await this.safeSpeak(finishedMsg); // 👈 Espera a terminar "Trayecto finalizado"
          
          const analyzingMsg = this.translate.instant('RECORD.ANALYZING_ROUTE');
          this.fs.displayToast(analyzingMsg, 'info');
          await this.safeSpeak(analyzingMsg); // 👈 Espera a terminar "Analizando ruta..."
          
          // Y justo aquí llama directamente a guardar sin pasar por el menú intermedio:
          await this.trackManager.setTrackDetails();
        } else {
          this.state.transitionTo('IDLE');
        }
      } catch (error) {
        console.error('Error al detener track:', error);
        this.state.transitionTo('IDLE');
      }
    } else if (command === 'no') {
      this.state.transitionTo('TRACKING');
      this.fs.displayToast(this.translate.instant('RECORD.CONTINUE_TRACKING'), 'success');
      this.safeSpeak(this.translate.instant('RECORD.CONTINUE_TRACKING'));
    }
  }

  // --- LOGICA: MENÚ POST-GRABACIÓN (TRACK_MENU) ---
  private async handleTrackMenu(command: string): Promise<void> {
    if (command === 'save') {
      // ✅ MODIFICACIÓN CLAVE: En lugar de solo ir a IDLE, disparar el guardado de TrackManager
      const savingMsg = this.translate.instant('RECORD.SAVING_TRACK') || 'Guardando...';
      this.fs.displayToast(savingMsg, 'success');
      this.safeSpeak(savingMsg);
      await this.trackManager.setTrackDetails();
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
        const deletedMsg = this.translate.instant('MAP.CURRENT_TRACK_DELETED');
        this.fs.displayToast(deletedMsg, 'success');
        this.safeSpeak(deletedMsg);
      } finally {
        this.state.transitionTo('IDLE'); 
      }
    } else if (command === 'no') {
      this.state.transitionTo('TRACK_MENU');
      const cancelMsg = this.translate.instant('RECORD.DELETE_NO');
      this.safeSpeak(cancelMsg);
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

  private async safeSpeak(text: string): Promise<void> { // <-- Asegúrate de que tenga "async" y ": Promise<void>"
    if (!text) return;
    const cleanText = text.replace(/[\u1000-\uFFFF]|\p{Emoji_Presentation}|\p{Extended_Pictographic}/gu, '').trim();
    
    // Como ahora driver.speak es una promesa, aquí necesitamos el await
    await this.driver.speak(cleanText); 
  }
  
  public cancelStop(): void {
    if (this.state.current === 'CONFIRM_STOP') {
        this.state.transitionTo('TRACKING');
        this.fs.displayToast(this.translate.instant('RECORD.CONTINUE_TRACKING'), 'success');
        this.safeSpeak(this.translate.instant('RECORD.CONTINUE_TRACKING'));
    }
  }

  private async handleWaitingSave(command: string): Promise<void> {
    if (command === 'yes') {
      // 1. Damos feedback visual
      this.fs.displayToast(this.translate.instant('RECORD.SAVING'), 'success');

      // 2. Disparamos el evento para que el Popover ejecute su propio confirm()
      // Esto hace que el popover guarde los datos del formulario (ngModel) 
      // y se cierre solo, enviando la data a TrackManager.
      this.state.triggerVoiceConfirm();
      
      // NO hacemos transitionTo('IDLE') aquí.
      // El código de TrackManagerService seguirá ejecutándose tras el dismiss.
      
    } else if (command === 'no') {
      // 1. Cerramos el popover indicando cancelación
      // Necesitas tener inyectado PopoverController en VoiceRunnerService
      await this.popoverCtrl.dismiss(null, 'cancel');

      // 2. Cambiamos el estado al siguiente paso lógico
      this.state.transitionTo('CONFIRM_DELETE');
      this.promptStateQuestion('RECORD.CONFIRM_DELETION');
    }
  }}