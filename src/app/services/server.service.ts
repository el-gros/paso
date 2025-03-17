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

  constructor( ) {
    this.sqlite = new SQLiteConnection(CapacitorSQLite);
  }

  getDownloadProgress() {
    return this.downloadProgress.asObservable(); // 🔹 Allow components to subscribe
  }
  
  async downloadBinaryFile(url: string, filePath: string, onProgress: (progress: number) => void): Promise<void> {
    try {
      await Filesystem.deleteFile({
        path: filePath,
        directory: Directory.Data,
      });
      console.log('✅ Previous file deleted.');
    } catch (error) {
      console.log('ℹ️ No existing file to delete, proceeding with download.');
    }
    const chunkSize = 1024 * 1024 * 10; // 🔹 10 MB chunks
    return new Promise((resolve, reject) => {
      console.log('Starting chunked download...');
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

  private arrayBufferToBase64(buffer: Uint8Array): string {
    let binary = '';
    buffer.forEach((byte) => (binary += String.fromCharCode(byte)));
    return btoa(binary);
  }

  // Method to list files in the data directory
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

  async getMbtilesPath(): Promise<string> {
    const fileUri = await Filesystem.getUri({
      path: 'catalonia.mbtiles',
      directory: Directory.Data,
    });
    console.log('MBTiles path:', fileUri.uri);
    // Convert 'file://' URI to a native file path
    return fileUri.uri.replace('file://', '');
  }

  async openMbtiles(mbtilesFile: string) {
    try {
      // If the database is already open with the same path, do nothing
      if (this.db && this.currentMbTiles === mbtilesFile) {
        console.log('Database already opened with the same path:');
        return;
      }
      // If a different database is open, close it
      if (this.db) {
        console.log('Closing previous database:', this.currentMbTiles);
        await this.db.close();
        this.db = null;
      }
      // Check mbtiles path
      const appDir = await Filesystem.getUri({
        directory: Directory.Data,
        path: ''
      });
      var dbPath = `${appDir.uri}/${mbtilesFile}`;
      dbPath = dbPath.replace('file://', '');
    } catch (statError) {
      console.error('Database file does not exist. Please download it.', statError);
      return; // Exit the function if the file doesn't exist
    }
    try {
      // Create the connection to the database
      this.db = await this.sqlite.createNCConnection(dbPath, 1);
      // Open the database
      await this.db.open();
      this.currentMbTiles = mbtilesFile;
    } catch (error) {
      console.error('❌ Failed to open MBTiles:', error);
    }
  }

  async getVectorTile(zoom: number, x: number, y: number): Promise<ArrayBuffer | null> {
    if (!this.db) {
      console.error('❌ Database connection is not open.');
      return null;
    }
    // Query the database for the tile using XYZ coordinates
    const resultXYZ = await this.db.query(
      `SELECT tile_data FROM tiles WHERE zoom_level = ? AND tile_column = ? AND tile_row = ?;`,
      [zoom, x, y]  
    );
    if (resultXYZ?.values?.length) {
      const tileData = resultXYZ.values[0].tile_data;
      // Ensure tileData is returned as an ArrayBuffer
      if (tileData instanceof ArrayBuffer) {
        return tileData;
      } else if (Array.isArray(tileData)) {
        return new Uint8Array(tileData).buffer; // Convert array to ArrayBuffer
      } else {
        console.error(`❌ Unexpected tile_data format for ${zoom}/${x}/${y}`, tileData);
        return null;
      }
    } else {
      console.log(`❌ No tile found: z=${zoom}, x=${x}, y=${y}`);
      return null;
    }
  }


}

