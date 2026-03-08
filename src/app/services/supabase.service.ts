import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// --- CONFIGURACIÓN DE ENTORNO ---
import { global } from '../../environments/environment';

@Injectable({ 
  providedIn: 'root' 
})
export class SupabaseService {
  
  // --- ESTADO INTERNO ---
  // Mantenemos la instancia privada para evitar modificaciones accidentales desde fuera
  private readonly supabase: SupabaseClient;

  constructor() {
    this.supabase = this.initializeClient();
  }

  // ==========================================================================
  // 1. API PÚBLICA
  // ==========================================================================

  /**
   * Devuelve la instancia conectada del cliente de Supabase.
   */
  public getClient(): SupabaseClient {
    return this.supabase;
  }

  // ==========================================================================
  // 2. INICIALIZACIÓN (MÉTODOS PRIVADOS)
  // ==========================================================================

  /**
   * Configura e inicializa el cliente con los workarounds necesarios para Capacitor.
   */
  private initializeClient(): SupabaseClient {
    
    // 👇 FIX: Función de locking bypass compatible con Supabase 2.8x en Ionic.
    // Evita el error de la "pantalla en blanco" al gestionar la persistencia de sesión.
    const noLock = async (key: string, acquireTimeout: number, fn: () => Promise<any>) => {
      return await fn();
    };

    return createClient(
      global.supabaseUrl,
      global.supabaseKey,
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          flowType: 'pkce',
          storage: window.localStorage, 
          lock: noLock // 💥 Workaround aplicado
        }
      }
    );
  }
}