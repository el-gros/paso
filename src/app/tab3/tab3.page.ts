 //import { Track } from '../../globald';
import { FunctionsService } from '../functions.service';
import { Component, ViewChild, ElementRef } from '@angular/core';
import { IonicModule, AlertController, LoadingController } from '@ionic/angular';
import { ExploreContainerComponent } from '../explore-container/explore-container.component';
import { CommonModule, DecimalPipe, DatePipe } from '@angular/common';
import { Router } from '@angular/router';
import { Storage } from '@ionic/storage-angular';
import { FormsModule } from '@angular/forms'
import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { global } from '../../environments/environment';
import { register } from 'swiper/element/bundle';
register();

@Component({      
  selector: 'app-tab3',
  templateUrl: 'tab3.page.html',
  styleUrls: ['tab3.page.scss'],
  standalone: true,
  imports: [IonicModule, ExploreContainerComponent, CommonModule, FormsModule], 
  providers: [DecimalPipe, DatePipe],
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
})

export class Tab3Page {
  @ViewChild('fileInput')
  fileInput!: ElementRef;
  archivedColor: string = 'green';
  currentColor: string = 'orange'
  importedTrack: any;
  styleChecked: boolean = false;
  providerChecked: boolean = false;
  archivedChecked: boolean = true;
  provider: string = 'Tomtom' // Tomtom or Mapbox;
  archivedVis: string = 'visible';
  mapVisible: string = 'block';
  dataVisible: string = 'nome';
  style: string = 'basic';
  uploaded: string = ''; 
  lag: number = global.lag; // 8
  comChecked: boolean = false 

  constructor(
    public fs: FunctionsService,
    private alertController: AlertController,
    private loadingController: LoadingController,
    private router: Router,
    private storage: Storage
  ) {}

  // STYLE CHANGE ////////////////////////////
  async styleChanged() {
    if (this.styleChecked) this.style = 'satellite';
    else this.style = 'basic'
    await this.storage.set('style', this.style)
    this.goHome();
  } 

  // PROVIDER CHANGE ////////////////////////////
/*
  async providerChanged() {
    if (this.providerChecked) this.provider = 'Mapbox';
    else this.provider = 'Tomtom'
    await this.storage.set('provider', this.provider)
    this.goHome();
  } 
*/

  // PROVIDER CHANGE ////////////////////////////
  async comChanged() {
    if (!this.comChecked) {
      this.provider = 'OSM';
      await this.storage.set('provider', this.provider)
    }
  } 

  // CHANGE VISIBILITY OF ARCHIVED TRACK //////////////////////
  async archivedChanged() {
    if (this.archivedChecked) this.archivedVis = 'visible';
    else this.archivedVis = 'invisible'
    await this.storage.set('archived', this.archivedVis)
    this.goHome();
  } 

  goHome() {
    this.router.navigate(['tab1']);
  }

  async selectColor(currArch: string) {
    var arr: string[] = ['crimson', 'red', 'orange', 'gold', 'yellow',
      'magenta', 'purple', 'lime', 'green', 'cyan', 'blue']
    var input: any = [];
    for (var item of arr) {
      var inputElement = {name: item, type: 'radio', label: item, value: item, checked: false}
      if (currArch == 'Current' && this.currentColor == item) inputElement.checked = true;
      if (currArch == 'Archived' && this.archivedColor == item) inputElement.checked = true;
      input.push(inputElement)
    }
    const alert = await this.alertController.create({
      cssClass: 'alert primaryAlert',
      header: currArch + ' Track',
      message: 'Kindly set the track color',
      inputs: input,
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel',
          cssClass: 'alert-cancel-button',
          handler: () => {}
        }, 
        {
          text: 'Ok',
          cssClass: 'alert-button',
          handler: (data) => {
            if (currArch == 'Current') this.currentColor = data;
            if (currArch == 'Archived') this.archivedColor = data;
          }
        }
      ]
    });
    alert.present();
  }
  
  async confirm(curArch: string) {
    if (curArch == 'Archived') this.storage.set('archivedColor', this.archivedColor);
    if (curArch == 'Current') this.storage.set('currentColor', this.currentColor);            
    this.goHome();
  }

  async ionViewWillEnter() {
    await this.storage.create();
    this.provider = await this.check(this.provider, 'provider') 
    this.style = await this.check(this.style, 'style') 
    this.archivedVis = await this.check(this.archivedVis, 'archived') 
    this.archivedColor = await this.check(this.archivedColor, 'archivedColor') 
    this.currentColor = await this.check(this.currentColor, 'currentColor') 
    if (this.provider == 'Mapbox') this.providerChecked = true;
    else this.providerChecked = false;
    if (this.style == 'satellite') this.styleChecked = true;
    else this.styleChecked = false;    
    if (this.archivedVis == 'visible') this.archivedChecked = true;
    else this.archivedChecked = false;    
  }

  async onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      var file = input.files[0];
      this.uploaded = file.name
      this.readFile(file);
    }
  }

  triggerFileInput() {
    this.fileInput.nativeElement.click();
  }

  async readFile(file: File) {
    var loading = await this.loadingController.create({
      message: 'Please, wait...'
    });
    await loading.present();
    const reader = new FileReader();
    reader.onload = async (e: any) => {
      try{
        const text = e.target.result;
        await this.parseGpx(text);
        this.uploaded = this.uploaded + ' uploaded'
      }
      catch{this.uploaded = 'upload failed'}
      if (loading) await loading.dismiss();
    };
    reader.readAsText(file);
  }

  async parseGpx(gpxText: string) {
    this.importedTrack = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: {
          name: undefined,
          place: undefined,
          date: undefined,
          description: undefined,
          totalDistance: '',
          totalElevationGain: 0,
          totalElevationLoss: 0,
          totalTime: '',
          totalNumber: ''
        },
        geometry: {
          type: 'LineString',
          coordinates: [],
          properties: {
            data: [],
          }
        }  
      }]
    }
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(gpxText, 'application/xml');
    // Parse tracks and store the main track
    const tracks = xmlDoc.getElementsByTagName('trk');
    if (tracks.length == 0) return;
    var trackSegments = tracks[0].getElementsByTagName('trkseg');
    if (trackSegments.length == 0) return;
    var trackSeg = trackSegments[0];
    this.importedTrack.features[0].properties.name = await tracks[0].getElementsByTagName('name')[0]?.textContent ?? 'no name';
    let trackPoints: any = trackSeg.getElementsByTagName('trkpt');
    var altitudeOk = true;
    for (let k = 0; k < trackPoints.length; k++) {
      const lat = await trackPoints[k].getAttribute('lat');
      const lon = await trackPoints[k].getAttribute('lon');
      const ele = await trackPoints[k].getElementsByTagName('ele')[0]?.textContent;
      const time = await trackPoints[k].getElementsByTagName('time')[0]?.textContent;
      console.log(ele, time)
      if (!lat || !lon) continue;
      // lon, lat
      await this.importedTrack.features[0].geometry.coordinates.push([+lon, +lat]);
      var num: number = await this.importedTrack.features[0].geometry.coordinates.length;
      // distance
      if (num == 1) var distance = 0.
      else distance = await this.importedTrack.features[0].geometry.properties.data[num-2].distance + await this.fs.computeDistance(this.importedTrack.features[0].geometry.coordinates[num-2][0], this.importedTrack.features[0].geometry.coordinates[num-2][1], +lon, +lat)
      // altitude
      if (ele) var alt: number | undefined = +ele;
      else {
        alt = undefined;
        altitudeOk = false;
      }  
      if (alt == 0 && num > 1) alt = await this.importedTrack.features[0].geometry.properties.data[num-2].altitude; 
      // elevation gain / loss
      var gain: any = undefined;
      var loss: any = undefined;
      if (num == 1) {
        gain = 0;
        loss = 0;
      }
      // time
      if (time) var locTime: Date | undefined = new Date(time);
      else locTime = undefined;
      // to add
      var newGroup: any = {
        altitude: alt,
        speed: undefined,
        time: locTime,
        compSpeed: 0,
        distance: distance,
      }
      await this.importedTrack.features[0].geometry.properties.data.push(newGroup);
    }
    var num: number = this.importedTrack.features[0].geometry.properties.data.length ?? 0;
    this.importedTrack.features[0].properties.totalDistance = await this.importedTrack.features[0].geometry.properties.data[num -1].distance;
    this.importedTrack.features[0].properties.totalTime = this.fs.formatMillisecondsToUTC(this.importedTrack.features[0].geometry.properties.data[num - 1].time - 
      this.importedTrack.features[0].geometry.properties.data[0].time);
    this.importedTrack.features[0].properties.totalNumber = num;
    if (this.importedTrack.features[0].geometry.properties.data[num-1].time) this.importedTrack.features[0].geometry.properties.data = await this.fs.filterSpeed(this.importedTrack.features[0].geometry.properties.data);
    // filter
    if (altitudeOk) {
      for (var i = 1; i < num; i++) {
        await this.importedAltitudeFilter(i, this.lag)
      };
    }
    // speed filter      
    this.importedTrack.features[0].geometry.properties.data = await this.fs.speedFilterAll(this.importedTrack.features[0].geometry.properties.data, this.lag);
    // save...
    if (this.importedTrack.features[0].geometry.properties.data[num-1].time) this.importedTrack.features[0].properties.date = this.importedTrack.features[0].geometry.properties.data[num-1].time
    else this.importedTrack.features[0].properties.date = new Date();
    await this.storage.set(JSON.stringify(this.importedTrack.features[0].properties.date), this.importedTrack);
    console.log(this.importedTrack);
    const trackDef = {
      name: this.importedTrack.features[0].properties.name, 
      date: this.importedTrack.features[0].properties.date, 
      place: this.importedTrack.features[0].properties.place, 
      description: this.importedTrack.features[0].properties.description, 
      isChecked: false
    };
    // add new track definition and save collection
    var collection: any = await this.storage. get('collection');
    collection.push(trackDef);
    await this.storage.set('collection', collection);
  }

  // CHECK IN STORAGE //////////////////////////
  async check(variable: any, key: string) {
    try {
      const result = await this.storage.get(key);
      if (result !== null && result !== undefined) {
        variable = result;
      } else {}
    } catch {}
    return variable
  }

  async importedAltitudeFilter(i: number, lag: number) {
    var num = this.importedTrack.features[0].geometry.coordinates.length ?? 0;
    const start = Math.max(0, i - lag);
    const end = Math.min(i + lag, num - 1);
    // average altitude
    var sum: number = 0
    for (var j = start; j <= end; j++) sum = sum + this.importedTrack.features[0].geometry.properties.data[j].altitude;
    this.importedTrack.features[0].geometry.properties.data[i].altitude = sum/(end - start +1);
    // re-calculate elevation gains / losses
    if (i==0) return;
    var slope = await this.importedTrack.features[0].geometry.properties.data[i].altitude - this.importedTrack.features[0].geometry.properties.data[i-1].altitude;
    if (slope > 0) { this.importedTrack.features[0].properties.totalElevationGain = await this.importedTrack.features[0].properties.totalElevationGain + slope; }
    else {this.importedTrack.features[0].properties.totalElevationLoss = await this.importedTrack.features[0].properties.totalElevationLoss - slope; }
  } 

  async onProviderChange(event: any) {
    console.log('Provider changed to:', this.provider);
    await this.storage.set('provider', this.provider)
    this.goHome();
  }

}


  





