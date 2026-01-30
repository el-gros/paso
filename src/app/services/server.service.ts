import { Injectable } from '@angular/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { BehaviorSubject } from 'rxjs';
import { CapacitorSQLite, SQLiteConnection, SQLiteDBConnection } from '@capacitor-community/sqlite';

@Injectable({
  providedIn: 'root',
})
export class ServerService {

  private downloadProgress = new BehaviorSubject<number>(0); // 🔹 Track progress
  private sqlite: SQLiteConnection;
  private db: SQLiteDBConnection | null = null;
  currentMbTiles: string = '';
  private isInitialized = false;

  constructor( ) {
    this.sqlite = new SQLiteConnection(CapacitorSQLite);
  }

  // 1. GET DOWNLOAD PROGRESS
  // 2. DOWNLOAD BINARY FILE
  // 3. ARRAY BUFFER TO BASE64
  // 4. LIST FILES IN DATA DIRECTORY
  // 5. OPEN MBTILES FILE
  // 6. GET VECTOR TILE

  // 1. GET DOWNLOAD PROGRESS ////////////////////////////////
  getDownloadProgress() {
    return this.downloadProgress.asObservable(); // 🔹 Allow components to subscribe
  }

  // 2. DOWNLOAD BINARY FILE ////////////////////////
  async downloadBinaryFile(url: string, filePath: string, onProgress: (progress: number) => void): Promise<void> {
    try {
      await Filesystem.deleteFile({
        path: filePath,
        directory: Directory.Data,
      });
    } catch (error) {
      console.log('ℹ️ No existing file to delete, proceeding with download.');
    }
    const chunkSize = 1024 * 1024 * 10; // 🔹 10 MB chunks
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', url, true);
      xhr.responseType = 'arraybuffer';
      // 🔹 Update progress during download
      xhr.onprogress = (event) => {
        if (event.lengthComputable) {
          const percent = Math.floor((event.loaded / event.total) * 100);
          this.downloadProgress.next(percent); // 🔹 Emit progress
        }
      };
      // Process...
      xhr.onload = async () => {
        if (xhr.status === 200) {
          try {
            const arrayBuffer = xhr.response;
            const uint8Array = new Uint8Array(arrayBuffer);
            const totalSize = uint8Array.length;
            let offset = 0;
            console.log('Saving file in chunks...');
            // Save chunks to file
            while (offset < totalSize) {
              // Get next chunk
              const chunk = uint8Array.slice(offset, offset + chunkSize);
              // Update amount of bytes downloaded
              offset += chunk.length;
              // Save chunk to file
              await Filesystem.appendFile({
                path: filePath,
                data: this.arrayBufferToBase64(chunk),
                directory: Directory.Data,
              });
              // 🔹 Emit progress update
              const percentSaved = Math.floor((offset / totalSize) * 100);
              this.downloadProgress.next(percentSaved);
              console.log(`Saved ${percentSaved}%`);
            }
            // Download completed
            console.log('Download complete!');
            this.downloadProgress.next(100); // 🔹 Ensure UI shows 100% on finish
            resolve();
          } catch (error) {
            console.error('Error processing file:', error);
            reject(error);
          }
        } else {
          reject(`Failed to download file: ${xhr.status}`);
        }
      };
      // On error...
      xhr.onerror = () => reject('Download error');
      xhr.send();
    });
  }

  // 3. ARRAY BUFFER TO BASE64 ///////////////////////
  private arrayBufferToBase64(buffer: Uint8Array): string {
    let binary = '';
    buffer.forEach((byte) => (binary += String.fromCharCode(byte)));
    return btoa(binary);
  }

  // 4. LIST FILES IN DATA DIRECTORY ///////////////////////
  async listFilesInDataDirectory(): Promise<string[]> {
    try {
      const result = await Filesystem.readdir({
        path: '',
        directory: Directory.Data,
      });
      return result.files.filter(file => file.name.endsWith('.mbtiles')).map(file => file.name);
    } catch (error) {
      console.error('Error listing files in data directory:', error);
      return [];
    }
  }

  async initializePlugin() {
    if (this.isInitialized) return;
    try {
      // On Android, some versions require this to wake up the bridge
      await this.sqlite.checkConnectionsConsistency();
      this.isInitialized = true;
    } catch (e) {
      console.error('Plugin initialization failed', e);
    }
  }

  async openMbtiles(mbtilesFile: string) {
    try {
      const result = await Filesystem.getUri({
        directory: Directory.Data,
        path: mbtilesFile
      });

      let dbPath = result.uri;
      if (dbPath.startsWith('file://')) dbPath = dbPath.replace('file://', '');
      dbPath = decodeURI(dbPath);

      // 🔹 FIX: Check if we already have this connection
      const isConn = await this.sqlite.isConnection(dbPath, false);
      
      if (isConn.result) {
        this.db = await this.sqlite.retrieveConnection(dbPath, false);
      } else {
        this.db = await this.sqlite.createNCConnection(dbPath, 1);
      }

      await this.db.open();
      console.log("✅ MBTiles Database is OPEN");
    } catch (err) {
      console.error("Connection error:", err);
    }
  }

  // 6. GET VECTOR TILE ///////////////////////
  async getVectorTile(zoom: number, x: number, y: number): Promise<ArrayBuffer | null> {
    if (!this.db) {
      console.error('❌ Database connection is not open.');
      return null;
    }

    // 🔹 MBTiles Flip: OpenLayers is XYZ (top-down), MBTiles is TMS (bottom-up).
    const tmsY = Math.pow(2, zoom) - 1 - y;

    try {
      const result = await this.db.query(
        `SELECT tile_data FROM tiles WHERE zoom_level = ? AND tile_column = ? AND tile_row = ?;`,
        [zoom, x, tmsY] 
      );

      // FIX 1 & 2: Use optional chaining (?.) and check for existence to fix "possibly undefined"
      if (result?.values && result.values.length > 0) {
        const tileData = result.values[0].tile_data;

        if (!tileData) return null;

        // Handle String/Base64 return
        if (typeof tileData === 'string') {
          const binaryString = atob(tileData);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          return bytes.buffer;
        }

        // FIX 3: Cast to ArrayBuffer | null explicitly to resolve "SharedArrayBuffer" conflict
        // We wrap it in Uint8Array first to guarantee we have a standard buffer.
        const buffer = (tileData instanceof ArrayBuffer) 
          ? tileData 
          : new Uint8Array(tileData as Iterable<number>).buffer;

        return buffer as ArrayBuffer;
      }
    } catch (err) {
      console.error("SQL Query Error:", err);
    }
    
    return null;
  }

}
