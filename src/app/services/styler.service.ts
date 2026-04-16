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

  public readonly svgPaths: { [key: string]: string } = {
    'medkit': 'M19 3H5c-1.1 0-1.99.9-1.99 2L3 19c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-2 9h-4v4h-2v-4H7v-2h4V6h2v4h4v2z',
    'bed': 'M7 13c1.66 0 3-1.34 3-3S8.66 7 7 7s-3 1.34-3 3 1.34 3 3 3zm12-6h-8v7H3V5H1v15h2v-3h18v3h2v-9c0-2.21-1.79-4-4-4z',
    'bus': 'M4 16c0 .88.39 1.67 1 2.22V20c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h8v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1.78c.61-.55 1-1.34 1-2.22V6c0-3.5-3.58-4-8-4s-8 .5-8 4v10zm3.5 1c-.83 0-1.5-.67-1.5-1.5S6.67 14 7.5 14s1.5.67 1.5 1.5S8.33 17 7.5 17zm9 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm1.5-6H6V6h12v5z',
    'cart': 'M7 18c-1.1 0-1.99.9-1.99 2S5.9 22 7 22s2-.9 2-2-.9-2-2-2zM1 2v2h2l3.6 7.59-1.35 2.45c-.16.28-.25.61-.25.96 0 1.1.9 2 2 2h12v-2H7.42c-.14 0-.25-.11-.25-.25l.03-.12.9-1.63h7.45c.75 0 1.41-.41 1.75-1.03l3.58-6.49c.08-.14.12-.31.12-.48 0-.55-.45-1-1-1H5.21l-.94-2H1zm16 16c-1.1 0-1.99.9-1.99 2s.89 2 1.99 2 2-.9 2-2-.9-2-2-2z',
    'flame': 'M19.77 7.23l.01-.01-3.72-3.72L15 4.56l2.11 2.11C16.17 7 15.5 7.93 15.5 9v11c0 1.1.9 2 2 2s2-.9 2-2V9c0-1.07-.67-2-1.61-2.33zM18.5 20c-.55 0-1-.45-1-1v-4h2v4c0 .55-.45 1-1 1zm-1-8V9c0-.55.45-1 1-1s1 .45 1 1v3h-2zM12 4v16H2V4h10m0-2H2c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 7H4V6h6v5z',
    'restaurant': 'M11 9H9V2H7v7H5V2H3v7c0 2.12 1.66 3.84 3.75 3.97V22h2.5v-9.03C11.34 12.84 13 11.12 13 9V2h-2v7zm5-3v8h2.5v8H21V2c-2.76 0-5 2.24-5 4z',
    'flash': 'M7 2v11h3v9l7-12h-4l4-8z',
    'hospital': 'M19 3H5c-1.1 0-1.99.9-1.99 2L3 19c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-1 11h-4v4h-4v-4H6v-4h4V6h4v4h4v4z',
    'card': 'M20 4H4c-1.11 0-1.99.89-1.99 2L2 18c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z',
    'parking': 'M3 3h18v18H3V3zm10.5 4h-4v10h2.5v-3.5h1.5c2.2 0 4-1.8 4-4s-1.8-2.5-4-2.5zm0 4.5h-1.5v-2h1.5c.8 0 1.5.7 1.5 1s-.7 1-1.5 1z',
    'shield': 'M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z',
  };

  constructor() { }

  // ==========================================================================
  // 1. ESTILOS SIMPLES (UI / GPS)
  // ==========================================================================

  public setStrokeStyle(color: string): Style {
    return new Style({ 
      stroke: new Stroke({
        color: color,
        width: 3 
      })
    });
  }

  /**
   * Genera un estilo de pin (marcador) coloreado dinámicamente.
   * @param color Nombre del color para el SVG interno.
   */
  public createPinStyle(color: string): Style {
    return new Style({
      image: new Icon({
        src: this.getColoredPin(color),
        anchor: [0.5, 1],
        scale: 0.035
      })
    });
  }

  /**
   * Genera el estilo para los resultados de búsqueda (puntos o polígonos).
   */
  public getSearchStyle(feature: FeatureLike): Style | Style[] {
    const type = feature.getGeometry()?.getType();
    if (type === 'Point') return this.createPinStyle(feature.get('type') === 'service' ? 'blue' : 'black'); // Differentiate service pins
    return new Style({
      stroke: new Stroke({ color: '#000', width: 2.5 }),
      fill: new Fill({ color: 'rgba(0, 0, 0, 0.15)' }),
    });
  }

  /**
   * Genera el Data URI de un SVG de pin coloreado mediante btoa.
   */
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
    
    // Modern base64 encode for SVG
    const encoded = window.btoa(unescape(encodeURIComponent(svgTemplate)));
    return `data:image/svg+xml;base64,${encoded}`;
  }

  // ==========================================================================
  // 2. MOTOR DE RENDERIZADO VECTORIAL (Mapbox Style Spec)
  // ==========================================================================

  /**
   * Función principal de estilo para Vector Tiles.
   * Traduce un objeto JSON de estilo Mapbox a objetos de estilo nativos de OpenLayers.
   * Soporta filtros, interpolación de grosores y zooms mínimos dinámicos.
   * 
   * @param feature Feature vectorial de la tesela.
   * @param resolution Resolución actual del mapa.
   */
  public styleFunction = (feature: FeatureLike, resolution: number): Style | Style[] => {
    const sourceLayer = feature.get('_layer') || feature.get('layer') || feature.get('source-layer');
    const styleJSON: StyleJSON | undefined = global && typeof global.maptiler_terrain_modified === 'object'
      ? global.maptiler_terrain_modified
      : undefined;

    if (!styleJSON || !Array.isArray(styleJSON.layers)) {
      return new Style({});
    }

    const zoom = this.getZoomFromResolution(resolution);
    const stylesToApply: Style[] = []; // Acumulamos los estilos en lugar de devolver el primero

    for (const layerStyle of styleJSON.layers) {
      if (layerStyle['source-layer'] !== sourceLayer) continue;
      
      if (layerStyle.filter && !this.evaluateFilter(layerStyle.filter, feature)) continue;
      
      let computedMinZoom = 0; 
      if (typeof layerStyle.minzoom === 'object') {
        const rank = feature.get('rank') || 0; 
        const sortedKeys = Object.keys(layerStyle.minzoom).map(Number).sort((a, b) => a - b); 
        
        for (let i = 0; i < sortedKeys.length; i++) {
          const rankStop = sortedKeys[i];
          const nextRankStop = sortedKeys[i + 1];
          if (rank <= rankStop) {
            computedMinZoom = layerStyle.minzoom[rankStop];
            break;
          }
          if (nextRankStop === undefined) {
            computedMinZoom = layerStyle.minzoom[rankStop];
          }
        }
      } else if (typeof layerStyle.minzoom === 'number') {
        computedMinZoom = layerStyle.minzoom;
      }
      
      if (zoom < computedMinZoom) continue;
      if (layerStyle.maxzoom !== undefined && zoom > layerStyle.maxzoom) continue;

      // Generar el estilo según el tipo de capa
      switch (layerStyle.type) {
        
        case 'fill':
          stylesToApply.push(new Style({
            fill: new Fill({
              color: this.getPaintValue(layerStyle.paint, 'fill-color', '#000000'),
            }),
          }));
          break;

        case 'line': {
          // 🚀 BUG CORREGIDO: Extraer el grosor real del JSON antes de evaluarlo
          const rawLineWidth = layerStyle.paint?.['line-width'] ?? 1;
          let computedLineWidth = 1; 

          if (Array.isArray(rawLineWidth)) {
            const stops = this.extractStops(rawLineWidth);
            if (stops.length > 0) {
              computedLineWidth = this.interpolateStops(stops, zoom);
            }
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
              text: (feature.get('name') || feature.get('rawName') || 'Unknown').replace(/\n/g, ' '),
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

    // Retornamos el array de estilos superpuestos (OL lo soporta nativamente)
    return stylesToApply.length > 0 ? stylesToApply : new Style({});
  };

  // ==========================================================================
  // 3. HELPERS MATEMÁTICOS Y FILTROS
  // ==========================================================================

  /** Convierte la resolución de OpenLayers en nivel de Zoom (0-22) */
  private getZoomFromResolution(resolution: number): number {
    if (typeof resolution !== 'number' || resolution <= 0) {
      throw new Error('Invalid resolution value');
    }
    return Math.log2(156543.03 / resolution);
  }

  /**
   * Evalúa si una feature cumple con los criterios de filtrado del estilo.
   */
  private evaluateFilter(filter: any[], feature: FeatureLike): boolean {
    if (!Array.isArray(filter) || filter.length === 0) return true; 
    if (!["all", "any", "none"].includes(filter[0]) && typeof filter[0] !== "string") return true; 
    
    const properties = feature.getProperties() || {}; 
    
    const matchCondition = (condition: any[]): boolean => {
      if (!Array.isArray(condition) || condition.length < 2) return false;
      const [operator, field, ...values] = condition;
      const value = properties[field] ?? null;
      
      if (operator === "==") return value === values[0];
      if (operator === "!=") return value !== values[0];
      if (operator === ">") return typeof value === 'number' && value > values[0];
      if (operator === ">=") return typeof value === 'number' && value >= values[0];
      if (operator === "<") return typeof value === 'number' && value < values[0];
      if (operator === "<=") return typeof value === 'number' && value <= values[0];
      if (operator === "in") return values.includes(value); 
      if (operator === "!in") return !values.includes(value); 
      if (operator === "has") return field in properties;
      if (operator === "!has") return !(field in properties);
      
      return false; 
    };

    if (filter[0] === "all") {
      return filter.slice(1).every(matchCondition);
    } else if (filter[0] === "any") {
      return filter.slice(1).some(matchCondition);
    } else if (filter[0] === "none") {
      return !filter.slice(1).some(matchCondition);
    }
    return matchCondition(filter); 
  }

  private getPaintValue(paint: any, key: string, fallback: any): any {
    return paint?.[key] ?? fallback;
  }

  /**
   * Extrae los puntos de parada (stops) de una expresión de interpolación.
   */
  private extractStops(expression: any[]): [number, number][] {
    if (Array.isArray(expression) && expression.length > 4 && expression[0] === "interpolate") {
      const stops: [number, number][] = [];
      for (let i = 3; i < expression.length; i += 2) {
        if (expression[i] !== undefined && expression[i + 1] !== undefined) {
          const stop: [number, number] = [Number(expression[i]), Number(expression[i + 1])]; 
          if (!isNaN(stop[0]) && !isNaN(stop[1])) {
            stops.push(stop);
          }
        }
      }
      return stops;
    }
    return [];
  }

  /**
   * Realiza una interpolación lineal entre dos valores basada en el nivel de zoom.
   */
  private interpolateStops(stops: [number, number][], zoom: number): number {
    if (!Array.isArray(stops) || stops.length === 0) return 1; 
    
    for (let i = 0; i < stops.length - 1; i++) {
      const [z1, v1] = stops[i];
      const [z2, v2] = stops[i + 1];
      if (zoom >= z1 && zoom <= z2) {
        return v1 + ((zoom - z1) / (z2 - z1)) * (v2 - v1);
      }
    }
    // Retornar el último valor si nos pasamos del zoom máximo
    return stops[stops.length - 1][1]; 
  }

  public createIconPinStyle(color: string, iconName: string): Style {
    // 1. Limpiamos los sufijos típicos de Ionic
    const baseIcon = iconName.replace('-outline', '').replace('-sharp', '');

    // 2. Buscamos en el diccionario PÚBLICO de la clase (usando this.)
    let pathData = this.svgPaths[baseIcon] || this.svgPaths[iconName];

    // 3. CHIVATO: Si no lo encuentra, te avisa en consola y fuerza el color rojo
    if (!pathData) {
      console.warn(`⚠️ [StylerService] El icono "${iconName}" no está en mi lista. Mostrando círculo rojo.`);
      pathData = this.svgPaths['unknown-circle'];
      color = '#ff0000'; 
    }

    // 4. Montamos el SVG final
    const svg = `
      <svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill-rule="evenodd">
        <rect width="24" height="24" rx="4" fill="#ffffff" />
        <path d="${pathData}" fill="${color}" />
      </svg>
    `;

    // 5. Retornamos el estilo para el mapa
    return new Style({
      image: new Icon({
        anchor: [0.5, 0.5], 
        src: 'data:image/svg+xml;utf8,' + encodeURIComponent(svg),
        scale: 1.06 
      })
    });
  }

  public getIconPath(iconName: string): string {
    const baseIcon = iconName.replace('-outline', '').replace('-sharp', '');
    return this.svgPaths[baseIcon] || this.svgPaths[iconName] || this.svgPaths['unknown-circle'];
  }
}