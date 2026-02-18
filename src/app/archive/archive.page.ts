import { Component, OnInit } from '@angular/core';
import { IonicModule, LoadingController, IonItemSliding } from '@ionic/angular';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { SocialSharing } from '@awesome-cordova-plugins/social-sharing/ngx';

// --- SERVICES ---
import { FunctionsService } from '../services/functions.service';
import { ReferenceService } from '../services/reference.service';
import { MapService } from '../services/map.service';
import { GeographyService } from '../services/geography.service';
import { LocationManagerService } from '../services/location-manager.service';
import { LanguageService } from '../services/language.service';
import { TrackExportService } from '../services/track-export.service'; // IMPORT NEW SERVICE

// --- OPENLAYERS IMPORTS ---
import Map from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import OSM from 'ol/source/OSM';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import GeoJSON from 'ol/format/GeoJSON';
import { Style, Stroke } from 'ol/style';
import { Feature } from 'ol';
import { Geometry } from 'ol/geom';

// --- INTERFACES ---
import { TrackDefinition, Track } from '../../globald';

@Component({
  standalone: true,
  selector: 'app-archive',
  templateUrl: 'archive.page.html',
  styleUrls: ['archive.page.scss'],
  imports: [
    IonicModule, CommonModule, FormsModule, TranslateModule
  ]
})
export class ArchivePage implements OnInit {

  isConfirmDeletionOpen: boolean = false;
  index: number = -1; // Initialized to -1 instead of NaN
  slidingItem: IonItemSliding | undefined = undefined;

  constructor(
    public fs: FunctionsService,
    public mapService: MapService,
    private languageService: LanguageService,
    private translate: TranslateService,
    private socialSharing: SocialSharing,
    public reference: ReferenceService,
    public geography: GeographyService,
    public location: LocationManagerService,
    private loadingCtrl: LoadingController,
    private exportService: TrackExportService // INJECT NEW SERVICE
  ) { }

  async ionViewDidEnter() {
    if (this.fs.buildTrackImage) await this.shareImages();
  }

  ngOnInit() {
    // Initialization logic if needed
  }

  // --- DISPLAY & NAVIGATION LOGIC ---

  async displayTrack(active: boolean) {
    if (active) {
      this.reference.archivedTrack = await this.fs.retrieveTrack() ?? this.reference.archivedTrack;
      if (this.reference.archivedTrack) {
        await this.reference.displayArchivedTrack();
        await this.geography.setMapView(this.reference.archivedTrack!);
      }
    } else {
      this.reference.clearArchivedTrack();
    }
    await this.location.sendReferenceToPlugin();
    this.fs.gotoPage('tab1');
  }

  async displaySpecificTrack(item: TrackDefinition, slidingItem?: IonItemSliding) {
    if (slidingItem) slidingItem.close();
    if (!item.date) return;

    const trackData = await this.fs.storeGet(new Date(item.date).toISOString());
    this.reference.archivedTrack = trackData;
    
    this.fs.gotoPage('tab1');
    await new Promise(r => setTimeout(r, 200));
    
    this.reference.displayArchivedTrack();
    await this.geography.setMapView(this.reference.archivedTrack!);
    await this.location.sendReferenceToPlugin();
  }

  async displayAllTracks(show: boolean) {
    try {
      if (show) {
        if (this.reference.archivedTrack) {
          this.reference.clearArchivedTrack();
          await this.location.sendReferenceToPlugin();
        }

        this.mapService.visibleAll = true;
        await this.fs.gotoPage('tab1');

        setTimeout(async () => {
          await this.mapService.displayAllTracks();
          this.fs.displayToast(this.translate.instant('ARCHIVE.ALL_DISPLAYED'), 'success');
        }, 200);

      } else {
        this.mapService.visibleAll = false;
        const source = this.geography.archivedLayer?.getSource();
        if (source) source.clear();
        this.fs.displayToast(this.translate.instant('ARCHIVE.ALL_HIDDEN'), 'success');
        await this.fs.gotoPage('tab1');
      }
    } catch (error) {
      console.error("Error displaying all tracks:", error);
    }
  }

  // --- TRACK MANAGEMENT ---

  async deleteSpecificTrack(index: number, slidingItem?: IonItemSliding) {
    if (slidingItem) slidingItem.close();
    
    const trackToRemove = this.fs.collection[index];
    if (trackToRemove && trackToRemove.date) {
        const key = new Date(trackToRemove.date).toISOString();
        if (key) await this.fs.storeRem(key);
    }
    
    this.fs.collection.splice(index, 1);
    await this.fs.storeSet('collection', this.fs.collection);
  }

  async hideSpecificTrack(slidingItem?: IonItemSliding) {
    if (slidingItem) slidingItem.close();
    this.reference.clearArchivedTrack();
    await this.location.sendReferenceToPlugin();
    this.fs.gotoPage('tab1');    
  }

  isTrackVisible(item: TrackDefinition): boolean {
    if (!this.reference.archivedTrack) return false;
    const activeDate = this.reference.archivedTrack.features?.[0]?.properties?.date;
    const itemDate = item.date;
    if (!activeDate || !itemDate) return false;
    return new Date(activeDate).getTime() === new Date(itemDate).getTime();
  }

  async toggleVisibility(item: TrackDefinition, slidingItem?: IonItemSliding) {
    if (this.isTrackVisible(item)) {
      await this.hideSpecificTrack(slidingItem);
    } else {
      await this.displaySpecificTrack(item, slidingItem);
    }
  }

  confirmDeletion(index: number, slidingItem: IonItemSliding) {
    this.isConfirmDeletionOpen = true;
    this.index = index;
    this.slidingItem = slidingItem;
  }

  async deleteTrack() {
    await this.deleteSpecificTrack(this.index, this.slidingItem);
    this.isConfirmDeletionOpen = false;
    this.slidingItem = undefined;
  }

  async editSpecificTrack(index: number, slidingItem?: IonItemSliding) {
    if (slidingItem) slidingItem.close();
    await this.reference.editTrack(index);
  }

  // --- EXPORT LOGIC ---

  async exportTrack(item: TrackDefinition, slidingItem?: IonItemSliding) {
    if (!item || !item.date) return;
    if (slidingItem) slidingItem.close();

    const loading = await this.loadingCtrl.create({
      message: this.translate.instant('ARCHIVE.GENERATING_FILES'),
      backdropDismiss: false,
      spinner: 'crescent'
    });
    
    await loading.present();

    try {
      const storageKey = new Date(item.date).toISOString();
      const trackData = await this.fs.storeGet(storageKey);

      if (!trackData) {
        this.fs.displayToast(this.translate.instant('ARCHIVE.LOADING_ERROR'), 'error');
        return;
      }

      const featureToExport = trackData.features ? trackData.features[0] : trackData as any;
      const safeName = (item.name || 'track').replace(/[^a-zA-Z0-9_\-\.]/g, '_');

      // 1. Generate Map Image (Internally)
      const mapBase64 = await this.generateMapImage(trackData);

      // 2. Generate File Content (Using Service)
      const [gpxText, kmzBase64, pdfBase64] = await Promise.all([
        this.exportService.geoJsonToGpx(featureToExport),
        this.exportService.geoJsonToKmz(featureToExport),
        this.exportService.createPdfContent(item, trackData, mapBase64)
      ]);

      const gpxName = `${safeName}.gpx`;
      const kmzName = `${safeName}.kmz`;
      const pdfName = `${safeName}.pdf`;

      // 3. Write Files
      const [savedGpx, savedKmz, savedPdf] = await Promise.all([
          this.writeFile(gpxName, gpxText, Encoding.UTF8),
          this.writeFile(kmzName, kmzBase64),
          this.writeFile(pdfName, pdfBase64)
      ]);

      // 4. Share
      const result = await this.socialSharing.shareWithOptions({
        message: `${this.translate.instant('REPORT.ROUTE_NAME')}: ${item.name}`,
        files: [savedGpx.uri, savedKmz.uri, savedPdf.uri],
        chooserTitle: this.translate.instant('ARCHIVE.DIALOG_TITLE')
      });

      if (result && result.completed) {
        await this.fs.displayToast(this.translate.instant('ARCHIVE.TOAST1'), 'success');
      }

      // 5. Cleanup
      this.cleanupFiles([gpxName, kmzName, pdfName]);

    } catch (e) {
      console.error('Export error:', e);
      await this.fs.displayToast(this.translate.instant('ARCHIVE.TOAST2'), 'error');
    } finally {
      await loading.dismiss();
    }
  }

  // --- IMAGE SHARING LOGIC ---

  async prepareImageExport() {
    this.fs.buildTrackImage = true;
    await this.displayTrack(true);
  }

  async shareImages() {
    try {
      const mapFile = await Filesystem.getUri({ path: 'map.png', directory: Directory.ExternalCache });
      const slideFile = await Filesystem.getUri({ path: 'data.png', directory: Directory.ExternalCache });
      
      await this.socialSharing.share(undefined, this.translate.instant('ARCHIVE.TEXT'), [mapFile.uri, slideFile.uri]);
      this.fs.buildTrackImage = false; 
    } catch (err) {
      console.error('Failed to share images:', err);
    }
  }

  // --- PRIVATE HELPERS ---

  private async writeFile(path: string, data: string, encoding?: Encoding) {
    return Filesystem.writeFile({
      path,
      data,
      directory: Directory.ExternalCache,
      encoding
    });
  }

  private cleanupFiles(paths: string[]) {
    setTimeout(async () => {
      for (const path of paths) {
        try {
            await Filesystem.deleteFile({ path, directory: Directory.ExternalCache });
        } catch(e) {}
      }
    }, 5000);
  }

  /**
   * Generates a snapshot of the track using an invisible OpenLayers map.
   */
  private async generateMapImage(trackData: any): Promise<string> {
    return new Promise((resolve) => {
      try {
        const features = new GeoJSON().readFeatures(trackData) as Feature<Geometry>[];
        if(!features.length) { resolve(''); return; }

        const vectorSource = new VectorSource({ features });
        const extent = vectorSource.getExtent();

        if (!extent || !isFinite(extent[0])) { resolve(''); return; }

        const centerX = (extent[0] + extent[2]) / 2;
        const centerY = (extent[1] + extent[3]) / 2;

        const mapDiv = document.getElementById('map-export');
        if (mapDiv) {
          mapDiv.style.width = '1000px';
          mapDiv.style.height = '800px';
        }

        const mapExport = new Map({
          target: 'map-export',
          layers: [
            new TileLayer({ source: new OSM({ crossOrigin: 'anonymous' }) }),
            new VectorLayer({
              source: vectorSource,
              style: new Style({
                stroke: new Stroke({ color: '#FF0000', width: 6 })
              }),
              zIndex: 999 
            })
          ],
          controls: [], 
          interactions: [],
          view: new View({
            center: [centerX, centerY], 
            zoom: 14,                  
            enableRotation: false
          })
        });

        mapExport.updateSize();
        mapExport.getView().fit(extent, { padding: [100, 100, 100, 100], size: [1000, 800] });

        mapExport.once('rendercomplete', () => {
          const size = mapExport.getSize();
          if (!size) { mapExport.dispose(); resolve(''); return; }

          const mapCanvas = document.createElement('canvas');
          mapCanvas.width = size[0];
          mapCanvas.height = size[1];
          const mapContext = mapCanvas.getContext('2d');
          
          if (!mapContext) { mapExport.dispose(); resolve(''); return; }

          mapContext.fillStyle = '#FFFFFF';
          mapContext.fillRect(0, 0, mapCanvas.width, mapCanvas.height);

          const layers = document.querySelectorAll<HTMLCanvasElement>('#map-export .ol-layer canvas');
          
          layers.forEach((canvas) => {
            if (canvas.width > 0) {
              const parent = canvas.parentNode as HTMLElement;
              mapContext.globalAlpha = Number(parent?.style.opacity || '1');
              
              // Handle Matrix Transforms from OpenLayers
              const transform = canvas.style.transform;
              let matrix = [1, 0, 0, 1, 0, 0];
              if (transform) {
                const match = transform.match(/^matrix\(([^\(]*)\)$/);
                if (match && match[1]) matrix = match[1].split(',').map(Number);
              }

              mapContext.setTransform(matrix[0], matrix[1], matrix[2], matrix[3], matrix[4], matrix[5]);
              mapContext.drawImage(canvas, 0, 0);
            }
          });

          mapContext.setTransform(1, 0, 0, 1, 0, 0);
          const data = mapCanvas.toDataURL('image/jpeg', 0.8);
          
          // Clean up map instance to prevent memory leaks
          mapExport.setTarget(undefined);
          mapExport.dispose(); 
          
          resolve(data);
        });
      } catch (e) {
        console.error('Error in generateMapImage:', e);
        resolve('');
      }
    });
  }
}