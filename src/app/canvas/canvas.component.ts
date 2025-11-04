/**
 * CanvasComponent is responsible for displaying and managing interactive canvas charts
 * for both the current and archived tracks, including statistics such as distance,
 * elevation gain/loss, speed, and time. It initializes canvases, subscribes to track
 * and status updates, computes average and motion speeds, and renders graphical
 * representations of track data with dynamic scaling and grid overlays. The component
 * supports multilingual labels and adapts canvas size to the viewport.
 */

import { CUSTOM_ELEMENTS_SCHEMA, ChangeDetectorRef, Component, OnDestroy, OnInit, Inject } from '@angular/core';
import { Subscription } from 'rxjs';
import { Track, PartialSpeed, Data, Waypoint } from '../../globald';
import { SharedImports } from '../shared-imports';
import { FunctionsService } from '../services/functions.service';
import { register } from 'swiper/element/bundle';
import { TranslateService } from '@ngx-translate/core';
import { Directory, Filesystem } from '@capacitor/filesystem';

import * as htmlToImage from 'html-to-image';
register();

@Component({
  selector: 'app-canvas',
  templateUrl: './canvas.component.html',
  styleUrls: ['./canvas.component.scss'],
  standalone: true,
  imports: [SharedImports],
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class CanvasComponent implements OnInit, OnDestroy {

  currentUnit: string = '' // time unit for canvas ('s' seconds, 'min' minutes, 'h' hours)
  archivedUnit: string = '' // time unit for canvas ('s' seconds, 'min' minutes, 'h' hours)
  vMin: number = 1;
  partialSpeeds: PartialSpeed[] = [];

  private subscriptions: Subscription = new Subscription();
  constructor(
    public fs: FunctionsService,
    private translate: TranslateService
  ) { }

  // 1. ngOnInit()
  // 2. ngOnDestroy()
  // 3. ionViewWillEnter()
  // 4. averageSpeed()
  // 5. createCanvas()

  // 9. updateAllCanvas()


  // 1. ON INIT ///////////////////
  async ngOnInit() {
    await this.createCanvas();
    this.subscriptions.add(
      this.fs.currentTrack$.subscribe(async (track) => {
        if (track && this.fs.currentCtx) {
          this.currentUnit = await this.fs.updateAllCanvas(this.fs.currentCtx, track);
        }
      })
    );
  }

  // 2. ON DESTROY ///////////////////
  ngOnDestroy() {
    this.subscriptions.unsubscribe();
  }

  // 3. ION VIEW WILL ENTER //////////////////
  async ionViewWillEnter() {
    if (this.fs.archivedTrack) {
      this.archivedUnit = await this.fs.updateAllCanvas(this.fs.archivedCtx, this.fs.archivedTrack);
      this.partialSpeeds = await this.fs.computePartialSpeeds(this.fs.archivedTrack);
    }
    // Variables
    if (this.fs.buildTrackImage) {
      var success: boolean = false;
      success = await this.triggerExport();
      if (success) {
        this.fs.gotoPage('archive');
      } else {
        // End process
        this.fs.buildTrackImage = false;
        await this.fs.displayToast(this.translate.instant('MAP.TOIMAGE_FAILED'));
        this.fs.gotoPage('archive');
      }
    }
  }

  // 4. COMPUTE AVERAGE SPEEDS AND TIMES
  async averageSpeed() {
    if (!this.fs.currentTrack) return;
    // get data array
    const data = this.fs.currentTrack.features[0].geometry.properties.data;
    const num = data.length ?? 0;
    if (num < 2) return;
    // Compute time at rest
    for (let i = this.fs.averagedSpeed + 1; i < num; i++) {
      if (data[i].compSpeed < this.vMin) {
        // Add the time spent at rest
        this.fs.stopped += (data[i].time - data[i - 1].time) / 1000; // Convert milliseconds to seconds
      }
      this.fs.averagedSpeed = i;  // Track last processed index
    }
    // Compute total time
    let totalTime = (data[num - 1].time - data[0].time)/1000;
    // Calculate average speed (in km/h)
    this.fs.currentAverageSpeed = (3600 * data[num - 1].distance) / totalTime;
    // If the total time minus stopped time is greater than 5 seconds, calculate motion speed
    if (totalTime - this.fs.stopped > 5) {
      this.fs.currentMotionSpeed = (3600 * data[num - 1].distance) / (totalTime - this.fs.stopped);
    }
    // Format the motion time
    this.fs.currentMotionTime = this.fs.formatMillisecondsToUTC(1000 * (totalTime - this.fs.stopped));
  }

  // 5. CREATE CANVASES //////////////////////////////////////////
  async createCanvas() {
    const size = Math.min(window.innerWidth, window.innerHeight);
    for (const i in this.fs.properties) {
      this.initCanvas(`currCanvas${i}`, size, this.fs.currentCtx, i);
      this.initCanvas(`archCanvas${i}`, size, this.fs.archivedCtx, i);
    }
    this.fs.canvasNum = size;
  }
  private initCanvas(
    elementId: string,
    size: number,
    ctxArray: [CanvasRenderingContext2D | undefined, CanvasRenderingContext2D | undefined],
    index: string | number
  ) {
    const canvas = document.getElementById(elementId) as HTMLCanvasElement;
    if (canvas) {
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (ctx) ctxArray[Number(index)] = ctx;
    } else {
      console.error(`Canvas with ID ${elementId} not found.`);
    }
  }


  // 9. UPDATE ALL CANVAS ////////////////////////////////
  async triggerExport(): Promise<boolean> {
    try {
      const exportArea = document.querySelector('#exportArea') as HTMLElement;
      if (!exportArea) {
        console.error('Export area not found');
        return false;
      }
      // ensure rendering is finished
      await new Promise(r => setTimeout(r, 100));
      const dataUrl = await htmlToImage.toPng(exportArea, {
        backgroundColor: '#ffffff',
        style: {
          width: `${exportArea.scrollWidth}px`,
          height: `${exportArea.scrollHeight}px`,
        }
      });
      const filename = 'data.png'; // avoid overwrite issues
      await Filesystem.writeFile({
        path: filename,
        data: dataUrl.split(',')[1],
        directory: Directory.ExternalCache,
      });
      await new Promise(r => setTimeout(r, 200));  // small delay
      console.log(`Export saved as ${filename}`);
      return true;
    } catch (err) {
      console.error('Failed to export area:', err);
      return false;
    }
  }

}
