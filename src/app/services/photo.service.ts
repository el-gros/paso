import { Injectable } from '@angular/core';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Preferences } from '@capacitor/preferences';
import { PopoverController } from '@ionic/angular';

const PENDING_PHOTOS_KEY = 'pending_photos_queue';

@Injectable({
  providedIn: 'root'
})
export class PhotoService {
  private sessionFiles: string[] = []; 

  // Injectem l'AlertController al constructor
  constructor(private popoverController: PopoverController) { }

  public async takeAndSavePhoto(): Promise<string | null> {
    try {
      // 1. Comprovem l'estat actual dels permisos de la càmera
      let permissions = await Camera.checkPermissions();
      console.log("-> 2. Permisos actuals:", permissions);

      // 2. Si l'usuari ho ha denegat anteriorment o el sistema demana justificació
      if (permissions.camera === 'denied' || permissions.camera === 'prompt-with-rationale') {
        
        // Mostrem l'alerta d'Ionic i esperem a veure què decideix l'usuari
        const wantsToRetry = await this.mostrarAlertaPermisos();
        
        if (!wantsToRetry) {
          console.log("L'usuari ha cancel·lat l'explicació dels permisos.");
          return null; // Sortim sense fer res més
        }
      }

      // 3. Si no tenim el permís concedit (ja sigui per primer cop o perquè ha acceptat l'alerta), el demanem
      if (permissions.camera !== 'granted') {
        permissions = await Camera.requestPermissions();
        
        // Si després de demanar-ho segueix sense estar concedit, cancel·lem
        if (permissions.camera !== 'granted') {
          console.log("Permís de càmera denegat finalment.");
          return null;
        }
      }

      // 4. Si arribem aquí, tenim el permís! Obrim la càmera.
      console.log("-> 3. Cridant a Camera.getPhoto...");
      const capturedPhoto = await Camera.getPhoto({
        resultType: CameraResultType.Uri,
        source: CameraSource.Camera,
        quality: 80
      });
      console.log("-> 4. Foto capturada!");

      if (!capturedPhoto.path) return null;

      const fileName = `photo_${Date.now()}.jpeg`;

      const file = await Filesystem.readFile({ path: capturedPhoto.path });
      const savedFile = await Filesystem.writeFile({
        path: fileName,
        data: file.data,
        directory: Directory.Data
      });

      // Afegim a la memòria i GUARDEM EN PERSISTÈNCIA
      this.sessionFiles.push(fileName);
      await this.saveQueueToDisk();

      return savedFile.uri;
    } catch (error) {
      console.error("Error al capturar la foto:", error);
      return null;
    }
  }

  /**
   * Mostra un diàleg d'Ionic preguntant a l'usuari si vol donar permisos
   * Retorna una Promesa amb 'true' si accepta, o 'false' si cancel·la.
   */
  private async mostrarAlertaPermisos(): Promise<boolean> {
    // Asegúrate de poner la ruta correcta hacia el archivo que acabamos de crear
    const { CameraPermissionPopoverComponent } = await import('../camera-permission-popover.component');

    const popover = await this.popoverController.create({
      component: CameraPermissionPopoverComponent,
      cssClass: 'glass-island-wrapper', // Tu clase global clave
      backdropDismiss: false, // Recomiendo false para que el usuario tenga que pulsar un botón
      translucent: true
    });

    await popover.present();

    // Esperamos a que el popover se cierre y recogemos el dato que envía (true o false)
    const { data } = await popover.onDidDismiss();

    // Retornamos el valor. Si data es undefined (por ejemplo si forzó el cierre), devolverá false.
    return data === true;
  }

  // Llama a este método si el usuario GUARDA la ruta al final
  public async confirmSessionPhotos() {
    this.sessionFiles = []; 
    await Preferences.remove({ key: PENDING_PHOTOS_KEY }); // Limpiamos la cola
  }

  // Llama a este método si el usuario CANCELA la ruta explícitamente
  public async discardSessionPhotos() {
    for (const fileName of this.sessionFiles) {
      try {
        await Filesystem.deleteFile({ path: fileName, directory: Directory.Data });
      } catch (e) {} // Ignoramos errores si el archivo ya no existe
    }
    this.sessionFiles = []; 
    await Preferences.remove({ key: PENDING_PHOTOS_KEY });
  }

  // --- MÉTODOS PARA EL MANEJO DE CIERRES INESPERADOS ---

  private async saveQueueToDisk() {
    await Preferences.set({
      key: PENDING_PHOTOS_KEY,
      value: JSON.stringify(this.sessionFiles)
    });
  }

  /**
   * Ejecutar al arrancar la app. 
   * Elimina cualquier foto que se quedó "colgada" de una sesión interrumpida.
   */
  public async cleanOrphanedPhotosOnStartup() {
    const { value } = await Preferences.get({ key: PENDING_PHOTOS_KEY });
    
    if (value) {
      const orphanedFiles: string[] = JSON.parse(value);
      console.log(`🧹 Limpiando ${orphanedFiles.length} fotos zombis de un cierre anterior...`);
      
      for (const fileName of orphanedFiles) {
        try {
          await Filesystem.deleteFile({ path: fileName, directory: Directory.Data });
        } catch (e) {}
      }
      
      await Preferences.remove({ key: PENDING_PHOTOS_KEY });
    }
  }
}