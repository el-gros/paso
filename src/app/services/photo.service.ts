import { Injectable } from '@angular/core';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Preferences } from '@capacitor/preferences';
import { PopoverController } from '@ionic/angular';

// --- CONSTANTES ---
const PENDING_PHOTOS_KEY = 'pending_photos_queue';

@Injectable({
  providedIn: 'root'
})
export class PhotoService {
  
  // --- ESTADO INTERNO ---
  // Guarda los nombres de los archivos temporales de la ruta actual
  private sessionFiles: string[] = []; 

  constructor(private popoverController: PopoverController) { }

  // ==========================================================================
  // 1. MANTENIMIENTO Y ARRANQUE (Lifecycle)
  // ==========================================================================

  /**
   * Ejecutar al arrancar la app (ej. app.component o tab1). 
   * Elimina fotos que se quedaron "colgadas" si la app se cerró de golpe.
   */
  public async cleanOrphanedPhotosOnStartup(): Promise<void> {
    try {
      const { value } = await Preferences.get({ key: PENDING_PHOTOS_KEY });
      
      if (value) {
        const orphanedFiles: string[] = JSON.parse(value);
        console.log(`[PhotoService] 🧹 Limpiando ${orphanedFiles.length} fotos zombis de una sesión anterior...`);
        
        for (const fileName of orphanedFiles) {
          try {
            await Filesystem.deleteFile({ path: fileName, directory: Directory.Data });
          } catch (e) {
            // Ignoramos si el archivo ya no existe físicamente
          }
        }
        
        await Preferences.remove({ key: PENDING_PHOTOS_KEY });
      }
    } catch (error) {
      console.error('[PhotoService] Error limpiando fotos huérfanas:', error);
    }
  }

  // ==========================================================================
  // 2. ACCIONES PRINCIPALES (Public API)
  // ==========================================================================

  /**
   * Abre la cámara, toma la foto, la guarda en el sistema de archivos
   * y la registra en la cola de la sesión actual.
   */
  public async takeAndSavePhoto(): Promise<string | null> {
    try {
      // 1. Gestionar Permisos
      const hasPermission = await this.ensureCameraPermissions();
      if (!hasPermission) {
        console.warn("[PhotoService] 🚫 Permiso de cámara denegado por el usuario.");
        return null;
      }

      // 2. Abrir cámara nativa
      console.log("[PhotoService] 📸 Abriendo cámara...");
      const capturedPhoto = await Camera.getPhoto({
        resultType: CameraResultType.Uri,
        source: CameraSource.Camera,
        quality: 80
      });

      if (!capturedPhoto.path) return null;

      // 3. Guardar en el sistema de archivos (Data Directory)
      const fileName = `photo_${Date.now()}.jpeg`;
      const file = await Filesystem.readFile({ path: capturedPhoto.path });
      
      const savedFile = await Filesystem.writeFile({
        path: fileName,
        data: file.data,
        directory: Directory.Data
      });

      // 4. Registrar en la sesión y persistir la cola por seguridad
      this.sessionFiles.push(fileName);
      await this.saveQueueToDisk();

      console.log(`[PhotoService] ✅ Foto guardada con éxito: ${fileName}`);
      return savedFile.uri;

    } catch (error) {
      console.error("[PhotoService] ❌ Error al capturar o guardar la foto:", error);
      return null;
    }
  }

  /**
   * Llama a este método si el usuario GUARDA la ruta al final.
   * Borra la memoria temporal porque las fotos ya son definitivas.
   */
  public async confirmSessionPhotos(): Promise<void> {
    this.sessionFiles = []; 
    await Preferences.remove({ key: PENDING_PHOTOS_KEY }); 
    console.log("[PhotoService] 💾 Sesión de fotos confirmada y cola limpiada.");
  }

  /**
   * Llama a este método si el usuario CANCELA la ruta en curso.
   * Borra los archivos físicos creados durante esta sesión.
   */
  public async discardSessionPhotos(): Promise<void> {
    console.log(`[PhotoService] 🗑️ Descartando ${this.sessionFiles.length} fotos de la sesión actual...`);
    
    for (const fileName of this.sessionFiles) {
      try {
        await Filesystem.deleteFile({ path: fileName, directory: Directory.Data });
      } catch (e) {
        // Ignoramos errores si el archivo ya no existe
      }
    }
    
    this.sessionFiles = []; 
    await Preferences.remove({ key: PENDING_PHOTOS_KEY });
  }

  // ==========================================================================
  // 3. MÉTODOS PRIVADOS (Helpers)
  // ==========================================================================

  /**
   * Verifica los permisos. Si es necesario, muestra el popover explicativo
   * y lanza la petición nativa.
   */
  private async ensureCameraPermissions(): Promise<boolean> {
    let permissions = await Camera.checkPermissions();

    // Si está denegado o requiere explicación previa (Android)
    if (permissions.camera === 'denied' || permissions.camera === 'prompt-with-rationale') {
      const wantsToRetry = await this.showPermissionRationalePopover();
      if (!wantsToRetry) return false;
    }

    // Si aún no está concedido, lanzamos el prompt nativo del SO
    if (permissions.camera !== 'granted') {
      permissions = await Camera.requestPermissions();
    }

    return permissions.camera === 'granted';
  }

  /**
   * Muestra el popover de Ionic para explicar por qué necesitamos la cámara.
   */
  private async showPermissionRationalePopover(): Promise<boolean> {
    // Importación dinámica (Lazy Load) para evitar dependencias circulares
    const { CameraPermissionPopoverComponent } = await import('../camera-permission-popover.component');

    const popover = await this.popoverController.create({
      component: CameraPermissionPopoverComponent,
      cssClass: 'glass-island-wrapper', 
      backdropDismiss: false, 
      translucent: true
    });

    await popover.present();
    const { data } = await popover.onDidDismiss();
    
    return data === true;
  }

  /**
   * Persiste la lista de archivos temporales en las Preferencias
   * para sobrevivir a un cierre inesperado de la app.
   */
  private async saveQueueToDisk(): Promise<void> {
    await Preferences.set({
      key: PENDING_PHOTOS_KEY,
      value: JSON.stringify(this.sessionFiles)
    });
  }
}