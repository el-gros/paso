import { Injectable } from '@angular/core';
import { Fill, Icon, Stroke, Style, Text } from 'ol/style';
import { FeatureLike } from 'ol/Feature';

// --- INTERNAL IMPORTS ---
import { global } from '../../environments/environment';
import { StyleJSON } from 'src/globald';

@Injectable({ 
  providedIn: 'root'
})
export class StylerService {

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

  public createPinStyle(color: string): Style {
    return new Style({
      image: new Icon({
        src: this.getColoredPin(color),
        anchor: [0.5, 1],
        scale: 0.035
      })
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
    
    // Modern base64 encode for SVG
    const encoded = window.btoa(unescape(encodeURIComponent(svgTemplate)));
    return `data:image/svg+xml;base64,${encoded}`;
  }

  // ==========================================================================
  // 2. MOTOR DE RENDERIZADO DE VECTOR TILES (StyleJSON)
  // ==========================================================================

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
  // 3. HELPERS MATEMÁTICOS Y DE FILTROS (Mapbox Style Specs)
  // ==========================================================================

  private getZoomFromResolution(resolution: number): number {
    if (typeof resolution !== 'number' || resolution <= 0) {
      throw new Error('Invalid resolution value');
    }
    return Math.log2(156543.03 / resolution);
  }

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
}