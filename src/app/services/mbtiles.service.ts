import { Injectable } from '@angular/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { CapacitorSQLite, SQLiteConnection, SQLiteDBConnection } from '@capacitor-community/sqlite';
import { ServerService } from './server.service';

@Injectable({
  providedIn: 'root',
})
export class MbTilesService {
  private sqlite: SQLiteConnection;
  // 🚀 Guardamos múltiples conexiones usando el nombre del archivo como llave
  
  // ==========================================
  // 1. ESTADO INTERNO
  // ==========================================
  /** Guardamos múltiples conexiones usando el nombre del archivo como llave. */
  private dbs: Map<string, SQLiteDBConnection> = new Map();
  private isInitialized = false;
  public currentMbTiles: string = '';

  // ==========================================
  // 2. INYECCIONES
  // ==========================================
  constructor(private server: ServerService) {
    this.sqlite = new SQLiteConnection(CapacitorSQLite);
  }

  // ==========================================
  // 3. INICIALIZACIÓN
  // ==========================================

  /** Prepara el plugin nativo de SQLite */
  async initializePlugin() {
    if (this.isInitialized) return;
    try {
      await this.sqlite.checkConnectionsConsistency();
      this.isInitialized = true;
    } catch (e) {
      console.error('[MbTilesService] Plugin initialization failed', e);
    }
  }

  /**
   * Busca mapas descargados en el disco y los abre para que estén listos en caché.
   */
  async initializeOfflineMaps() {
    try {
      await this.initializePlugin();
      const filesInDataDirectory = await this.server.listFilesInDataDirectory();
      const downloadedMaps = filesInDataDirectory.filter(file => file.endsWith('.mbtiles'));

      if (downloadedMaps.length === 0) {
        console.log('🗺️ No hay mapas offline descargados.');
        return;
      }

      console.log(`🗺️ Preparando ${downloadedMaps.length} mapa(s) offline...`);

      for (const fileName of downloadedMaps) {
        const success = await this.open(fileName);
        if (success) {
          console.log(`✅ Mapa offline listo y en caché: ${fileName}`);
        }
      }
    } catch (error) {
      console.error('❌ Error crítico inicializando mapas:', error);
    }
  }

  // 🚀 Abre la conexión y la registra en el diccionario
  // ==========================================
  // 4. GESTIÓN DE CONEXIONES
  // ==========================================
  /** Abre la conexión a un archivo MBTiles y la registra en el diccionario. */
  async open(mbtilesFile: string): Promise<boolean> {
    // Guardamos el archivo actual para que el sistema antiguo (OpenLayers) sepa cuál usar por defecto
    this.currentMbTiles = mbtilesFile; 

    // Si ya la tenemos abierta en memoria, evitamos volver a instanciar
    if (this.dbs.has(mbtilesFile)) return true;

    try {
      const result = await Filesystem.getUri({
        directory: Directory.Data,
        path: mbtilesFile
      });

      let dbPath = result.uri;
      if (dbPath.startsWith('file://')) dbPath = dbPath.replace('file://', '');
      dbPath = decodeURI(dbPath);

      let db: SQLiteDBConnection;
      const isConn = await this.sqlite.isConnection(dbPath, false);
      
      if (isConn.result) {
        db = await this.sqlite.retrieveConnection(dbPath, false);
      } else {
        db = await this.sqlite.createNCConnection(dbPath, 1);
      }

      await db.open();
      // Registramos la conexión
      this.dbs.set(mbtilesFile, db);
      console.log(`✅ MBTiles abierta: ${mbtilesFile}`);
      return true;
    } catch (err) {
      console.error(`[MbTilesService] Error abriendo MBTiles ${mbtilesFile}:`, err);
      return false;
    }
  }
  
  // ==========================================================================
  // 5. ACCESO A DATOS (Tiles)
  // ==========================================================================

  // Firma 1: La que espera OpenLayers (3 parámetros)
  async getVectorTile(zoom: number, x: number, y: number): Promise<ArrayBuffer | null>;
  
  // Firma 2: La nueva que espera MapLibre (4 parámetros)
  async getVectorTile(mbtilesFile: string, zoom: number, x: number, y: number): Promise<ArrayBuffer | null>;
  
  /**
   * Recupera el Blob de una tesela desde la base de datos SQLite.
   * Implementa lógica de "TMS" para la coordenada Y y "Lazy Loading" para la apertura del archivo.
   */
  async getVectorTile(arg1: string | number, arg2: number, arg3: number, arg4?: number): Promise<ArrayBuffer | null> {
    
    let mbtilesFile: string;
    let zoom: number, x: number, y: number;

    // Detectamos la firma: ¿Viene un string primero (MapLibre) o un número (OpenLayers)?
    if (typeof arg1 === 'string') {
      mbtilesFile = arg1;
      zoom = arg2;
      x = arg3;
      y = arg4 as number;
    } else {
      mbtilesFile = this.currentMbTiles; // Usa el fallback para OpenLayers
      zoom = arg1;
      x = arg2;
      y = arg3;
    }

    let db = this.dbs.get(mbtilesFile);
    
    // 🚀 EL ARREGLO: Lazy Loading (Apertura al vuelo)
    if (!db) {
      console.warn(`⚠️ La base de datos no estaba lista. Abriendo al vuelo: ${mbtilesFile}`);
      const success = await this.open(mbtilesFile);
      
      if (!success) {
        console.error(`❌ Imposible abrir el archivo ${mbtilesFile}. ¿Seguro que está descargado?`);
        return null; // Salimos si realmente el archivo no existe físicamente
      }
      
      // Si tuvo éxito, lo recuperamos del diccionario
      db = this.dbs.get(mbtilesFile);
    }
    
    // 🛡️ Doble comprobación de seguridad para contentar a TypeScript
    if (!db) return null;

    const tmsY = Math.pow(2, zoom) - 1 - y;

    try {
      const result = await db.query(
        `SELECT tile_data FROM tiles WHERE zoom_level = ? AND tile_column = ? AND tile_row = ?;`,
        [zoom, x, tmsY] 
      );

      if (result?.values && result.values.length > 0) {
        const tileData = result.values[0].tile_data;
        if (!tileData) return null;

        if (typeof tileData === 'string') {
          const binaryString = atob(tileData);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          return bytes.buffer as ArrayBuffer;
        }

        return (tileData instanceof ArrayBuffer) 
          ? tileData 
          : new Uint8Array(tileData as any).buffer as ArrayBuffer;
      }
    } catch (err) {
      // Silenciado intencionadamente para evitar logs masivos cuando se pide un tile sin datos
    }
    
    return null;
  }

  /**
   * Obtiene una lista de los nombres de archivos MBTiles que están actualmente abiertos.
   */
  getOpenedFiles(): string[] {
    // Retorna los nombres de los archivos que están en el Map de dbs
    return Array.from(this.dbs.keys());
  }

  /**
   * Cierra la conexión a un archivo MBTiles y lo elimina del diccionario.
   * @param mbtilesFile El nombre del archivo MBTiles a cerrar.
   */
  async close(mbtilesFile: string): Promise<boolean> {
    const db = this.dbs.get(mbtilesFile);
    
    if (!db) return true; // Si no estaba en memoria, no hay nada que cerrar

    try {
      await db.close();
      this.dbs.delete(mbtilesFile);
      console.log(`🔒 MBTiles cerrado y liberado: ${mbtilesFile}`);
      return true;
    } catch (err) {
      console.error(`[MbTilesService] Error cerrando MBTiles ${mbtilesFile}:`, err);
      return false;
    }
  }
}