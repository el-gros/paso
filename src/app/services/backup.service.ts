import { Capacitor } from '@capacitor/core';
import { Injectable } from '@angular/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import JSZip from 'jszip';
import { FunctionsService } from '../services/functions.service';
import { TranslateService } from '@ngx-translate/core';

@Injectable({
  providedIn: 'root'
})
export class BackupService {

  constructor(
    private fs: FunctionsService,
    private translate: TranslateService
  ) { }

  // ==========================================================================
  // 1. ORQUESTADORES PÚBLICOS (High-level API)
  // ==========================================================================

  /** 
   * Ejecuta el proceso completo de exportación: recopila datos y genera el archivo .paso 
   */
  async runFullExport(onProgress?: (progress: number) => void) {
    // 1. Preparar Payload
    const payload: any = { collection: this.fs.collection };
    const keys = this.fs.collection
      .filter((item: any) => item?.date)
      .map((item: any) => {
        const dateObj = (item.date instanceof Date) ? item.date : new Date(item.date);
        return dateObj.toISOString();
      });

    const tracksData = await Promise.all(keys.map(key => this.fs.storeGet(key)));
    keys.forEach((key, index) => {
      if (tracksData[index]) payload[key] = tracksData[index];
    });

    // 2. Llamar a la función que genera el ZIP
    return await this.exportBackup(payload, onProgress); 
  }

  /** 
   * Ejecuta el proceso completo de importación y guarda los datos en el Storage 
   */
  async runFullImport(filePath: string, onProgress?: (progress: number) => void) {
    const backupData = await this.importBackup(filePath, onProgress);
    
    if (backupData && backupData.collection) {
      this.fs.collection = backupData.collection;
      await this.fs.storeSet('collection', this.fs.collection);

      const keys = Object.keys(backupData);
      for (const key of keys) {
        if (key !== 'collection' && key !== 'settings') {
          await this.fs.storeSet(key, backupData[key]);
        }
      }
      return true;
    }
    return false;
  }

  // ==========================================================================
  // 2. LÓGICA DE EXPORTACIÓN (Core)
  // ==========================================================================

  /**
   * Genera un archivo de copia de seguridad (.paso) y abre el menú para compartirlo.
   */
  public async exportBackup(databaseData: any, onProgress?: (progress: number) => void): Promise<boolean> {
    try {
      const zip = new JSZip();

      // 1. Guardamos los datos puros (el Súper Objeto JSON)
      zip.file('database.json', JSON.stringify(databaseData));

      // Creamos la carpeta virtual dentro del ZIP para las fotos
      const photoFolder = zip.folder('photos');
      const photoPaths = this.extractAllPhotoPaths(databaseData);

      console.log(`📸 Procesando ${photoPaths.length} fotos para el backup...`);

      // 2. Lectura de fotos optimizada para evitar el bloqueo del hilo (ANR)
      for (let i = 0; i < photoPaths.length; i++) {
        const path = photoPaths[i];
        try {
          const file = await Filesystem.readFile({ path: path });
          const fileName = path.split('/').pop() || `img_${Date.now()}.jpg`;

          if (onProgress) onProgress(Math.round((i / photoPaths.length) * 80));

          if (photoFolder && file.data) {
            photoFolder.file(fileName, file.data, { base64: true });
          }

          // 🛡️ SALVAVIDAS 1: Dejamos respirar al procesador 20ms por foto
          await new Promise(resolve => setTimeout(resolve, 20));

        } catch (imgError) {
          console.warn(`⚠️ Foto no encontrada, saltando: ${path}`);
        }
      }

      console.log('📦 Comprimiendo el archivo ZIP (Esto puede tardar unos segundos)...');

      // 🛡️ OPTIMIZACIÓN 1: Generamos binario (Uint8Array) en lugar de una cadena Base64 gigante
      const zipData = await zip.generateAsync({ 
        type: 'uint8array',
        compression: 'DEFLATE',
        compressionOptions: {
          level: 6 // Nivel 6 es el equilibrio ideal entre velocidad y tamaño
        }
      });

      const backupFileName = `Backup_paso_${new Date().getTime()}.paso`; 
      
      // 🛡️ OPTIMIZACIÓN 2: Escritura binaria segmentada. 
      const binaryChunkSize = 768 * 1024; // 768KB de binario equivalen exactamente a 1MB en Base64

      for (let i = 0; i < zipData.length; i += binaryChunkSize) {
        const chunk = zipData.slice(i, i + binaryChunkSize);
        const base64Chunk = this.uint8ToBase64(chunk);

        if (onProgress) onProgress(80 + Math.round((i / zipData.length) * 20));

        if (i === 0) {
          await Filesystem.writeFile({
            path: backupFileName,
            data: base64Chunk,
            directory: Directory.Cache, 
            encoding: Encoding.UTF8    
          });
        } else {
          await Filesystem.appendFile({
            path: backupFileName,
            data: base64Chunk,
            directory: Directory.Cache,
            encoding: Encoding.UTF8
          });
        }

        // 🛡️ SALVAVIDAS: Dejamos que el hilo de UI respire un poco entre escrituras
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      console.log('✅ Archivo físico escrito correctamente. Abriendo menú de compartir...');

      if (onProgress) onProgress(100);

      // 3. Obtenemos la URI real del archivo que acabamos de crear a trozos
      const fileUri = await Filesystem.getUri({
          path: backupFileName,
          directory: Directory.Cache
      });

      // 4. Abrimos el menú nativo para compartir
      await Share.share({
        title: this.translate.instant('BACKUP.TRACKS'),
        url: fileUri.uri,
        dialogTitle: this.translate.instant('BACKUP.EXPORT')
      });

      return true;

    } catch (error) {
      console.error('[BackupService] Error CRÍTICO al exportar la copia:', error);
      return false;
    }
  }

  // ==========================================================================
  // 3. LÓGICA DE IMPORTACIÓN (Core)
  // ==========================================================================

  /**
   * Se usa desde la pantalla de Ajustes cuando el usuario elige un archivo manualmente.
   */
  public async importBackup(backupFileUri: string, onProgress?: (progress: number) => void): Promise<any | null> {
    try {
      const webPath = Capacitor.convertFileSrc(backupFileUri);
      const response = await fetch(webPath);
      // 🛡️ OPTIMIZACIÓN 3: Leer como ArrayBuffer es mucho más eficiente para archivos grandes
      const buffer = await response.arrayBuffer(); 

      return await this.importPasoFile(buffer, onProgress);
    } catch (error) {
      console.error('[BackupService] Error leyendo la URI desde Ajustes:', error);
      return null;
    }
  }

   /**
   * Lee el contenido de un archivo .paso, extrae las fotos,
   * reescribe las rutas y devuelve el objeto JSON listo para guardar.
   */
  public async importPasoFile(fileData: ArrayBuffer | string, onProgress?: (progress: number) => void): Promise<any | null> {
    try {
      if (!fileData) throw new Error('Los datos del archivo están vacíos.');

      const zip = new JSZip();
      const loadedZip = await zip.loadAsync(fileData, { base64: typeof fileData === 'string' });

      const jsonFile = loadedZip.file('database.json');
      if (!jsonFile) throw new Error('Archivo inválido: No contiene database.json');
      
      const jsonString = await jsonFile.async('string');
      let databaseData = JSON.parse(jsonString);
      
      // 🛡️ BLINDAJE 1: Por si el JSON se stringificó dos veces al exportar
      if (typeof databaseData === 'string') {
        console.warn('⚠️ Detectado JSON doblemente stringificado. Desempaquetando...');
        databaseData = JSON.parse(databaseData);
      }

      console.log('✅ JSON purificado. Claves detectadas:', Object.keys(databaseData));

      const newPhotoPaths = new Map<string, string>(); 
      const photoFolder = loadedZip.folder('photos');
      
      if (photoFolder) {
        const fileKeys = Object.keys(photoFolder.files);
        console.log(`📸 Extrayendo ${fileKeys.length} elementos de la carpeta de fotos...`);

        for (let i = 0; i < fileKeys.length; i++) {
          const zipEntry = photoFolder.files[fileKeys[i]];
          
          if (onProgress) onProgress(Math.round(((i + 1) / fileKeys.length) * 100));
          
          if (!zipEntry.dir) { 
            const imgBase64 = await zipEntry.async('base64');
            const fileName = zipEntry.name.split('/').pop() || `img_${Date.now()}.jpg`;

            const savedImage = await Filesystem.writeFile({
              path: `pasoapp_photos/${fileName}`, 
              data: imgBase64,
              directory: Directory.Data, 
              recursive: true 
            });

            newPhotoPaths.set(fileName, savedImage.uri);
            await new Promise(resolve => setTimeout(resolve, 20));
          }
        }
      }

      console.log('🔗 Re-vinculando rutas de fotos...');
      this.relinkPhotoPaths(databaseData, newPhotoPaths);

      console.log('🎉 Importación del núcleo completada con éxito. Enviando a AppComponent...');
      return databaseData;

    } catch (error) {
      console.error('[BackupService] ❌ Error importando la copia:', error);
      return null;
    }
  }

  // ==========================================================================
  // 4. HELPERS PRIVADOS
  // ==========================================================================

  /**
   * Sustituye las rutas de fotos antiguas por las nuevas URIs generadas en el dispositivo
   */
  private relinkPhotoPaths(data: any, newPathsMap: Map<string, string>): void {
    try {
      // 1. Relink en la Colección principal (para miniaturas y lista)
      if (data.collection && Array.isArray(data.collection)) {
        for (const item of data.collection) {
          if (item.photos && Array.isArray(item.photos)) {
            item.photos = item.photos.map((p: string) => {
              const fileName = p.split('/').pop();
              return (fileName && newPathsMap.has(fileName)) ? newPathsMap.get(fileName) : p;
            });
          }
        }
      }

      // 2. Relink en los Tracks individuales (para los iconos del mapa)
      const keys = Object.keys(data).filter(k => k !== 'collection');
      for (const key of keys) {
        const track = data[key];
        if (track?.features?.[0]?.waypoints) {
          for (const wpt of track.features[0].waypoints) {
            if (wpt.photos) {
              wpt.photos = wpt.photos.map((p: string) => {
                const fileName = p.split('/').pop();
                return (fileName && newPathsMap.has(fileName)) ? newPathsMap.get(fileName) : p;
              });
            }
          }
        }
      }
    } catch (error) {
      console.error('[BackupService] ❌ Error CRÍTICO vinculando fotos:', error);
    }
  }

  /**
   * Extrae todas las rutas de fotos de la base de datos para incluirlas en el ZIP
   */
  private extractAllPhotoPaths(data: any): string[] {
    let paths: string[] = [];
    
    // Extraer de la colección
    if (data.collection && Array.isArray(data.collection)) {
      data.collection.forEach((item: any) => {
        if (item.photos) paths.push(...item.photos);
      });
    }

    // Extraer de los tracks (waypoints)
    const keys = Object.keys(data).filter(k => k !== 'collection');
    for (const key of keys) {
      const track = data[key];
      if (track?.features?.[0]?.waypoints) {
        for (const wpt of track.features[0].waypoints) {
          if (wpt.photos) paths.push(...wpt.photos);
        }
      }
    }
    
    return [...new Set(paths)].filter(p => !!p);
  }

  /**
   * Helper para convertir trozos de binario a Base64 sin desbordar la pila
   */
  private uint8ToBase64(uint8: Uint8Array): string {
    let binary = '';
    const len = uint8.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(uint8[i]);
    }
    return btoa(binary);
  }
}