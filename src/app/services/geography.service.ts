import Map from 'ol/Map';
import { useGeographic } from 'ol/proj';
import { Injectable } from '@angular/core';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';

useGeographic();

@Injectable({
  providedIn: 'root'
})

export class GeographyService {
  
  map: Map | undefined;
  archivedLayer?: VectorLayer<VectorSource>;
  currentLayer?: VectorLayer<VectorSource>;
  searchLayer?: VectorLayer<VectorSource>;
  locationLayer?: VectorLayer<VectorSource>;
  mapProvider: string ='MapTiler_outdoor';

  constructor(
  ) { }

}  
