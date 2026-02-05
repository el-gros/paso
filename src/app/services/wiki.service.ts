import { inject, Injectable } from '@angular/core';
import { LanguageService } from './language.service'; // Asegúrate de que la ruta es correcta

@Injectable({ providedIn: 'root' })
export class WikiService {
  private langService = inject(LanguageService);

  async getWikiData(location: any) {
    // 1. Obtenemos el idioma actual (ej: 'es-ES' -> 'es')
    const currentLang = this.langService.getCurrentLangValue() || 'es';
    const langCode = currentLang.split('-')[0]; 

    let rawName = location.short_name || location.name;
    let searchTerm = rawName.split(',')[0].trim();

    try {
      // 2. Usamos el langCode en la URL de la API
      let resp = await fetch(`https://${langCode}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(searchTerm)}`);
      
      if (!resp.ok) {
        // Intento por coordenadas si el nombre falla
        const nearbyUrl = `https://${langCode}.wikipedia.org/w/api.php?action=query&list=geosearch&gsradius=1000&gscoord=${location.lat}|${location.lon}&format=json&origin=*`;
        const geoResp = await fetch(nearbyUrl);
        const geoData = await geoResp.json();

        if (geoData.query?.geosearch?.length > 0) {
          const closestTitle = geoData.query.geosearch[0].title;
          resp = await fetch(`https://${langCode}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(closestTitle)}`);
        }
      }

      return resp.ok ? await resp.json() : null;
    } catch (err) {
      console.error("Wiki Fetch Error:", err);
      return null;
    }
  }
}