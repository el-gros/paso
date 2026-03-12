import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// --- CONFIGURACIÓN DE ENTORNO ---
import { global } from '../../environments/environment';
import { Track } from '../../globald';

@Injectable({ 
  providedIn: 'root' 
})
export class SupabaseService {
  
  // --- ESTADO INTERNO ---
  private readonly supabase: SupabaseClient;

  constructor() {
    this.supabase = this.initializeClient();
  }

  // ==========================================================================
  // 1. API PÚBLICA
  // ==========================================================================

  public getClient(): SupabaseClient {
    return this.supabase;
  }

  /**
   * Sube una ruta simplificada a la nube para compartirla.
   * Devuelve el UUID generado por la base de datos (para construir el enlace).
   */
  
  // ==========================================================================
  // 2. UTILIDADES PRIVADAS
  // ==========================================================================

  /**
   * Reduce el número de puntos de la ruta para que sea súper ligera en la web.
   */
  private simplifyCoordinates(track: Track, keepOneIn: number = 5): number[][] {
    const coords = track.features[0].geometry.coordinates;
    
    // Si la ruta es muy corta, la devolvemos entera
    if (coords.length < 100) return coords;

    const simplified = [];
    for (let i = 0; i < coords.length; i++) {
      // Guardamos el punto si es el primero, el último, o múltiplo de 'keepOneIn'
      if (i === 0 || i === coords.length - 1 || i % keepOneIn === 0) {
        simplified.push(coords[i]);
      }
    }
    return simplified;
  }

  // ==========================================================================
  // 3. INICIALIZACIÓN (MÉTODOS PRIVADOS)
  // ==========================================================================

  private initializeClient(): SupabaseClient {
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

  /**
 * Sube una ruta a Supabase y devuelve la URL para compartir
 * @param track Objeto GeoJSON de la ruta
 */
  public async shareRouteToCloud(track: any): Promise<string | null> {
    try {
      const simplifiedCoords = this.simplifyCoordinates(track, 5);
      const props = track.features[0].properties;

      // --- NORMALIZACIÓN DE DATOS ---
      // 1. Distancia: Aseguramos que sea número y probamos nombres alternativos
      const rawDist = props.totalDistance || props.distance || 0;
      const distanceMeters = typeof rawDist === 'string' ? parseFloat(rawDist) : rawDist;

      // 2. Tiempo: Si es > 1.000.000 es que viene en milisegundos (típico de JS)
      let rawTime = props.totalTime || props.duration || 0;
      let timeSeconds = typeof rawTime === 'string' ? parseInt(rawTime, 10) : rawTime;
      if (timeSeconds > 100000) timeSeconds = Math.floor(timeSeconds / 1000);

      const wktLineString = `SRID=4326;LINESTRING(${simplifiedCoords.map(c => `${c[0]} ${c[1]}`).join(',')})`;

      const payload = {
        name: props.name || 'Ruta compartida',
        description: props.description || '',
        track_line: wktLineString,
        stats: {
          distance: distanceMeters,
          time: timeSeconds,
          elevationGain: props.totalElevationGain || props.elevationGain || 0,
          elevationLoss: props.totalElevationLoss || props.elevationLoss || 0
        }
      };

      const { data, error } = await this.supabase
        .from('shared_routes')
        .insert(payload)
        .select('id')
        .single();

      if (error) throw error;
      return `https://el-gros.github.io/index/?id=${data.id}`;

    } catch (error) {
      console.error('[SupabaseService] Error:', error);
      return null;
    }
  }

}