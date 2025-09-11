/**
 * Service for generating OpenLayers styles dynamically based on Mapbox-style JSON definitions.
 *
 * Provides a style function that maps vector features and resolution to OL styles,
 * supporting fill, line, and symbol layers with paint and layout properties, zoom-dependent styling,
 * and feature filtering. Includes utility methods for zoom calculation, filter evaluation,
 * paint value extraction, and interpolation of style stops.
 */

import { Injectable } from '@angular/core';
import { global } from '../../environments/environment';
import { Fill, Stroke, Style, Text } from 'ol/style';
import { FeatureLike } from 'ol/Feature';
import { StyleJSON } from 'src/globald';

// 1. styleFunction
// 2. getZoomFromResolution
// 3. evaluateFilter
// 4. getPaintValue
// 5. extractStops
// 6. interpolateStops

@Injectable({
  providedIn: 'root'
})

export class StyleService {

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

  /* styleMapTiler = (feature: FeatureLike, resolution: number) => {
    const name = feature.get('name');
    if (name) {
      return new Style({
        text: new Text({
          text: name,
          font: '20px Arial',   // 👈 adjust size/family here
          fill: new Fill({ color: '#000' }),
          stroke: new Stroke({ color: '#fff', width: 2 }),
        }),
      });
    }
    return undefined;
  } */

}
