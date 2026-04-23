import { Injectable } from '@angular/core';
import { Fill, Icon, Stroke, Style, Text } from 'ol/style';
import { FeatureLike } from 'ol/Feature';

// --- INTERNAL IMPORTS ---
import { global } from '../../environments/environment';
import { StyleJSON } from '../../globald';

@Injectable({ 
  providedIn: 'root'
})
export class StylerService {

  /**
   * Diccionario de paths SVG. 
   * Los nombres deben coincidir con la versión "limpia" (sin -outline ni -sharp) 
   * de los iconos definidos en PLACE_CATEGORIES.
   */
  public readonly svgPaths: { [key: string]: string } = {
    'business': 'M12,7V3H2V21H22V7H12M10,19H4V17H10V19M10,15H4V13H10V15M10,11H4V9H10V11M10,7H4V5H10V7M20,19H12V17H20V19M20,15H12V13H20V15M20,11H12V9H20V11Z',
    'terrain': 'M14,6L1,20H27L14,6M14,9.12L22.84,19H5.15L14,9.12M12,12L8,18H10L12,15L14,18H16L12,12Z',
    'water': 'M12,20C8.69,20 6,17.31 6,14C6,10 12,3.25 12,3.25C12,3.25 18,10 18,14C18,17.31 15.31,20 12,20Z',
    'bed': 'M7 13c1.66 0 3-1.34 3-3S8.66 7 7 7s-3 1.34-3 3 1.34 3 3 3zm12-6h-8v7H3V5H1v15h2v-3h18v3h2v-9c0-2.21-1.79-4-4-4z',
    'camera': 'M9,2L7.17,4H4C2.9,4 2,4.9 2,6V18C2,19.1 2.9,20 4,20H20C21.1,20 22,19.1 22,18V6C22,4.9 21.1,4 20,4H16.83L15,2H9M12,17C9.24,17 7,14.76 7,12C7,9.24 9.24,7 12,7C14.76,7 17,9.24 17,12C17,14.76 14.76,17 12,17M12,9C10.34,9 9,10.34 9,12C9,13.66 10.34,15 12,15C13.66,15 15,13.66 15,12C15,10.34 13.66,9 12,9Z',
    'restaurant': 'M11 9H9V2H7v7H5V2H3v7c0 2.12 1.66 3.84 3.75 3.97V22h2.5v-9.03C11.34 12.84 13 11.12 13 9V2h-2v7zm5-3v8h2.5v8H21V2c-2.76 0-5 2.24-5 4z',
    'car': 'M18.92,6.01C18.72,5.42 18.16,5 17.5,5H6.5C5.84,5 5.29,5.42 5.08,6.01L3,12V20C3,20.55 3.45,21 4,21H5C5.55,21 6,20.55 6,20V19H18V20C18,20.55 18.45,21 19,21H20C20.55,21 21,20.55 21,20V12L18.92,6.01M6.5,16A1.5,1.5 0 0,1 5,14.5A1.5,1.5 0 0,1 6.5,13A1.5,1.5 0 0,1 8,14.5A1.5,1.5 0 0,1 6.5,16M17.5,16A1.5,1.5 0 0,1 16,14.5A1.5,1.5 0 0,1 17.5,13A1.5,1.5 0 0,1 19,14.5A1.5,1.5 0 0,1 17.5,16M5,11L6.5,6.5H17.5L19,11H5Z',
    'star': 'M12,17.27L18.18,21L16.54,13.97L22,9.24L14.81,8.62L12,2L9.19,8.62L2,9.24L7.45,13.97L5.82,21L12,17.27Z',
    'apps': 'M4,8H8V4H4V8M10,20H14V16H10V20M4,20H8V16H4V20M4,14H8V10H4V14M10,14H14V10H10V14M16,4V8H20V4H16M10,8H14V4H10V8M16,14H20V10H16V14M16,20H20V16H16V20Z',
    'location': 'M12,2C8.13,2 5,5.13 5,9C5,14.25 12,22 12,22C12,22 19,14.25 19,9C19,5.13 15.87,2 12,2M12,11.5A2.5,2.5 0 0,1 9.5,9A2.5,2.5 0 0,1 12,6.5A2.5,2.5 0 0,1 14.5,9A2.5,2.5 0 0,1 12,11.5Z',
    'medkit': 'M19 3H5c-1.1 0-1.99.9-1.99 2L3 19c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-2 9h-4v4h-2v-4H7v-2h4V6h2v4h4v2z'
  };

  constructor() { }

  // ==========================================================================
  // 1. GESTIÓN DE COLORES E ICONOS
  // ==========================================================================

  /**
   * Convierte nombres de colores de Ionic a valores Hexadecimales para el SVG.
   */
  public getHexColor(colorName: string): string {
    const colors: { [key: string]: string } = {
      'primary': '#3880ff',
      'success': '#2dd36f',
      'warning': '#ffc409',
      'danger': '#eb445a',
      'tertiary': '#5260ff',
      'secondary': '#3dc2ff',
      'medium': '#92949c',
      'dark': '#222428',
      'light': '#f4f5f8'
    };

    if (colorName && colorName.startsWith('#')) return colorName;
    return colors[colorName] || colors['primary'];
  }

  /**
   * Genera un estilo de pin con un icono blanco en su interior.
   */
  public createIconPinStyle(colorName: string, iconName: string): Style {
    const hexColor = this.getHexColor(colorName);
    
    // Limpieza de nombre: 'terrain-outline' -> 'terrain'
    const baseIcon = iconName.replace('-outline', '').replace('-sharp', '');
    let pathData = this.svgPaths[baseIcon] || this.svgPaths[iconName];

    if (!pathData) {
      console.warn(`⚠️ Icono "${iconName}" (base: ${baseIcon}) no encontrado en svgPaths.`);
      pathData = this.svgPaths['location']; // Fallback
    }

    const svg = `
      <svg width="32" height="42" viewBox="0 0 32 42" xmlns="http://www.w3.org/2000/svg">
        <path d="M16 0C7.16 0 0 7.16 0 16c0 12 16 26 16 26s16-14 16-26c0-8.84-7.16-16-16-16z" fill="${hexColor}" />
        <g transform="translate(4, 4) scale(1)">
           <path d="${pathData}" fill="white" />
        </g>
      </svg>
    `.trim();

    return new Style({
      image: new Icon({
        anchor: [0.5, 1],
        src: 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg))),
        scale: 0.8
      })
    });
  }

  // ==========================================================================
  // 2. ESTILOS DE DIBUJO Y BÚSQUEDA
  // ==========================================================================

  public setStrokeStyle(color: string): Style {
    return new Style({ 
      stroke: new Stroke({ color: color, width: 3 })
    });
  }

  public createPinStyle(color: string): Style {
    return new Style({
      image: new Icon({
        src: this.getColoredPin(color),
        anchor: [0.5, 1],
        scale: 0.035
      })
    });
  }

  public getSearchStyle(feature: FeatureLike): Style | Style[] {
    const type = feature.getGeometry()?.getType();
    if (type === 'Point') {
      return this.createPinStyle(feature.get('type') === 'service' ? 'blue' : 'black');
    }
    return new Style({
      stroke: new Stroke({ color: '#000', width: 2.5 }),
      fill: new Fill({ color: 'rgba(0, 0, 0, 0.15)' }),
    });
  }

  private getColoredPin(color: string): string {
    const svgTemplate = `
      <svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 293.334 293.334">
        <g>
          <path fill="${color}" d="M146.667,0C94.903,0,52.946,41.957,52.946,93.721c0,22.322,7.849,42.789,20.891,58.878
            c4.204,5.178,11.237,13.331,14.903,18.906c21.109,32.069,48.19,78.643,56.082,116.864c1.354,6.527,2.986,6.641,4.743,0.212
            c5.629-20.609,20.228-65.639,50.377-112.757c3.595-5.619,10.884-13.483,15.409-18.379c6.554-7.098,12.009-15.224,16.154-24.084
            c5.651-12.086,8.882-25.466,8.882-39.629C240.387,41.962,198.43,0,146.667,0z M146.667,144.358
            c-28.892,0-52.313-23.421-52.313-52.313c0-28.887,23.421-52.307,52.313-52.307s52.313,23.421,52.313,52.307
            C198.98,120.938,175.559,144.358,146.667,144.358z"/>
          <circle fill="${color}" cx="146.667" cy="90.196" r="21.756"/>
        </g>
      </svg>
    `.trim();
    
    const encoded = window.btoa(unescape(encodeURIComponent(svgTemplate)));
    return `data:image/svg+xml;base64,${encoded}`;
  }

  // ==========================================================================
  // 3. MOTOR DE RENDERIZADO VECTORIAL (Mapbox Style Spec)
  // ==========================================================================

  public styleFunction = (feature: FeatureLike, resolution: number): Style | Style[] => {
    const sourceLayer = feature.get('_layer') || feature.get('layer') || feature.get('source-layer');
    const styleJSON: StyleJSON | undefined = global && typeof global.maptiler_terrain_modified === 'object'
      ? global.maptiler_terrain_modified
      : undefined;

    if (!styleJSON || !Array.isArray(styleJSON.layers)) return new Style({});

    const zoom = this.getZoomFromResolution(resolution);
    const stylesToApply: Style[] = [];

    for (const layerStyle of styleJSON.layers) {
      if (layerStyle['source-layer'] !== sourceLayer) continue;
      if (layerStyle.filter && !this.evaluateFilter(layerStyle.filter, feature)) continue;
      
      let computedMinZoom = 0; 
      if (typeof layerStyle.minzoom === 'object') {
        const rank = feature.get('rank') || 0; 
        const sortedKeys = Object.keys(layerStyle.minzoom).map(Number).sort((a, b) => a - b); 
        for (const rankStop of sortedKeys) {
          if (rank <= rankStop) {
            computedMinZoom = layerStyle.minzoom[rankStop];
            break;
          }
          computedMinZoom = layerStyle.minzoom[rankStop];
        }
      } else if (typeof layerStyle.minzoom === 'number') {
        computedMinZoom = layerStyle.minzoom;
      }
      
      if (zoom < computedMinZoom) continue;
      if (layerStyle.maxzoom !== undefined && zoom > layerStyle.maxzoom) continue;

      switch (layerStyle.type) {
        case 'fill':
          stylesToApply.push(new Style({
            fill: new Fill({ color: this.getPaintValue(layerStyle.paint, 'fill-color', '#000000') }),
          }));
          break;

        case 'line': {
          const rawLineWidth = layerStyle.paint?.['line-width'] ?? 1;
          let computedLineWidth = 1; 
          if (Array.isArray(rawLineWidth)) {
            const stops = this.extractStops(rawLineWidth);
            if (stops.length > 0) computedLineWidth = this.interpolateStops(stops, zoom);
          } else if (typeof rawLineWidth === 'number') {
            computedLineWidth = rawLineWidth;
          }

          stylesToApply.push(new Style({
            stroke: new Stroke({
              color: this.getPaintValue(layerStyle.paint, 'line-color', '#000000'),
              width: Math.max(computedLineWidth, 1), 
            }),
          }));
          break;
        }

        case 'symbol': {
          const textSizeRaw = layerStyle.layout?.['text-size'] ?? 10; 
          const textSize = typeof textSizeRaw === 'number' ? textSizeRaw : 10;
          stylesToApply.push(new Style({
            text: new Text({
              text: (feature.get('name') || feature.get('rawName') || '').replace(/\n/g, ' '),
              font: `bold ${textSize}px sans-serif`, 
              fill: new Fill({ color: this.getPaintValue(layerStyle.paint, 'text-color', '#000000') }),
              stroke: new Stroke({ color: this.getPaintValue(layerStyle.paint, 'text-halo-color', '#FFFFFF'), width: 2 }),
              scale: Math.max(textSize / 10, 1), 
            }),
          }));
          break;
        }
      }
    }
    return stylesToApply.length > 0 ? stylesToApply : new Style({});
  };

  private getZoomFromResolution(resolution: number): number {
    return Math.log2(156543.03 / resolution);
  }

  private evaluateFilter(filter: any[], feature: FeatureLike): boolean {
    if (!Array.isArray(filter) || filter.length === 0) return true; 
    const properties = feature.getProperties() || {}; 
    
    const matchCondition = (condition: any[]): boolean => {
      if (!Array.isArray(condition) || condition.length < 2) return false;
      const [operator, field, ...values] = condition;
      const value = properties[field] ?? null;
      
      switch (operator) {
        case "==": return value === values[0];
        case "!=": return value !== values[0];
        case ">": return typeof value === 'number' && value > values[0];
        case ">=": return typeof value === 'number' && value >= values[0];
        case "<": return typeof value === 'number' && value < values[0];
        case "<=": return typeof value === 'number' && value <= values[0];
        case "in": return values.includes(value);
        case "!in": return !values.includes(value);
        case "has": return field in properties;
        case "!has": return !(field in properties);
        default: return false;
      }
    };

    if (filter[0] === "all") return filter.slice(1).every(matchCondition);
    if (filter[0] === "any") return filter.slice(1).some(matchCondition);
    if (filter[0] === "none") return !filter.slice(1).some(matchCondition);
    return matchCondition(filter); 
  }

  private getPaintValue(paint: any, key: string, fallback: any): any {
    return paint?.[key] ?? fallback;
  }

  private extractStops(expression: any[]): [number, number][] {
    if (Array.isArray(expression) && expression[0] === "interpolate") {
      const stops: [number, number][] = [];
      for (let i = 3; i < expression.length; i += 2) {
        stops.push([Number(expression[i]), Number(expression[i + 1])]);
      }
      return stops;
    }
    return [];
  }

  private interpolateStops(stops: [number, number][], zoom: number): number {
    if (stops.length === 0) return 1; 
    for (let i = 0; i < stops.length - 1; i++) {
      const [z1, v1] = stops[i];
      const [z2, v2] = stops[i + 1];
      if (zoom >= z1 && zoom <= z2) return v1 + ((zoom - z1) / (z2 - z1)) * (v2 - v1);
    }
    return stops[stops.length - 1][1]; 
  }

  /**
   * Devuelve el path SVG de un icono. Usado en plantillas HTML (como el buscador).
   */
  public getIconPath(iconName: string): string {
    if (!iconName) return this.svgPaths['location'];
    
    // Limpiamos el nombre (quita -outline o -sharp)
    const baseIcon = iconName.replace('-outline', '').replace('-sharp', '');
    
    // Buscamos en el diccionario, si no existe devolvemos el de 'location' por defecto
    return this.svgPaths[baseIcon] || this.svgPaths[iconName] || this.svgPaths['location'];
  }
}