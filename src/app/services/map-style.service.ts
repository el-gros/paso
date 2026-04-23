import { Injectable } from '@angular/core';
import maplibregl from 'maplibre-gl';
import pako from 'pako';
import { TranslateService } from '@ngx-translate/core';
import { MbTilesService } from './mbtiles.service';

@Injectable({
  providedIn: 'root'
})
export class MapStyleService {

  public readonly THEME = {
    background: '#f8f4f0',
    water: '#a1cae2',
    forest: '#d2e3bc',
    park: '#dbe9c6',
    roadCasing: '#cfc7bc',
    highway: '#f7c352',
    majorRoad: '#f9d88d',
    minorRoad: '#ffffff',
    buildings: '#e8e4e0',
    text: '#5d5854',
    fonts: ["OpenSansRegular"]
  };

  private lastStyleHash: string = '';

  constructor(
    private mbTiles: MbTilesService,
    private translate: TranslateService
  ) {
    this.registerMbtilesProtocol();
  }

  private registerMbtilesProtocol() {
    maplibregl.addProtocol('mbtiles', async (params: any) => {
      try {
        const urlWithoutScheme = params.url.replace('mbtiles://', '');
        const parts = urlWithoutScheme.split('/');
        const y = parseInt(parts.pop()!, 10);
        const x = parseInt(parts.pop()!, 10);
        const z = parseInt(parts.pop()!, 10);
        const fileName = parts.join('/');

        const buffer = await this.mbTiles.getVectorTile(fileName, z, x, y);
        if (!buffer || buffer.byteLength === 0) return { data: new ArrayBuffer(0) };

        const uint8 = new Uint8Array(buffer);
        if (uint8[0] === 0x1f && uint8[1] === 0x8b) {
          return { data: pako.inflate(uint8).buffer };
        }
        return { data: buffer };
      } catch (e) {
        console.error(`❌ Error en protocolo mbtiles:`, e);
        return { data: new ArrayBuffer(0) };
      }
    });
  }

  /**
   * Genera el objeto de estilo JSON (Mapbox Style Spec) dinámicamente
   * basado en los archivos MBTiles que el usuario tiene abiertos.
   */
  public generateDynamicStyle(): any {
    const openedFiles = this.mbTiles.getOpenedFiles();
    const style: any = {
      version: 8,
      name: "Shortbread Offline Style",
      glyphs: "/assets/fonts/{fontstack}/{range}.pbf",
      sources: {},
      layers: [{ id: 'background', type: 'background', paint: { 'background-color': this.THEME.background } }]
    };

    openedFiles.forEach((fileName: string) => {
      const sourceId = `src_${fileName.replace(/[^a-zA-Z0-9]/g, '_')}`;
      style.sources[sourceId] = {
        type: 'vector',
        tiles: [`mbtiles://${fileName}/{z}/{x}/{y}`],
        minzoom: 0,
        maxzoom: 14
      };

      const layerGroup = [
        { id: `ocean_${sourceId}`, type: 'fill', source: sourceId, 'source-layer': 'ocean', paint: { 'fill-color': this.THEME.water } },
        { id: `water_${sourceId}`, type: 'fill', source: sourceId, 'source-layer': 'water_polygons', paint: { 'fill-color': this.THEME.water } },
        { id: `land_forest_${sourceId}`, type: 'fill', source: sourceId, 'source-layer': 'land', filter: ['in', 'kind', 'forest', 'wood', 'nature_reserve', 'national_park'], paint: { 'fill-color': this.THEME.forest } },
        { id: `land_park_${sourceId}`, type: 'fill', source: sourceId, 'source-layer': 'land', filter: ['in', 'kind', 'park', 'grass', 'garden', 'pitch'], paint: { 'fill-color': this.THEME.park } },
        { id: `buildings_${sourceId}`, type: 'fill', source: sourceId, 'source-layer': 'buildings', minzoom: 13, paint: { 'fill-color': this.THEME.buildings, 'fill-outline-color': '#dfdcd8' } },
        { id: `road_casing_${sourceId}`, type: 'line', source: sourceId, 'source-layer': 'streets', minzoom: 10, paint: { 'line-color': this.THEME.roadCasing, 'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 10, 1.5, 18, 12] } },
        { id: `road_inner_${sourceId}`, type: 'line', source: sourceId, 'source-layer': 'streets', minzoom: 10, paint: { 'line-color': ['match', ['get', 'kind'], 'motorway', this.THEME.highway, 'trunk', this.THEME.highway, 'primary', this.THEME.majorRoad, 'secondary', this.THEME.majorRoad, this.THEME.minorRoad], 'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 10, 0.5, 18, 10] } },
        { id: `street_labels_${sourceId}`, type: 'symbol', source: sourceId, 'source-layer': 'street_labels', minzoom: 13, layout: { 'text-field': ['get', 'name'], 'text-font': this.THEME.fonts, 'symbol-placement': 'line', 'text-size': 12, 'text-max-angle': 30 }, paint: { 'text-color': this.THEME.text, 'text-halo-color': '#ffffff', 'text-halo-width': 2 } },
        { id: `places_${sourceId}`, type: 'symbol', source: sourceId, 'source-layer': 'place_labels', minzoom: 5, layout: { 'text-field': ['get', 'name'], 'text-font': this.THEME.fonts, 'text-size': ['match', ['get', 'kind'], 'city', 18, 'town', 14, 'village', 12, 10], 'text-variable-anchor': ['center', 'top', 'bottom'], 'text-justify': 'center' }, paint: { 'text-color': this.THEME.text, 'text-halo-color': '#ffffff', 'text-halo-width': 2 } }
      ];

      // Añadimos las capas al estilo principal (DENTRO del bucle)
      style.layers.push(...layerGroup);
    });

    return style;
  }

  /**
   * Notifica al motor MapLibre de que debe refrescar su estilo (vía diffing).
   * Ahora recibe la capa offline como parámetro desde el MapService.
   */
  public refreshOfflineStyle(offlineLayer?: any) {
    if (!offlineLayer) return;

    // Buscamos la instancia del mapa dentro del wrapper
    const maplibreMap = offlineLayer.mapLibreMap || (offlineLayer as any).maplibreMap;

    if (maplibreMap?.setStyle) {
      const newStyle = this.generateDynamicStyle();
      const currentHash = JSON.stringify(newStyle.sources); // Hash simple por fuentes

      if (this.lastStyleHash !== currentHash) {
        console.log("🚀 Aplicando nuevo estilo con Diff...");
        maplibreMap.setStyle(newStyle, { diff: true });
        this.lastStyleHash = currentHash;
      }
    } else {
      // Reintento si el mapa de MapLibre aún no ha terminado de construirse
      setTimeout(() => this.refreshOfflineStyle(offlineLayer), 500);
    }
  }
}