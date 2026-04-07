import { Injectable } from '@angular/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import * as htmlToImage from 'html-to-image';
import { Map } from 'ol';
import { GeographyService } from './geography.service';

@Injectable({
  providedIn: 'root'
})
export class MapCaptureService {

  constructor(private geography: GeographyService) {}

  /**
   * Captura el estado actual del mapa de OpenLayers y lo guarda como un archivo JPG.
   */
  public async generateAndSaveMapImage(map: Map): Promise<boolean> {
    try {
      await new Promise(resolve => setTimeout(resolve, 150));
      // Ocultamos la capa de ubicación (flecha azul) para que no salga en la foto
      this.geography.locationLayer?.setVisible(false); 
      
      const mapWrapper = document.getElementById('map-wrapper');
      if (mapWrapper) mapWrapper.style.transform = `scale(1)`; 

      await this.waitForMapRender(map);

      const size = map.getSize() || [window.innerWidth, window.innerHeight];
      const mapCanvas = document.createElement('canvas');
      mapCanvas.width = size[0];
      mapCanvas.height = size[1];
      const ctx = mapCanvas.getContext('2d');
      
      if (!ctx) {
        this.geography.locationLayer?.setVisible(true);
        return false;
      }

      // Dibujamos todas las capas del mapa en nuestro canvas temporal
      document.querySelectorAll<HTMLCanvasElement>('.ol-layer canvas').forEach((canvas) => {
        if (canvas.width > 0) {
          const opacity = (canvas.parentNode as HTMLElement)?.style.opacity || '1';
          ctx.globalAlpha = Number(opacity);
          const tr = canvas.style.transform;
          
          if (tr && tr.startsWith('matrix')) {
            const m = tr.match(/^matrix\(([^)]+)\)$/)?.[1].split(',').map(Number);
            if (m) ctx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
          } else {
            ctx.setTransform(1, 0, 0, 1, 0, 0);
          }
          ctx.drawImage(canvas, 0, 0);
        }
      });

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const dataUrl = mapCanvas.toDataURL('image/jpeg', 0.8);

      await Filesystem.writeFile({
        path: 'map.jpg',
        data: dataUrl.split(',')[1],
        directory: Directory.ExternalCache,
      });

      this.geography.locationLayer?.setVisible(true);
      return true;

    } catch (err) {
      console.error('[MapCaptureService] Error capturando mapa:', err);
      this.geography.locationLayer?.setVisible(true); 
      return false;
    }
  }

  private waitForMapRender(map: Map): Promise<void> {
    return new Promise((r) => {
      map.once('rendercomplete', () => setTimeout(() => r(), 300));
      map.renderSync();
    });
  }
}