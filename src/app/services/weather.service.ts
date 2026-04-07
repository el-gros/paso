import { Injectable } from '@angular/core';
import { CapacitorHttp, HttpResponse } from '@capacitor/core';
import { global } from '../../environments/environment';

// 🚀 Definimos qué devuelve exactamente el servicio
export interface WeatherData {
  temp: number;
  description: string;
  icon: string;
  humidity: number;
  wind: number;
}

@Injectable({ providedIn: 'root' })
export class WeatherService {

  // ==========================================
  // 1. CONFIGURACIÓN Y CONSTANTES
  // ==========================================

  private readonly BASE_URL = 'https://api.openweathermap.org/data/2.5/weather';
  private readonly ICON_BASE_URL = 'https://openweathermap.org/img/wn';

  constructor() {}

  // ==========================================
  // 2. API PÚBLICA
  // ==========================================

  /**
   * Obtiene el clima actual para unas coordenadas dadas usando OpenWeatherMap.
   */
  async getWeather(lat: number, lon: number, lang: string = 'es'): Promise<WeatherData | null> {
    const url = `${this.BASE_URL}?lat=${lat}&lon=${lon}&appid=${global.weather_key}&units=metric&lang=${lang}`;
    
    try {
      const response: HttpResponse = await CapacitorHttp.get({ url });
      
      if (response.status === 200 && response.data) {
        const data = response.data;
        
        return {
          temp: Math.round(data.main.temp),
          description: data.weather[0].description,
          icon: `${this.ICON_BASE_URL}/${data.weather[0].icon}@2x.png`,
          humidity: data.main.humidity,
          wind: data.wind.speed
        };
      }
      
      console.warn(`[WeatherService] API respondió con estado: ${response.status}`);
      return null;

    } catch (e) {
      console.error("[WeatherService] Error conectando con OpenWeatherMap:", e);
      return null;
    }
  }
}