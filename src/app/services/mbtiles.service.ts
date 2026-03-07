import { Injectable } from '@angular/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { CapacitorSQLite, SQLiteConnection, SQLiteDBConnection } from '@capacitor-community/sqlite';

@Injectable({
  providedIn: 'root',
})
export class MbTilesService {
  private sqlite: SQLiteConnection;
  private db: SQLiteDBConnection | null = null;
  public currentMbTiles: string = '';
  private isInitialized = false;

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

  async open(mbtilesFile: string): Promise<boolean> {
    try {
      const result = await Filesystem.getUri({
        directory: Directory.Data,
        path: mbtilesFile
      });

      let dbPath = result.uri;
      if (dbPath.startsWith('file://')) dbPath = dbPath.replace('file://', '');
      dbPath = decodeURI(dbPath);

      const isConn = await this.sqlite.isConnection(dbPath, false);
      
      if (isConn.result) {
        this.db = await this.sqlite.retrieveConnection(dbPath, false);
      } else {
        this.db = await this.sqlite.createNCConnection(dbPath, 1);
      }

      await this.db.open();
      this.currentMbTiles = mbtilesFile;
      console.log(`✅ MBTiles abierta: ${mbtilesFile}`);
      return true;
    } catch (err) {
      console.error("[MbTilesService] Error abriendo MBTiles:", err);
      return false;
    }
  }

  // 🚀 Nombre exacto que espera OpenLayers y tu MapService
  async getVectorTile(zoom: number, x: number, y: number): Promise<ArrayBuffer | null> {
    if (!this.db) {
      console.error('❌ Database connection is not open.');
      return null;
    }

    // MBTiles Flip: OpenLayers es XYZ (arriba a abajo), MBTiles es TMS (abajo a arriba)
    const tmsY = Math.pow(2, zoom) - 1 - y;

    try {
      const result = await this.db.query(
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
      console.error("[MbTilesService] SQL Query Error:", err);
    }
    
    return null;
  }
}