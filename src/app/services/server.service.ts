import { Injectable } from '@angular/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { BehaviorSubject, Observable } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class ServerService {
  
  // ==========================================================================
  // 1. ESTADO Y OBSERVABLES
  // ==========================================================================
  private downloadProgress$ = new BehaviorSubject<number>(0);

  constructor() {}

  /** Obtiene el flujo de progreso de descarga actual (0-100) */
  getDownloadProgress(): Observable<number> {
    return this.downloadProgress$.asObservable();
  }

  // ==========================================================================
  // 2. ACCIONES DE RED Y ARCHIVOS (Public)
  // ==========================================================================

  /**
   * Descarga un archivo binario (ej: MBTiles) de forma optimizada.
   * Divide la descarga en dos fases: Red (0-50%) y Escritura en disco (50-100%).
   * @param url URL del recurso.
   * @param filePath Nombre del archivo en el directorio local.
   */
  async downloadBinaryFile(url: string, filePath: string, onProgress?: (progress: number) => void): Promise<void> {
    try {
      await Filesystem.deleteFile({ path: filePath, directory: Directory.Data });
    } catch { 
      console.log('ℹ️ No existing file to delete, proceeding with download.');
    }

    const chunkSize = 1024 * 1024 * 5; // Bajamos a 5MB por seguridad en móviles
    this.downloadProgress$.next(0);

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', url, true);
      xhr.responseType = 'arraybuffer';

      xhr.onprogress = (event) => {
        if (event.lengthComputable) {
          // Fase de red: 0% al 50%
          const percent = Math.floor((event.loaded / event.total) * 50);
          this.updateProgress(percent, onProgress);
        }
      };

      xhr.onload = async () => {
        if (xhr.status === 200) {
          try {
            const uint8Array = new Uint8Array(xhr.response);
            const totalSize = uint8Array.length;
            let offset = 0;

            console.log('Guardando archivo en chunks...');

            // Fase de disco: 50% al 100%
            while (offset < totalSize) {
              const chunk = uint8Array.slice(offset, offset + chunkSize);
              
              await Filesystem.appendFile({
                path: filePath,
                data: this.uint8ArrayToBase64(chunk),
                directory: Directory.Data,
              });

              offset += chunk.length;
              const savePercent = Math.floor((offset / totalSize) * 50);
              this.updateProgress(50 + savePercent, onProgress);
            }
            
            console.log('¡Descarga completada!');
            resolve();
          } catch (error) { 
            reject(error); 
          }
        } else { 
          reject(`Fallo al descargar: ${xhr.status}`); 
        }
      };

      xhr.onerror = () => reject('Error de red');
      xhr.send();
    });
  }

  /**
   * Escanea el directorio de datos buscando archivos de mapas (.mbtiles).
   */
  async listFilesInDataDirectory(): Promise<string[]> {
    try {
      const result = await Filesystem.readdir({ path: '', directory: Directory.Data });
      return result.files
        .map(file => typeof file === 'string' ? file : file.name)
        .filter(name => name.toLowerCase().endsWith('.mbtiles'));
    } catch (error) { 
      console.error('Error listando archivos:', error);
      return []; 
    }
  }

  // ==========================================================================
  // 3. HELPERS PRIVADOS
  // ==========================================================================

  /**
   * Conversión altamente optimizada para evitar colapsos de memoria
   */
  private uint8ArrayToBase64(uint8: Uint8Array): string {
    let binary = '';
    const len = uint8.byteLength;
    const chunkStep = 8192; // Previene "Maximum call stack size exceeded"
    
    for (let i = 0; i < len; i += chunkStep) {
      const segment = uint8.subarray(i, i + chunkStep);
      binary += String.fromCharCode.apply(null, segment as any);
    }
    
    return btoa(binary);
  }

  private updateProgress(value: number, callback?: (p: number) => void) {
    this.downloadProgress$.next(value);
    if (callback) callback(value);
  }
}