import { Injectable } from '@angular/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { CapacitorSQLite, SQLiteConnection, SQLiteDBConnection } from '@capacitor-community/sqlite';

@Injectable({
  providedIn: 'root',
})
export class MbTilesService {
  private sqlite: SQLiteConnection;
  // 🚀 Guardamos múltiples conexiones usando el nombre del archivo como llave
  private dbs: Map<string, SQLiteDBConnection> = new Map();
  private isInitialized = false;
  public currentMbTiles: string = '';

  constructor() {
    this.sqlite = new SQLiteConnection(CapacitorSQLite);
  }

  async initializePlugin() {
    if (this.isInitialized) return;
    try {
      await this.sqlite.checkConnectionsConsistency();
      this.isInitialized = true;
    } catch (e) {
      console.error('[MbTilesService] Plugin initialization failed', e);
    }
  }

  // 🚀 Abre la conexión y la registra en el diccionario
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
  
  // =========================================================================
  // 🚀 SOBRECARGA DE FUNCIONES PARA RETROCOMPATIBILIDAD
  // =========================================================================
  
  // Firma 1: La que espera OpenLayers (3 parámetros)
  async getVectorTile(zoom: number, x: number, y: number): Promise<ArrayBuffer | null>;
  
  // Firma 2: La nueva que espera MapLibre (4 parámetros)
  async getVectorTile(mbtilesFile: string, zoom: number, x: number, y: number): Promise<ArrayBuffer | null>;
  
  // Implementación real que decide qué hacer según los argumentos recibidos
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

    const db = this.dbs.get(mbtilesFile);
    
    if (!db) {
      console.error(`❌ Database connection for ${mbtilesFile} is not open.`);
      return null;
    }

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
}