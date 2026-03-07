import { inject, Injectable } from '@angular/core';
import { LanguageService } from './language.service';

// 🚀 Interfaz para manejar los datos de Wikipedia con seguridad
export interface WikiSummary {
  title: string;
  extract: string;
  thumbnail?: {
    source: string;
    width: number;
    height: number;
  };
  content_urls?: {
    desktop: { page: string };
  };
}

@Injectable({ providedIn: 'root' })
export class WikiService {
  private langService = inject(LanguageService);

  // ==========================================
  // OBTENCIÓN DE DATOS DE WIKIPEDIA
  // ==========================================

  async getWikiData(location: { name: string; short_name?: string; lat: number; lon: number }): Promise<WikiSummary | null> {
    
    // 1. Gestión de idioma
    const langCode = (this.langService.currentLangValue || 'es').split('-')[0]; 
    const searchTerm = this.cleanSearchTerm(location.short_name || location.name);

    try {
      // 2. Intento 1: Búsqueda directa por nombre (REST API)
      let resp = await fetch(`https://${langCode}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(searchTerm)}`);
      
      // 3. Intento 2: Si falla el nombre, buscamos por coordenadas (Action API)
      if (!resp.ok) {
        const closestTitle = await this.getNearbyTitle(location.lat, location.lon, langCode);
        
        if (closestTitle) {
          resp = await fetch(`https://${langCode}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(closestTitle)}`);
        }
      }

      return resp.ok ? await resp.json() : null;

    } catch (err) {
      console.error("[WikiService] Error obteniendo datos:", err);
      return null;
    }
  }

  // ==========================================
  // MÉTODOS PRIVADOS DE APOYO
  // ==========================================

  /**
   * Limpia el nombre para que Wikipedia lo entienda mejor (ej: "Barcelona, España" -> "Barcelona")
   */
  private cleanSearchTerm(name: string): string {
    if (!name) return '';
    return name.split(',')[0].trim();
  }

  /**
   * Busca el título del artículo más cercano a unas coordenadas
   */
  private async getNearbyTitle(lat: number, lon: number, lang: string): Promise<string | null> {
    const url = `https://${lang}.wikipedia.org/w/api.php?action=query&list=geosearch&gsradius=1000&gscoord=${lat}|${lon}&format=json&origin=*`;
    
    try {
      const geoResp = await fetch(url);
      const geoData = await geoResp.json();
      return geoData.query?.geosearch?.[0]?.title || null;
    } catch {
      return null;
    }
  }
}