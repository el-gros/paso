import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

// --- OPENLAYERS IMPORTS ---
import { MapBrowserEvent } from 'ol';
import Feature, { FeatureLike } from 'ol/Feature'; 
import { Coordinate } from 'ol/coordinate';
import { SimpleGeometry } from 'ol/geom'; 

// --- INTERNAL IMPORTS ---
import { GeographyService } from './geography.service';
import { ReferenceService } from './reference.service';
import { FunctionsService } from './functions.service';
import { MapService } from './map.service';
import { LocationManagerService } from './location-manager.service';
import { Waypoint } from 'src/globald';

@Injectable({
  providedIn: 'root'
})
export class MapInteractionService {

  // "Timbre" para avisar a Tab1Page de que hay cambios visuales y debe renderizar
  public readonly mapNeedsUpdate$ = new Subject<void>();

  constructor(
    private geography: GeographyService,
    private reference: ReferenceService,
    private fs: FunctionsService,
    private mapService: MapService,
    private location: LocationManagerService
  ) {}

  // ==========================================================================
  // 1. INICIALIZACIÓN DEL LISTENER
  // ==========================================================================
  
  public initClickHandling(): void {
    const map = this.geography.map;
    if (!map) {
      console.warn("⚠️ [MapInteraction] Intento de iniciar clicks sin mapa listo.");
      return;
    }
    // Prevenimos suscripciones duplicadas
    map.un('singleclick', this.handleMapClick);
    map.on('singleclick', this.handleMapClick);
    console.log("🎯 [MapInteraction] Francotirador de clicks activado.");
  }

  // ==========================================================================
  // 2. ENRUTADOR PRINCIPAL DE CLICKS
  // ==========================================================================

  private handleMapClick = async (event: MapBrowserEvent<any>) => {
    const map = this.geography.map;
    if (!map || !this.geography.archivedLayer?.getSource()) return;

    let hitFeature: FeatureLike | null = null;
    map.forEachFeatureAtPixel(event.pixel, (feature: FeatureLike) => {
      hitFeature = feature;
      return true; // Detiene la búsqueda al encontrar el primero
    }, { hitTolerance: 5 });

    if (!hitFeature) return;

    const selectedFeature = hitFeature as Feature;
    const type = selectedFeature.get('type');
    const geometry = selectedFeature.getGeometry() as SimpleGeometry;
    
    if (!geometry) return;

    if (this.reference.archivedTrack) {
      await this.handleArchivedTrackClick(type, selectedFeature, geometry, event);
    } else {
      await this.handleGeneralMapClick(type, selectedFeature, geometry, event);
    }
  }

  // ==========================================================================
  // 3. LÓGICA ESPECÍFICA DE CLICKS
  // ==========================================================================

  private async handleArchivedTrackClick(type: string, feature: any, geometry: SimpleGeometry, event: MapBrowserEvent<any>) {
    // --- CASO 1: CLICK EN UN WAYPOINT (Editar nombre/comentario/foto) ---
    if (type === 'archived_waypoints') {
      
      // 1. Obtenemos coordenadas y evitamos nulos
      const rawCoords = geometry.getCoordinates() as any[] | null;
      if (!rawCoords) return;

      // 2. Normalizamos para que siempre sea un array de coordenadas (Coordinate[])
      const coordsArray = (Array.isArray(rawCoords[0]) ? rawCoords : [rawCoords]) as Coordinate[];
      
      const clickedCoordinate = geometry.getClosestPoint(event.coordinate);
      const index = this.findClosestIndex(coordsArray, clickedCoordinate); // 🚀 ¡Error solucionado!

      if (index !== -1) {
        const waypoints: Waypoint[] = feature.get('waypoints');
        
        if (waypoints && waypoints[index]) {
          const response = await this.fs.editWaypoint(waypoints[index], true, false);
          
          if (response && response.action === 'ok') {
            waypoints[index].name = response.name || '';
            waypoints[index].comment = response.comment || '';

            if (this.reference.archivedTrack?.features?.[0]) {
              this.reference.archivedTrack.features[0].waypoints = waypoints;

              const dateValue = this.reference.archivedTrack.features[0].properties.date;
              if (dateValue) {
                const trackKey = dateValue instanceof Date ? dateValue.toISOString() : dateValue as string;
                await this.fs.storeSet(trackKey, this.reference.archivedTrack);
                this.fs.displayToast('MAP.WAYPOINT_UPDATED', 'success');
              }
            }
          }
        }
      }
    } 
    // --- CASO 2: CLICK EN LA LÍNEA O PUNTOS DEL TRACK (Editar Track completo) ---
    else {
      const trackElements = ['archived_line', 'archived_start', 'archived_end', 'archived_points'];
      
      if (trackElements.includes(type)) {
        const archivedDate = this.reference.archivedTrack?.features?.[0]?.properties?.date;
        
        if (archivedDate) {
          const archivedTime = new Date(archivedDate).getTime();
          const index = this.fs.collection.findIndex((item: any) => 
            item.date && new Date(item.date).getTime() === archivedTime
          );

          if (index >= 0) {
            await this.reference.editTrack(index);
            this.reference.foundRoute = false; // Reseteamos el estado de "ruta encontrada" al editar
          } else {
            await this.reference.editTrack(-1); // Ruta temporal / borrador
          }
        }
      }
    }
  }

  private async handleGeneralMapClick(type: string, feature: Feature, geometry: SimpleGeometry, event: MapBrowserEvent<any>) {
    // --- CASO 1: Click en Puntos (Waypoints o Clusters) ---
    if (type === 'archived_points') {
      const clickedCoordinate = geometry.getClosestPoint(event.coordinate);
      const coords = geometry.getCoordinates();
      if (!coords) return;
      
      const coordsArray = (Array.isArray(coords[0]) ? coords : [coords]) as Coordinate[];
      const index = this.findClosestIndex(coordsArray, clickedCoordinate);

      if (index !== -1) {
        const multiKey = feature.get('multikey');
        if (multiKey && multiKey[index]) {
          this.fs.key = JSON.stringify(multiKey[index]);
          const trackData = await this.fs.storeGet(this.fs.key);
          
          if (trackData) {
            this.geography.archivedLayer?.getSource()?.clear();
            this.reference.archivedTrack = trackData;
            await this.reference.displayArchivedTrack();
            if (this.reference.archivedTrack) {
              await this.geography.setMapView(this.reference.archivedTrack);
            }
          }
        }
      }
      return;
    }

    // --- CASO 2: Click en Líneas, Inicio o Fin ---
    const trackElements = ['archived_line', 'archived_start', 'archived_end'];

    if (trackElements.includes(type)) {
      const featureDate = feature.get('date');

      if (featureDate) {
        const storageKey = new Date(featureDate).toISOString();
        const trackData = await this.fs.storeGet(storageKey);

        if (trackData) {
          this.geography.archivedLayer?.getSource()?.clear();
          this.mapService.visibleAll = false; 

          this.reference.archivedTrack = trackData;
          await this.reference.displayArchivedTrack();
          await this.geography.setMapView(trackData);
          await this.location.sendReferenceToPlugin();
          this.reference.foundRoute = false;
          
          // 🔔 Avisamos a Tab1 de que tiene que repintar la vista
          this.mapNeedsUpdate$.next();
          
        } else {
          console.warn('⚠️ No se pudieron cargar los datos del track seleccionado.');
        }
      }
    }
  }

  // ==========================================================================
  // 4. HELPERS MATEMÁTICOS
  // ==========================================================================

  private findClosestIndex(coords: Coordinate[], target: Coordinate): number {
    const eps = 0.000001;
    return coords.findIndex(c => Math.abs(c[0] - target[0]) < eps && Math.abs(c[1] - target[1]) < eps);
  }
}