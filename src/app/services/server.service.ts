import { Injectable } from '@angular/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { BehaviorSubject, lastValueFrom } from 'rxjs';
import { HttpClient } from '@angular/common/http';

@Injectable({
  providedIn: 'root',
})
export class ServerService {
  private downloadProgress = new BehaviorSubject<number>(0); // 🔹 Track progress

  constructor(
    private http: HttpClient,
  ) {}

  getDownloadProgress() {
    return this.downloadProgress.asObservable(); // 🔹 Allow components to subscribe
  }
  
  async downloadBinaryFile(url: string, filePath: string, onProgress: (progress: number) => void): Promise<void> {
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

/*  async fetchMaps(): Promise<any> {
    const url = "https://www.dropbox.com/scl/fi/zyip6jym79ixv6b4tpnvr/maps.json?rlkey=crgfm7m6i92ymqn81t4p61igv&st=p65xzscb&dl=1";
    try {
      const response = await lastValueFrom(this.http.get<any>(url));
      console.log('Maps JSON:', response);
      return response;
    } catch (error) {
      console.error('Error fetching maps:', error);
      return null;
    }
  } */

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

}
