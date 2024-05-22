import { Bounds, Track, TrackDefinition, Data } from '../../globald';
import { FunctionsService } from '../functions.service';
import { Component, ChangeDetectorRef } from '@angular/core';
import { IonicModule, AlertController } from '@ionic/angular';
import { ExploreContainerComponent } from '../explore-container/explore-container.component';
import { global } from '../../environments/environment';
import { CommonModule, DecimalPipe, DatePipe } from '@angular/common';
import { Router } from '@angular/router';
import { Storage } from '@ionic/storage-angular';
import { FormsModule } from '@angular/forms'
import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { register } from 'swiper/element/bundle';
register();
import mapboxgl from 'mapbox-gl';


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
  [x: string]: any;
  track: Track = {
    data: [], 
    map: [],
    name: '',
    place: '',
    date: new Date(),
    description: '', 
  };
  display2: string = 'map';
  collection: TrackDefinition[] = [];
  // local variables
  ctxMap: CanvasRenderingContext2D | undefined;
  ctx: CanvasRenderingContext2D[] = [];
  canvasNum: number = 400; // canvas size
  margin: number = 10;
  threshold: number = 20;
  lag = 12;
  output: any; 
  properties: (keyof Data)[] = ['altitude', 'compSpeed'];
  gridsize: string = '-';
  currentAltitude: number | undefined;
  currentSpeed: number | undefined;
  currentDistance: number = 0;
  currentElevationGain: number = 0;
  currentElevationLoss: number = 0;
  currentTime: any = '00:00:00';
  currentNumber: number = 0;
  map: any;
  initialMarker: any = undefined;
  finalMarker: any = undefined;
  style: any;
  loaded: boolean = false;

  styleChecked: boolean = false;
  providerChecked: boolean = false;
  archivedChecked: boolean = true;
  provider: string = 'Tomtom' // Tomtom or Mapbox;
  mapVisible: string = 'block'
  dataVisible: string = 'nome'
  mapStyle: string = 'basic'

  constructor(
    private cd: ChangeDetectorRef,
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
    await this.storage.set('archived', this.archivedChecked)
    this.router.navigate(['tab1']);
  } 

  goHome() {
    this.router.navigate(['tab1']);
  }

  async ionViewWillEnter() {
    try{this.provider = await this.storage.get('provider'); }
    catch{}
    try {this.style = await this.storage.get('style'); }
    catch{}  
    if (this.provider == 'Mapbox') this.providerChecked = true;
    else this.providerChecked = false;
    if (this.style == 'satellite') this.styleChecked = true;
    else this.styleChecked = false    
  }

  /*
  async mapDataShift(option: string) {
    if (option == 'data') {
      this.mapVisible = 'none'
      this.dataVisible = 'block'
    }
    else if (option == 'map') {
      this.mapVisible = 'block'
      this.dataVisible = 'none'
    }
  }


   
  ///////////////////////////////////////////
  // CHECK THE MAP TO DISPLAY TRACK in tab3
  /*
  async drawTrack() {
    if (this.loaded) {
      await this.displayTrackOnMap();
      return;
    }
    else {
      for (var i = 0; i<5; i++) {
        await new Promise(f => setTimeout(f, 500));
        if (this.loaded) await this.displayTrackOnMap(); break
      }
    }  
  }
  ////////////////////////////////////////////////

  ///////////////////////////////////////////////
  // CREATE CANVAS in tab1 and tab3 (diference in canvas name)
  async createCanvas(tab1: boolean) {
    var canvas: any
    for (var i in this.properties) {
      canvas = document.getElementById('canvas' + i) as HTMLCanvasElement;
      this.ctx[i] = await canvas.getContext("2d");
      canvas.width = window.innerWidth;
      canvas.height = canvas.width;
      this.canvasNum = canvas.width;
    }
  }
  */
  /////////////////////////////////////////////  
/*
  //////////////////////////////////////
  // UPDATE ALL CANVAS in tab1 and tab3
  async updateAllCanvas() {
    for (var i in this.properties) {
      if (this.properties[i] == 'altitude') await this.updateCanvas(this.ctx[i], this.properties[i], 'x');
      else await this.updateCanvas(this.ctx[i], this.properties[i], 't');
    }  
    this.cd.detectChanges();
  } 
  //////////////////////////////////////

  ///////////////////////////////////////////
  // UPDATE CANVAS in tab1 and tab3 (difference in color)
  async updateCanvas (ctx: CanvasRenderingContext2D | undefined, propertyName: keyof Data, xParam: string) {
    var num = this.track.data.length;
    if (!ctx) return;
    if (propertyName == 'simulated') return;
    if (xParam == 'x') var xTot = this.track.data[num - 1].distance
    else xTot = this.track.data[num - 1].accTime
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvasNum, this.canvasNum);
    // compute bounds
    const bounds: Bounds = await this.fs.computeMinMaxProperty(this.track.data, propertyName);
    if (bounds.max == bounds.min) {
      bounds.max = bounds.max + 2;
      bounds.min = bounds.min - 2;
    }
    // compute scales
    const a = (this.canvasNum - 2 * this.margin) / xTot;
    const d = (this.canvasNum - 2 * this.margin) / (bounds.min - bounds.max);
    const e = this.margin;
    const f = this.margin - bounds.max * d;
    // draw lines
    ctx.setTransform(a, 0, 0, d, e, f)
    ctx.beginPath();
    ctx.moveTo(0,bounds.min);
    for (var i in this.track.data) {
      if (xParam == 'x') ctx.lineTo(this.track.data[i].distance, this.track.data[i][propertyName])
      else ctx.lineTo(this.track.data[i].accTime, this.track.data[i][propertyName])
    } 
    ctx.lineTo(xTot,bounds.min);
    ctx.closePath();
    ctx.fillStyle = '#00ff00';
    ctx.fill();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // grid
    await this.grid(ctx, 0, xTot, bounds.min, bounds.max, a, d, e, f, xParam) 
  }
  ///////////////////////////////////////////

  /////////////////////////////////////////////
  // GRID in tab1 and tab3
  async grid(ctx: CanvasRenderingContext2D | undefined , xMin: number, xMax: number, yMin: number, yMax: number, a: number, d: number, e: number, f: number, xParam: string) {
    if (!ctx) return;
    ctx.font = "15px Arial"
    const gridx = this.fs.gridValue(xMax - xMin);
    const gridy = this.fs.gridValue(yMax - yMin);
    const fx = Math.ceil(xMin / gridx);
    const fy = Math.ceil(yMin / gridy);
    ctx.setLineDash([5, 15]);
    ctx.strokeStyle = 'black';
    ctx.fillStyle = 'black'  
    // vertical lines
    for (var xi = fx * gridx; xi <= xMax; xi = xi + gridx) {
      ctx.beginPath();
      ctx.moveTo(xi*a+e, yMin*d+f);
      ctx.lineTo(xi*a+e, yMax*d+f);
      ctx.stroke();
      ctx.fillText(xi.toLocaleString(),xi*a+e + 2,yMax*d+f + 2)
    }
    // horizontal lines
    for (var yi = fy * gridy; yi <= yMax; yi = yi + gridy) {
      ctx.beginPath();
      ctx.moveTo(xMin*a+e, yi*d+f);
      ctx.lineTo(xMax*a+e, yi*d+f);
      ctx.stroke();
      ctx.fillText(yi.toLocaleString(),xMin*a+e + 2, yi*d+f - 2)
    }
    ctx.setLineDash([]);
  }
  ///////////////////////////////////////////////////////
  

  /////////////////////////////////////
  // DISPLAY THE TRACK ON THE 
  // ORIGINAL MAP in tab3
  ////////////////////////////////////

  async addLayer(id: string, slice: any, color: string) {
    await this.map.addLayer({
      'id': id,
      'type': 'line',
      'source': {
        'type': 'geojson',
        'data': {
          'type': 'FeatureCollection',
          'features': [
            {
              'type': 'Feature',
              'geometry': {
                'type': 'LineString',
                'properties': {},
                'coordinates': slice
              }
            }
          ]
        }
      },
      'layout': {
        'line-cap': 'round',
        'line-join': 'round'
      },
      'paint': {
        'line-color': color,
        'line-width': 4
      }
    }); 
  }


  
  //////////////////////////////////////
  // REMOVE A LAYER FROM A MAP in tab1 and tab3
  async removeLayer(id: string) {
    id = 'elGros' + id
    // remove layer and source
    if (this.map.getLayer(id)) {
      await this.map.removeLayer(id)
      await this.map.removeSource(id)
    }
  }
  //////////////////////////////////////////////  

  ////////////////////////////////////
  // REMOVE MARKERS in tab3
  /*
  async removeMarkers() {
    // remove markers
  }
  */
  //////////////////////////////////////////

  ///////////////////////////////////////////
  /*
  // HTMLVARIABLES in tab1 and tab3
  async htmlVariables(tab1: boolean) {
    const num: number = this.track.data.length;
    if (num > 0) {
      this.currentTime = this.fs.formatMillisecondsToUTC(this.track.data[num - 1].accTime);
      this.currentDistance = this.track.data[num - 1].distance;
      if (tab1) {
        this.currentElevationGain = this.track.data[num - 1].elevationGain;
        this.currentElevationLoss = this.track.data[num - 1].elevationLoss;
      }
      this.currentNumber = num;
      this.currentAltitude = this.track.data[num - 1].altitude;
      if (tab1) this.currentSpeed = this.track.data[num - 1].speed;
      else this.currentSpeed = this.track.data[num - 1].compSpeed;          
    }
    else {
      this.currentTime = "00:00:00";
      this.currentDistance = 0;
      this.currentElevationGain = 0;
      this.currentElevationLoss = 0;
      this.currentNumber = 0;
      this.currentAltitude = 0;
      this.currentSpeed = 0;
    }
  }
  ///////////////////////////////////////////

  //////////////////////////////////////////////
  // RESIZE AND CENTER MAP in tab1 and tab3
  async setMapView() {
    // Calculate bounding box
    let minLat = Number.POSITIVE_INFINITY;
    let maxLat = Number.NEGATIVE_INFINITY;
    let minLng = Number.POSITIVE_INFINITY;
    let maxLng = Number.NEGATIVE_INFINITY;
    this.track.map.forEach(point => {
      minLat = Math.min(minLat, point[1]);
      maxLat = Math.max(maxLat, point[1]);
      minLng = Math.min(minLng, point[0]);
      maxLng = Math.max(maxLng, point[0]);
    });
    // map view
    await this.map.resize();
    await this.map.setCenter({lng: 0.5*(maxLng + minLng), lat: 0.5*(maxLat + minLat)});
    await this.map.fitBounds([[minLng, minLat], [maxLng, maxLat]], { padding: 50 });
  }
  /////////////////////////////////////////////////////////

  /*
  async mapChange2()  {
    var previous: any = this.style
    this.style = await this.fs.selectStyle(this.provider, this.display2);
    if (previous == this.style) return;
    await this.removeMarkers();
    await this.removeLayer('123');
    await this.map.setStyle(this.style)
    await new Promise(f => setTimeout(f, 500));
    await this.customLayer('123')
  }

  async displayChange2(option: string) {
    this.display2 = option
    this.show('onMap2','none');
    this.show('satellite2','none');
    this.show('data2', 'none');
    this.show('map2', 'none');
    if (this.display2 == 'map') {
      this.show('map2', 'block');
      this.show('onMap2', 'block');
      await this.mapChange2();
    }        
    else if (this.display2 == 'satellite2') {
      this.show('map2', 'block');
      this.show('satellite2', 'block');
      await this.mapChange2();
    }
    else {
      this.show('data2', 'block');
    }
  }
*/

  ////////////////////////////////////////////
/*
  // SHOW OR HIDE AN ELEMENT in tab1 and tab3
  show (id: string, action: string) {
    var obj: HTMLElement | null = document.getElementById(id);
    if (!obj) return;
    obj.style.display = action
  }
  /////////////////////////////////////////

  /////////////////////////////////////////////
  // CREATE MAPBOX MAP in tab1 and tab3 (diff. in container)
  async createMapboxMap(container: any) {
    this.map = new mapboxgl.Map({
      container: container,
      accessToken: "pk.eyJ1IjoiZWxncm9zIiwiYSI6ImNsdnUzNzh6MzAwbjgyanBqOGN6b3dydmQifQ.blr7ueZqkjw9LbIT5lhKiw",
      style: this.style,
      center: [1, 41.5],
      zoom: 6,
      trackResize: true,
    });
    this.map.on('load',() =>{
      this.map.resize();
      this.map.addControl(new mapboxgl.NavigationControl());
      this.map.scrollZoom.disable();
      this.loaded = true;
    });      
  }
  ///////////////////////////////////////////////

  /////////////////////////////////////////
  // CREATE TOMTOM MAP in tab1 and tab3 (diff. in container)
  async createTomtomMap(container: any) {
    this.map = tt.map({
      key: "YHmhpHkBbjy4n85FVVEMHBh0bpDjyLPp", //TomTom, not Google Maps
      container: container,
      center: [1, 41.5],
      zoom: 6,
      style: this.style
    });
    this.map.on('load',() =>{
      this.map.resize();
      this.map.addControl(new tt.NavigationControl()); 
      this.map.addControl(new tt.ScaleControl());
      this.map.addControl(new tt.GeolocateControl({
        positionOptions: {
          enableHighAccuracy: true,
        },
        trackUserLocation: true,		
      }));
      this.loaded = true  
    });
  }
  ////////////////////////////////////////////

*/
}


