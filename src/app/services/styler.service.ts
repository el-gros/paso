
import { Injectable } from '@angular/core';
import { global } from '../../environments/environment';
import { Fill, Icon, Stroke, Style, Text } from 'ol/style';
import { FeatureLike } from 'ol/Feature';
import { StyleJSON } from 'src/globald';


@Injectable({ 
  providedIn: 'root'
})

export class StylerService {

    constructor(

    ) { }

  // SET STROKE STYLE //////////////////////////////////

  setStrokeStyle(color: string): Style {
    return new Style({ stroke: new Stroke({
      color: color,
      width: 3 })
    });
  }

    // CREATE PIN STYLE //////////////////////////

  createPinStyle(color: string): Style {
    return new Style({
      image: new Icon({
        src: this.getColoredPin(color),
        anchor: [0.5, 1],
        scale: 0.035
      })
    });
  }

  // GET COLORED PIN //////////////////////////

  getColoredPin(color: string): string {
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
    // Encode safely as base64
    const encoded = window.btoa(unescape(encodeURIComponent(svgTemplate)));
    return `data:image/svg+xml;base64,${encoded}`;
  }

    // 1. STYLE FUNCTION ////////////////////////////

  styleFunction = (feature: FeatureLike, resolution: number) => {
    const sourceLayer = feature.get('_layer') || feature.get('layer') || feature.get('source-layer');
    const classLayer = feature.get('class');
    const styleJSON: StyleJSON | undefined = global && typeof global.maptiler_terrain_modified === 'object'
      ? global.maptiler_terrain_modified
      : undefined;
    if (!styleJSON || !Array.isArray(styleJSON.layers)) {
      // Optionally log an error or warning here
      return new Style({});
    }
    const zoom = this.getZoomFromResolution(resolution);
    for (const layerStyle of styleJSON.layers) {
      if (layerStyle['source-layer'] !== sourceLayer) continue;
      // Apply feature filter before styling
      if (layerStyle.filter && !this.evaluateFilter(layerStyle.filter, feature)) continue;
      let computedMinZoom = 0; // Default to 0 if undefined
      if (typeof layerStyle.minzoom === 'object') {
        const rank = feature.get('rank') || 0; // Default rank to 0 if undefined
        // Sort the minzoom keys in ascending order (to handle arbitrary input like "2": 9, "5": 11, etc.)
        const sortedKeys = Object.keys(layerStyle.minzoom)
          .map(Number) // Convert to number
          .sort((a, b) => a - b); // Sort in ascending order
        // Find the correct zoom level based on the rank
        for (let i = 0; i < sortedKeys.length; i++) {
          const rankStop = sortedKeys[i];
          const nextRankStop = sortedKeys[i + 1];
          if (rank <= rankStop) {
            computedMinZoom = layerStyle.minzoom[rankStop];
            break;
          }
          // If rank is larger than the last key, default to the max zoom value
          if (nextRankStop === undefined) {
            computedMinZoom = layerStyle.minzoom[rankStop];
          }
        }
      } else if (typeof layerStyle.minzoom === 'number') {
        computedMinZoom = layerStyle.minzoom;
      }
      // Apply minzoom and maxzoom filtering
      if (zoom < computedMinZoom) continue;
      if (layerStyle.maxzoom !== undefined && zoom > layerStyle.maxzoom) continue;
      switch (layerStyle.type) {
        case 'fill':
          return new Style({
            fill: new Fill({
              color: this.getPaintValue(layerStyle.paint, 'fill-color', '#000000'),
            }),
          });
        case 'line': {
          let lineWidth = 1; // Default width
          if (Array.isArray(lineWidth)) {
            const stops = this.extractStops(lineWidth);
            if (stops.length > 0) {
              lineWidth = this.interpolateStops(stops, zoom); // Use zoom level to adjust line width
            }
          } else if (typeof lineWidth === 'number') {
            lineWidth = lineWidth;
          }
          // Apply calculated line width
          return new Style({
            stroke: new Stroke({
              color: this.getPaintValue(layerStyle.paint, 'line-color', '#000000'),
              width: Math.max(lineWidth, 1), // Ensure minimum width is 1
            }),
          });
        }
        case 'symbol': {
          // Read text size from layer, default to 10px if not specified
          const textSizeRaw = layerStyle.layout?.['text-size'] || 10; // Default to 10 if not provided
          // Ensure textSize is a number
          let textSize = typeof textSizeRaw === 'number' ? textSizeRaw : 10;
          return new Style({
            text: new Text({
              text: (feature.get('name') || feature.get('rawName') || 'Unknown').replace(/\n/g, ' '),
              font: `bold ${textSize}px sans-serif`, // Use textSize from layer
              fill: new Fill({ color: this.getPaintValue(layerStyle.paint, 'text-color', '#000000') }),
              stroke: new Stroke({ color: this.getPaintValue(layerStyle.paint, 'text-halo-color', '#FFFFFF'), width: 2 }),
              scale: Math.max(textSize / 10, 1), // Prevent too-large scaling
            }),
          });
        }
        default:
          continue;
      }
    }
    // Default return value to prevent errors
    return new Style({});
  };

  // 2. GET ZOOM FROM RESOLUTION ////////////////////////////

  getZoomFromResolution(resolution: number): number {
    if (typeof resolution !== 'number' || resolution <= 0) {
      throw new Error('Invalid resolution value');
    }
    return Math.log2(156543.03 / resolution);
  }

  // 3. EVALUATE FILTER ////////////////////////////

  evaluateFilter(filter: any[], feature: FeatureLike): boolean {
    if (!Array.isArray(filter) || filter.length === 0) return true; // No filter = always matches
    if (!["all", "any", "none"].includes(filter[0]) && typeof filter[0] !== "string") return true; // Ignore invalid filters
    const properties = feature.getProperties() || {}; // Ensure properties exist
    function matchCondition(condition: any[]): boolean {
      if (!Array.isArray(condition) || condition.length < 2) return false;
      const [operator, field, ...values] = condition;
      const value = properties[field] ?? null;
      if (operator === "==") return value === values[0];
      if (operator === "!=") return value !== values[0];
      if (operator === ">") return typeof value === 'number' && value > values[0];
      if (operator === ">=") return typeof value === 'number' && value >= values[0];
      if (operator === "<") return typeof value === 'number' && value < values[0];
      if (operator === "<=") return typeof value === 'number' && value <= values[0];
      if (operator === "in") return values.includes(value); // FIXED
      if (operator === "!in") return !values.includes(value); // FIXED
      if (operator === "has") return field in properties;
      if (operator === "!has") return !(field in properties);
      return false; // Unknown operator
    }
    if (filter[0] === "all") {
      return filter.slice(1).every(matchCondition);
    } else if (filter[0] === "any") {
      return filter.slice(1).some(matchCondition);
    } else if (filter[0] === "none") {
      return !filter.slice(1).some(matchCondition);
    }
    return matchCondition(filter); // Direct condition
  }

  // 4. GET PAINT VALUE ////////////////////////////

  getPaintValue(paint: any, key: string, fallback: any) {
    return paint?.[key] ?? fallback;
  }

  // 5. EXTRACT STOPS ////////////////////////////

  extractStops(expression: any[]): [number, number][] {
    if (Array.isArray(expression) && expression.length > 4 && expression[0] === "interpolate") {
      const stops: [number, number][] = [];
      for (let i = 3; i < expression.length; i += 2) {
        if (expression[i] !== undefined && expression[i + 1] !== undefined) {
          const stop: [number, number] = [Number(expression[i]), Number(expression[i + 1])]; // Convert to numbers
          // Check if both values are numbers
          if (!isNaN(stop[0]) && !isNaN(stop[1])) {
            stops.push(stop);
          }
        }
      }
      return stops;
    }
    return [];
  }

  // 6. INTERPOLATE STOPS ////////////////////////////

  interpolateStops(stops: [number, number][], zoom: number): number {
    if (!Array.isArray(stops) || stops.length === 0) return 1; // Default value if stops is empty
    for (let i = 0; i < stops.length - 1; i++) {
      const [z1, v1] = stops[i];
      const [z2, v2] = stops[i + 1];
      if (zoom >= z1 && zoom <= z2) {
        return v1 + ((zoom - z1) / (z2 - z1)) * (v2 - v1);
      }
    }
    return stops[stops.length - 1][1]; // Return last value if zoom is beyond last stop
  }

}    