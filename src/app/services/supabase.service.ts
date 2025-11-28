import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { global } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class SupabaseService {
  public supabase: SupabaseClient;

  constructor(

  ) {

    // 👇 Fix definitivo: función de locking compatible con 2.81.1
    const noLock: any = async (
      _key: string,
      _acquireTimeout: number,
      fn: () => Promise<any>
    ) => {
      return await fn();
    };

    this.supabase = createClient(
      global.supabaseUrl,
      global.supabaseKey,
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          flowType: 'pkce',
          storage: localStorage,

          // 💥 aquí se arregla el error + pantalla en blanco
          lock: noLock
        }
      }
    );
  }

  getClient(): SupabaseClient {
    return this.supabase;
  }
}
