"use client";

import { assetPath } from "@/components/environment/utils/assetPath";

/**
 * Carga MapLibre GL (motor de mapas libre, licencia BSD) desde /public/vendor.
 * Se carga sólo al abrir el mapa del lote, así no pesa en el resto de la app.
 * Tipos mínimos: sólo lo que usa el mapa del lote.
 */

export type LngLat = { lng: number; lat: number };
export type MapMouseEvent = { lngLat: LngLat; point: { x: number; y: number }; features?: { id?: string | number; properties: Record<string, unknown>; geometry: unknown }[] };
export type GeoJSONSource = { setData: (data: unknown) => void };
export type MapBounds = { getWest(): number; getSouth(): number; getEast(): number; getNorth(): number };

export interface MapLike {
  on(type: string, listener: (e: MapMouseEvent) => void): void;
  on(type: string, layer: string, listener: (e: MapMouseEvent) => void): void;
  off(type: string, layer: string, listener: (e: MapMouseEvent) => void): void;
  once(type: string, listener: () => void): void;
  addSource(id: string, source: unknown): void;
  getSource(id: string): GeoJSONSource | undefined;
  addLayer(layer: unknown, before?: string): void;
  getLayer(id: string): unknown;
  setLayoutProperty(layer: string, name: string, value: unknown): void;
  setPaintProperty(layer: string, name: string, value: unknown): void;
  addImage(id: string, image: { width: number; height: number; data: Uint8Array | Uint8ClampedArray }, options?: { pixelRatio?: number }): void;
  hasImage(id: string): boolean;
  setFeatureState(feature: { source: string; id: string | number }, state: Record<string, unknown>): void;
  queryRenderedFeatures(point: { x: number; y: number }, options?: { layers?: string[] }): { id?: string | number; properties: Record<string, unknown>; geometry: unknown }[];
  getZoom(): number;
  getPitch(): number;
  getBearing(): number;
  getBounds(): MapBounds;
  getCanvas(): HTMLCanvasElement;
  project(lngLat: [number, number]): { x: number; y: number };
  flyTo(options: Record<string, unknown>): void;
  easeTo(options: Record<string, unknown>): void;
  fitBounds(bounds: [[number, number], [number, number]], options?: Record<string, unknown>): void;
  cameraForBounds(bounds: [[number, number], [number, number]], options?: Record<string, unknown>): { center: LngLat | [number, number]; zoom: number } | undefined;
  stop(): void;
  resize(): void;
  remove(): void;
  loaded(): boolean;
  isStyleLoaded(): boolean;
}

export interface MarkerLike {
  setLngLat(p: [number, number]): MarkerLike;
  addTo(map: MapLike): MarkerLike;
  remove(): void;
  getElement(): HTMLElement;
}

export interface MapLibreGL {
  Map: new (options: Record<string, unknown>) => MapLike;
  Marker: new (options: { element: HTMLElement; anchor?: string }) => MarkerLike;
  ScaleControl: new (options?: Record<string, unknown>) => unknown;
}

declare global {
  interface Window {
    maplibregl?: MapLibreGL;
  }
}

const VERSION = "4.7.1";
let loading: Promise<MapLibreGL> | null = null;

export function loadMapLibre(): Promise<MapLibreGL> {
  if (typeof window === "undefined") return Promise.reject(new Error("Sin navegador"));
  if (window.maplibregl) return Promise.resolve(window.maplibregl);
  if (loading) return loading;
  const base = assetPath(`/vendor/maplibre-gl-${VERSION}`);
  loading = new Promise<MapLibreGL>((resolve, reject) => {
    if (!document.querySelector(`link[data-maplibre="${VERSION}"]`)) {
      const css = document.createElement("link");
      css.rel = "stylesheet";
      css.href = `${base}/maplibre-gl.css`;
      css.dataset.maplibre = VERSION;
      document.head.appendChild(css);
    }
    const script = document.createElement("script");
    script.src = `${base}/maplibre-gl.js`;
    script.async = true;
    script.onload = () => (window.maplibregl ? resolve(window.maplibregl) : reject(new Error("MapLibre no se cargó")));
    script.onerror = () => {
      loading = null;
      reject(new Error("No se pudo cargar el mapa"));
    };
    document.head.appendChild(script);
  });
  return loading;
}
