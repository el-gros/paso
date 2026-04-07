import { Injectable } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { lastValueFrom } from 'rxjs';

// --- INTERNAL IMPORTS ---
import { PresentService } from './present.service';
import { LocationManagerService } from './location-manager.service';
import { PhotoService } from './photo.service';
import { SearchService } from './search.service';
import { FunctionsService } from './functions.service';
import { Waypoint } from '../../globald';

@Injectable({ providedIn: 'root' })
export class PhotoWaypointService {
  
  constructor(
    private present: PresentService,
    private location: LocationManagerService,
    private photo: PhotoService,
    private searchService: SearchService,
    private fs: FunctionsService,
    private translate: TranslateService
  ) {}

  // ==========================================================================
  // 1. ACCIONES PÚBLICAS
  // ==========================================================================

  /**
   * Orquesta la creación de un Waypoint con foto:
   * 1. Captura la imagen.
   * 2. Obtiene el nombre del lugar vía Geocoding Inverso.
   * 3. Inserta el Waypoint en el track actual con altitud y coordenadas.
   */
  public async addPhotoWaypoint(): Promise<void> {
    const coordsArray = this.present.currentTrack?.features?.[0]?.geometry?.coordinates;

    if (!this.present.currentTrack || this.location.state !== 'tracking' || !coordsArray || coordsArray.length === 0) {
      this.fs.displayToast('Esperant el primer punt GPS per fer fotos...', 'warning');
      return;
    }
    
    const photoUri = await this.photo.takeAndSavePhoto();
    if (!photoUri) return;

    try {
      const index = coordsArray.length - 1;
      const currentPoint = coordsArray[index];
      const trackDataArray = this.present.currentTrack.features[0].geometry.properties?.data;
      const realAltitude = trackDataArray && trackDataArray[index] ? trackDataArray[index].compAltitude : undefined;

      let placeName = this.translate.instant('MAP.PHOTO_WAYPOINT_NAME') || 'Foto'; 

      // Geocoding inverso
      try {
        const addressObservable = this.searchService.reverseGeocode(currentPoint[1], currentPoint[0]);
        const addressPromise = lastValueFrom(addressObservable);
        const timeoutPromise = new Promise(resolve => setTimeout(() => resolve(null), 800)); 
        
        const address: any = await Promise.race([addressPromise, timeoutPromise]);
        
        if (address) {
          const foundName = address.short_name || address.name || address.display_name;
          if (foundName) placeName = `📷 ${foundName}`; 
        }
      } catch (geoError) {
        console.warn("⚠️ No s'ha pogut obtenir el nom del lloc per a la foto.", geoError);
      }

      const newWaypoint: Waypoint = {
        name: placeName,             
        longitude: currentPoint[0], 
        latitude: currentPoint[1],  
        altitude: realAltitude,      
        photos: [photoUri]
      };

      if (!this.present.currentTrack.features[0].waypoints) {
        this.present.currentTrack.features[0].waypoints = [];
      }
      this.present.currentTrack.features[0].waypoints.push(newWaypoint);

      this.fs.displayToast('Foto afegida a la ruta', 'success');

    } catch (error) {
      console.error("❌ Error al guardar el waypoint de la foto:", error);
      this.fs.displayToast('Error en desar la foto', 'error');
    }
  }
}