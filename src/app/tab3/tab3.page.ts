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

  importedTrack: any = {
    data: [], 
    map: [],
    name: '',
    place: '',
    date: new Date(),
    description: '', 
  };
  styleChecked: boolean = false;
  providerChecked: boolean = false;
  archivedChecked: boolean = true;
  provider: string = 'Tomtom' // Tomtom or Mapbox;
  archived: string = 'visible';
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

  async styleChanged() {
    if (this.styleChecked) this.style = 'satellite';
    else this.style = 'basic'
    await this.storage.set('style', this.style)
    this.router.navigate(['tab1']);
  } 
 
  async providerChanged() {
    if (this.providerChecked) this.provider = 'Mapbox';
    else this.provider = 'Tomtom'
    await this.storage.set('provider', this.provider)
    this.router.navigate(['tab1']);
  } 

  async archivedChanged() {
    if (this.archivedChecked) this.archived = 'visible';
    else this.archived = 'invisible'
    await this.storage.set('archived', this.archived)
    this.router.navigate(['tab1']);
  } 

  goHome() {
    this.router.navigate(['tab1']);
  }

  async selectColor(currArch: string) {
    var arr: string[] = ['crimson', 'red', 'orange', 'gold', 'yellow',
      'magenta', 'purple', 'lime', 'green', 'cyan', 'blue']
    var input: any = [];
    for (var item of arr) {
      var inputElement = {name: item, type: 'radio', id: item, value: item, checked: false}
      if (currArch == 'Current' && this.currentColor == item) inputElement.checked = true;
      if (currArch == 'Archived' && this.archivedColor == item) inputElement.checked = true;
      input.push(inputElement)
    }
    const alert = await this.alertController.create({
      cssClass: 'alert yellowAlert',
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
            if (currArch == 'Current') this.currentColor = data.value;
            if (currArch == 'Archived') this.archivedColor = data.value;
            this.storage.set('archivedColor', this.archivedColor);
            this.storage.set('currentColor', this.currentColor);            
          }
        }
      ]
    });
    alert.present();
  }
  
  async ionViewWillEnter() {
    try{this.provider = await this.storage.get('provider'); }
    catch{}
    try {this.style = await this.storage.get('style'); }
    catch{}  
    try {this.archived = await this.storage.get('archived'); }
    catch{}  
    try {this.archivedColor = await this.storage.get('archivedColor'); }
    catch{}
    try {this.currentColor = await this.storage.get('currentColor'); }
    catch{}
    if (this.provider == 'Mapbox') this.providerChecked = true;
    else this.providerChecked = false;
    if (this.style == 'satellite') this.styleChecked = true;
    else this.styleChecked = false;    
    if (this.archived == 'visible') this.archivedChecked = true;
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
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(gpxText, 'application/xml');
    // Parse tracks and store the main track
    const tracks = xmlDoc.getElementsByTagName('trk');
    if (tracks.length == 0) return;
    var trackSegments = tracks[0].getElementsByTagName('trkseg');
    if (trackSegments.length == 0) return;
    var trackSeg = trackSegments[0];
    this.importedTrack.name = tracks[0].getElementsByTagName('name')[0]?.textContent
    if (this.importedTrack.name == null) this.importedTrack.name = 'no name'
    var trackPoints = trackSeg.getElementsByTagName('trkpt');
    for (let k = 0; k < trackPoints.length; k++) {
      const lat = trackPoints[k].getAttribute('lat');
      const lon = trackPoints[k].getAttribute('lon');
      const ele = trackPoints[k].getElementsByTagName('ele')[0]?.textContent;
      const time = trackPoints[k].getElementsByTagName('time')[0]?.textContent;
      if (!lat || !lon) continue;
      // lon, lat
      await this.importedTrack.map.push([+lon, +lat]);
      var num: number = await this.importedTrack.map.length;
      // distance
      if (num == 1) var distance = 0.
      else distance = this.importedTrack.data[num-2].distance + await this.fs.computeDistance(this.importedTrack.map[num-2][0], this.importedTrack.map[num-2][1], +lon, +lat)
      // altitude
      if (ele) var alt: number | null = +ele;
      else alt = null;
      // elevation gain & loss
      if (num == 1) {var gain: number | null = 0; var loss: number | null = 0;} 
      else {
        if (ele && this.importedTrack.data[num-2].altitude) {
          var slope: number = +ele - this.importedTrack.data[num-2].altitude;
          if (slope >=0) {
            gain = this.importedTrack.data[num-2].elevationGain + slope;
            loss = this.importedTrack.data[num-2].elevationLoss;
          }
          else {
            gain = this.importedTrack.data[num-2].elevationGain;
            loss = this.importedTrack.data[num-2].elevationLoss - slope;
          }
        }
        else {gain = null; loss = null}
      }
      // time
      if (time) var locTime: Date | null = new Date(time);
      else locTime = null;
      var accTime: number | null;
      if (num == 1) accTime = 0;
      else if (!locTime || !this.importedTrack.data[0].time) accTime = null
      else accTime = locTime.getTime() - this.importedTrack.data[0].time 
      this.importedTrack.data.push({
        accuracy: null,
        altitude: alt,
        altitudeAccuracy: null,
        bearing: null,
        simulated: null,
        speed: null,
        time: locTime,
        compSpeed: null,
        distance: distance,
        elevationGain: gain,
        elevationLoss: loss,
        accTime: accTime            
      });
      var num: number = await this.importedTrack.data.length;
      if (this.importedTrack.data[num-1].time) this.importedTrack = await this.fs.filterSpeed(this.importedTrack);
    }
    var num: number = await this.importedTrack.data.length;
    if (this.importedTrack.data[num-1].time) this.importedTrack.date = this.importedTrack.data[num-1].time
    else this.importedTrack.date = new Date();
    await this.storage.set(JSON.stringify(this.importedTrack.date), this.importedTrack);
    const trackDef = {name: this.importedTrack.name, date: this.importedTrack.date, place: '', description: '', isChecked: false};
    console.log(trackDef)
    // add new track definition and save collection
    var collection: any = await this.storage. get('collection');
    collection.push(trackDef);
    console.log(collection)
    await this.storage.set('collection', collection)
  }

}


  





