import { inject, Injectable } from '@angular/core';
import { CapacitorHttp } from '@capacitor/core';
import { global } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class WeatherService {
  
  async getWeather(lat: number, lon: number, lang: string = 'es') {
    const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${global.weather_key}&units=metric&lang=${lang}`;
    
    try {
      const response = await CapacitorHttp.get({ url });
      if (response.status === 200) {
        const data = response.data;
        return {
          temp: Math.round(data.main.temp),
          description: data.weather[0].description,
          icon: `https://openweathermap.org/img/wn/${data.weather[0].icon}@2x.png`,
          humidity: data.main.humidity,
          wind: data.wind.speed
        };
      }
      return null;
    } catch (e) {
      console.error("Weather Error", e);
      return null;
    }
  }
}