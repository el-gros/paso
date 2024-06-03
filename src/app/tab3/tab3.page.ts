import { FunctionsService } from '../functions.service';
import { Component, ViewChild, ElementRef } from '@angular/core';
import { IonicModule, AlertController } from '@ionic/angular';
import { ExploreContainerComponent } from '../explore-container/explore-container.component';
import { CommonModule, DecimalPipe, DatePipe } from '@angular/common';
import { Router } from '@angular/router';
import { Storage } from '@ionic/storage-angular';
import { FormsModule } from '@angular/forms'
import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
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

  constructor(
    public fs: FunctionsService,
    private alertController: AlertController,
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
  async providerChanged() {
    if (this.providerChecked) this.provider = 'Mapbox';
    else this.provider = 'Tomtom'
    await this.storage.set('provider', this.provider)
    this.goHome();
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
    try{this.provider = await this.storage.get('provider'); }
    catch{}
    try {this.style = await this.storage.get('style'); }
    catch{}  
    try {this.archivedVis = await this.storage.get('archived'); }
    catch{}  
    try {this.archivedColor = await this.storage.get('archivedColor'); }
    catch{}
    try {this.currentColor = await this.storage.get('currentColor'); }
    catch{}
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

  readFile(file: File) {
    const reader = new FileReader();
    reader.onload = async (e: any) => {
      try{
        const text = e.target.result;
        await this.parseGpx(text);
        this.uploaded = this.uploaded + ' uploaded'
      }
      catch{this.uploaded = 'uploaded failed'}
    };
    reader.readAsText(file);
  }

  async parseGpx(gpxText: string) {
    this.importedTrack = {
      type: 'FeatureCollection',
      features: [{
        type: 'feature',
        properties: {
          name: '',
          place: '',
          date: null,
          description: '',
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
    var abb: any = this.importedTrack.features[0].geometry.properties.data
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(gpxText, 'application/xml');
    // Parse tracks and store the main track
    const tracks = xmlDoc.getElementsByTagName('trk');
    if (tracks.length == 0) return;
    var trackSegments = tracks[0].getElementsByTagName('trkseg');
    if (trackSegments.length == 0) return;
    var trackSeg = trackSegments[0];
    this.importedTrack.features[0].properties.name = tracks[0].getElementsByTagName('name')[0]?.textContent
    if (this.importedTrack.features[0].properties.name == null) this.importedTrack.features[0].properties.name = 'no name'
    var trackPoints = trackSeg.getElementsByTagName('trkpt');
    for (let k = 0; k < trackPoints.length; k++) {
      const lat = trackPoints[k].getAttribute('lat');
      const lon = trackPoints[k].getAttribute('lon');
      const ele = trackPoints[k].getElementsByTagName('ele')[0]?.textContent;
      const time = trackPoints[k].getElementsByTagName('time')[0]?.textContent;
      if (!lat || !lon) continue;
      // lon, lat
      await this.importedTrack.features[0].geometry.coordinates.push([+lon, +lat]);
      var num: number = await this.importedTrack.features[0].geometry.coordinates.length;
      // distance
      if (num == 1) var distance = 0.
      else distance = abb[num-2].distance + await this.fs.computeDistance(abb[num-2][0], abb[num-2][1], +lon, +lat)
      // altitude
      if (ele) var alt: number | null = +ele;
      else alt = null;
      // elevation gain & loss
      var gain: number | null = null; 
      var loss: number | null = null;
      if (num == 1) {
        gain = 0;
        loss = 0;
      } 
      else {
        if (ele && abb[num-2].altitude && abb[num-2].elevationGain && abb[num-2].elevationLoss) {
          var slope: number = +ele - abb[num-2].altitude;
          if (slope >=0) {
            gain = abb[num-2].elevationGain + slope;
            loss = abb[num-2].elevationLoss;
          }
          else {
            gain = abb[num-2].elevationGain;
            loss = abb.data[num-2].elevationLoss - slope;
          }
        }
        else {gain = null; loss = null}
      }
      // time
      if (time) var locTime: Date | null = new Date(time);
      else locTime = null;
      //var accTime: number | null;
      //if (num == 1) accTime = 0;
      //else if (!locTime || !this.importedTrack.data[0].time) accTime = null
      //else accTime = locTime.getTime() - this.importedTrack.data[0].time 
      abb.push({
        accuracy: null,
        altitude: alt,
//        altitudeAccuracy: null,
//        bearing: null,
//        simulated: null,
        speed: null,
        time: locTime,
        compSpeed: null,
        distance: distance,
        elevationGain: gain,
        elevationLoss: loss,
//        accTime: accTime            
      });
      var num: number = await abb.length;
      if (abb[num-1].time) abb = await this.fs.filterSpeed(abb);
    }
    var num: number = await abb.length;
    if (abb[num-1].time) this.importedTrack.features[0].properties.date = abb[num-1].time
    else this.importedTrack.features[0].properties.date = new Date();
    this.importedTrack.features[0].geometry.properties.date = abb;
    await this.storage.set(JSON.stringify(this.importedTrack.features[0].properties.date), this.importedTrack);
    const trackDef = {
      name: this.importedTrack.features[0].properties.name, 
      date: this.importedTrack.features[0].properties.date, 
      place: '', 
      description: '', 
      isChecked: false
    };
    // add new track definition and save collection
    var collection: any = await this.storage. get('collection');
    collection.push(trackDef);
    await this.storage.set('collection', collection)
  }

}


  





