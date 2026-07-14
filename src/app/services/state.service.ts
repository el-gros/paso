import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

// 1. Catálogo estricto de los estados posibles de la app
export type AppState = 
  | 'IDLE'            // Navegación normal por el mapa/menús
  | 'TRACKING'        // Grabación activa en segundo plano
  | 'CONFIRM_STOP'    // Preguntando si desea detener
  | 'TRACK_MENU'      // Menú post-grabación (Guardar/Borrar)
  | 'CONFIRM_DELETE'; // Preguntando si desea borrar definitivamente

@Injectable({
  providedIn: 'root'
})
export class StateService {
  // 2. Fuente de la verdad reactiva (inicia en IDLE)
  private stateSubject = new BehaviorSubject<AppState>('IDLE');
  
  // 3. Observable público para que otros componentes se suscriban (pero no puedan modificarlo directamente)
  public state$: Observable<AppState> = this.stateSubject.asObservable();

  constructor() {}

  /**
   * Devuelve el valor actual de forma síncrona (muy útil para el analizador de voz)
   */
  get current(): AppState {
    return this.stateSubject.getValue();
  }

  /**
   * Único método autorizado para cambiar el estado de la aplicación
   */
  public transitionTo(newState: AppState) {
    const previous = this.current;
    
    // Evitamos re-emisiones innecesarias si es el mismo estado
    if (previous === newState) return;

    // OPCIONAL: Aquí puedes poner reglas de blindaje (Transitions Guard).
    // Ej: No puedes pasar de IDLE directamente a CONFIRM_STOP sin pasar por TRACKING.
    if (previous === 'IDLE' && newState === 'CONFIRM_STOP') {
      console.warn(`[StateService] Transición ilegal: ${previous} ➡️ ${newState}`);
      return;
    }

    console.log(`[StateService] Transición de estado: ${previous} ➡️ ${newState}`);
    this.stateSubject.next(newState);
  }
}