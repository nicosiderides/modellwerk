"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, Box, CircleAlert, CircleCheck, CircleX, Crosshair, Info, Layers, LoaderCircle, Map as MapIcon, Search, X } from "lucide-react";
import { ATTRIBUTION, IDECOR_ORTHO_BOUNDS, IDECOR_ORTHO_TILES, IGN_DARK_TILES, parcelAt, parcelsInBBox, search, type Feature, type ParcelProps, type SearchResult } from "@/core/galpones/geo/idecor";
import { bearingOf, type LonLat } from "@/core/galpones/geo/parcel";
import { formatNumber } from "@/core/galpones/metrics";
import { definitionOf, useGalpones } from "../store";
import { loadMapLibre, type MapLike, type MapMouseEvent, type MarkerLike } from "./maplibre";
import { frontLength, fullSelection, lotOverlays, previewFor, quickSelection, warehouseOverlays, withFront, type LotSelection } from "./lotSelection";

/**
 * Mapa para ubicar el lote real (Córdoba): foto aérea, parcelas del catastro,
 * búsqueda por dirección / cuenta / nomenclatura, normativa de la zona y el
 * galpón dibujado en 3D sobre el lote.
 */

const CORDOBA: LonLat = [-64.1888, -31.4201];
const PARCEL_ZOOM = 16;
const EMPTY = { type: "FeatureCollection", features: [] };
const SIGNAL = "#c89b3c";
const SIGNAL_BRIGHT = "#f0c45c";
const CREAM = "#f5f1e8";
const BLUEPRINT = "#8fb8c6";

type Base = "photo" | "map";

/** Margen para encuadrar el lote sin que lo tape la tarjeta (a la derecha o abajo en celulares). */
const framePadding = () => (window.innerWidth > 900 ? { top: 110, bottom: 90, left: 80, right: 460 } : { top: 130, bottom: Math.round(window.innerHeight * 0.58) + 20, left: 30, right: 30 });
const ringBounds = (ring: LonLat[]): [[number, number], [number, number]] => [
  [Math.min(...ring.map((p) => p[0])), Math.min(...ring.map((p) => p[1]))],
  [Math.max(...ring.map((p) => p[0])), Math.max(...ring.map((p) => p[1]))],
];
type Hover = { x: number; y: number; title: string; detail: string } | null;

const m2 = (v: number) => `${formatNumber(Math.round(v))} m²`;
const m1 = (v: number) => `${formatNumber(v, 1)} m`;
const estadoText = (e: string) => (/BALDIO/i.test(e) ? "Baldío" : /PH/i.test(e) && !/NoPH/i.test(e) ? "Propiedad horizontal" : /EDIFICADO/i.test(e) ? "Edificado" : e || "s/d");

/** Textura rayada para los terrenos baldíos (convención de plano). */
function hatchImage(color: [number, number, number], alpha: number) {
  const size = 12;
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const d = (x + y) % size;
      const on = d === 0 || d === 1;
      const i = (y * size + x) * 4;
      data[i] = color[0];
      data[i + 1] = color[1];
      data[i + 2] = color[2];
      data[i + 3] = on ? Math.round(255 * alpha) : 0;
    }
  }
  return { width: size, height: size, data };
}

function addLayers(map: MapLike) {
  map.addSource("parcels", { type: "geojson", data: EMPTY, promoteId: "Nomenclatura" });
  map.addSource("lot", { type: "geojson", data: EMPTY });
  map.addSource("mask", { type: "geojson", data: EMPTY });
  map.addSource("streets", { type: "geojson", data: EMPTY });
  map.addSource("guides", { type: "geojson", data: EMPTY });
  map.addSource("ghost", { type: "geojson", data: EMPTY });
  if (!map.hasImage("hatch")) map.addImage("hatch", hatchImage([200, 155, 60], 0.75), { pixelRatio: 2 });

  map.addLayer({ id: "parcels-vacant", type: "fill", source: "parcels", minzoom: PARCEL_ZOOM - 0.5, filter: ["==", ["get", "Estado"], "BALDIO"], paint: { "fill-pattern": "hatch", "fill-opacity": 0.9 } });
  map.addLayer({ id: "parcels-hit", type: "fill", source: "parcels", minzoom: PARCEL_ZOOM - 0.5, paint: { "fill-color": SIGNAL, "fill-opacity": ["case", ["boolean", ["feature-state", "hover"], false], 0.14, 0.001] } });
  map.addLayer({
    id: "parcels-line",
    type: "line",
    source: "parcels",
    minzoom: PARCEL_ZOOM - 0.5,
    paint: {
      "line-color": CREAM,
      "line-opacity": ["interpolate", ["linear"], ["zoom"], PARCEL_ZOOM - 0.5, 0, PARCEL_ZOOM, 0.32, 19, 0.6],
      "line-width": ["interpolate", ["linear"], ["zoom"], PARCEL_ZOOM, 0.5, 19, 1.3],
    },
  });
  map.addLayer({ id: "parcels-hover", type: "line", source: "parcels", minzoom: PARCEL_ZOOM - 0.5, paint: { "line-color": SIGNAL_BRIGHT, "line-width": 1.8, "line-opacity": ["case", ["boolean", ["feature-state", "hover"], false], 1, 0] } });
  map.addLayer({ id: "mask", type: "fill", source: "mask", paint: { "fill-color": "#080a0b", "fill-opacity": 0.58 } });
  map.addLayer({ id: "lot-glow", type: "line", source: "lot", paint: { "line-color": SIGNAL, "line-width": 12, "line-blur": 9, "line-opacity": 0.45 } });
  map.addLayer({ id: "lot-line", type: "line", source: "lot", paint: { "line-color": SIGNAL_BRIGHT, "line-width": 2.2 } });
  map.addLayer({ id: "street-line", type: "line", source: "streets", layout: { "line-cap": "round" }, paint: { "line-color": ["case", ["get", "front"], SIGNAL_BRIGHT, CREAM], "line-width": ["case", ["get", "front"], 6, 3], "line-opacity": ["case", ["get", "front"], 1, 0.55] } });
  map.addLayer({ id: "guides-usable", type: "line", source: "guides", filter: ["==", ["get", "kind"], "usable"], paint: { "line-color": CREAM, "line-width": 1, "line-opacity": 0.55, "line-dasharray": [1, 2] } });
  map.addLayer({ id: "guides-buildable", type: "line", source: "guides", filter: ["==", ["get", "kind"], "buildable"], paint: { "line-color": BLUEPRINT, "line-width": 1.6, "line-dasharray": [3, 2] } });
  map.addLayer({
    id: "ghost",
    type: "fill-extrusion",
    source: "ghost",
    paint: {
      "fill-extrusion-color": ["case", ["==", ["get", "kind"], "canopy"], "#b9b3a6", "#e9e4d8"],
      "fill-extrusion-height": ["get", "h"],
      "fill-extrusion-base": ["get", "base"],
      "fill-extrusion-opacity": 0.92,
      "fill-extrusion-vertical-gradient": true,
    },
  });
}

/**
 * Inclina el mapa mirando el lote desde la calle (un poco en diagonal), con el
 * lote centrado en la parte libre de la pantalla. Es el único movimiento
 * automático del mapa: muestra el galpón parado sobre el terreno real.
 */
function tiltTo(map: MapLike, sel: LotSelection, auto: boolean) {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const bearing = bearingOf(sel.location.fit.t) - 28;
  const cam = map.cameraForBounds(ringBounds(sel.ring), { padding: framePadding(), maxZoom: 19, bearing });
  map.stop();
  map.easeTo({
    ...(cam ? { center: cam.center, zoom: Math.min(19, cam.zoom - 0.2) } : {}),
    pitch: 56,
    bearing,
    duration: reduce ? 0 : auto ? 2200 : 1300,
  });
}

export function LotMap() {
  const definition = useGalpones((s) => definitionOf(s));
  const config = useGalpones((s) => s.warehouse.config);
  const setModal = useGalpones((s) => s.setModal);
  const applyLotLocation = useGalpones((s) => s.applyLotLocation);

  const holder = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLike | null>(null);
  const markers = useRef<MarkerLike[]>([]);
  const loadedBox = useRef<[number, number, number, number] | null>(null);
  const parcelsAbort = useRef<AbortController | null>(null);
  const selAbort = useRef<AbortController | null>(null);
  const hoverId = useRef<string | number | null>(null);
  const tilted = useRef(false);

  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [base, setBase] = useState<Base>("photo");
  const [zoomOk, setZoomOk] = useState(false);
  const [parcelsLoading, setParcelsLoading] = useState(false);
  const [hover, setHover] = useState<Hover>(null);
  const [sel, setSel] = useState<LotSelection | null>(null);
  const [selError, setSelError] = useState<string | null>(null);
  const [view3d, setView3d] = useState(false);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const preview = useMemo(() => (definition && config && sel ? previewFor(definition, config, sel) : null), [definition, config, sel]);
  // ¿Con otro lado como frente entra un galpón más grande? (lotes de esquina anchos y poco profundos)
  const betterFront = useMemo(() => {
    if (!definition || !config || !sel || !preview || sel.zoneStatus === "loading") return null;
    const area = (c: typeof config) => c.dimensions.width * c.dimensions.length;
    const now = preview.impossible ? 0 : area(preview.config);
    let best: { edge: number; length: number; width: number; long: number } | null = null;
    for (const side of sel.analysis.sides) {
      if (side.edges.includes(sel.analysis.frontEdge)) continue;
      const alt = withFront(sel, side.edges[0]);
      const p = previewFor(definition, config, alt);
      if (p.impossible) continue;
      const a = area(p.config);
      if (a > now * 1.15 && (!best || a > best.width * best.long)) best = { edge: side.edges[0], length: side.length, width: p.config.dimensions.width, long: p.config.dimensions.length };
    }
    return best;
  }, [definition, config, sel, preview]);

  /* ───────── selección ───────── */
  const select = useCallback(async (parcel: Feature<ParcelProps>, fly = true) => {
    selAbort.current?.abort();
    const ctrl = new AbortController();
    selAbort.current = ctrl;
    setSelError(null);
    const quick = quickSelection(parcel);
    setSel(quick);
    const map = mapRef.current;
    if (map && fly) {
      map.fitBounds(ringBounds(quick.ring), { padding: framePadding(), maxZoom: 19, duration: 900, pitch: 0, bearing: 0 });
      tilted.current = false;
      setView3d(false);
    }
    try {
      const full = await fullSelection(parcel, ctrl.signal);
      if (ctrl.signal.aborted) return;
      setSel(full);
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setSelError("No pudimos consultar la normativa de este lote. Revisá la conexión y volvé a tocarlo.");
    }
  }, []);

  const selectAt = useCallback(
    async (p: LonLat, fly = true) => {
      try {
        const parcel = await parcelAt(p);
        if (parcel) await select(parcel, fly);
        else setSelError("En ese punto no hay una parcela del catastro (puede ser calle o espacio público).");
      } catch {
        setSelError("El catastro de Córdoba no respondió. Probá de nuevo en unos segundos.");
      }
    },
    [select]
  );

  /* ───────── parcelas visibles ───────── */
  const refreshParcels = useCallback(async () => {
    const map = mapRef.current;
    if (!map) return;
    const ok = map.getZoom() >= PARCEL_ZOOM - 0.5;
    setZoomOk(ok);
    if (!ok) return;
    const b = map.getBounds();
    const box: [number, number, number, number] = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
    const prev = loadedBox.current;
    if (prev && box[0] >= prev[0] && box[1] >= prev[1] && box[2] <= prev[2] && box[3] <= prev[3]) return;
    const padX = (box[2] - box[0]) * 0.25;
    const padY = (box[3] - box[1]) * 0.25;
    const want: [number, number, number, number] = [box[0] - padX, box[1] - padY, box[2] + padX, box[3] + padY];
    parcelsAbort.current?.abort();
    const ctrl = new AbortController();
    parcelsAbort.current = ctrl;
    setParcelsLoading(true);
    try {
      const fc = await parcelsInBBox(want, ctrl.signal);
      if (ctrl.signal.aborted) return;
      map.getSource("parcels")?.setData(fc);
      loadedBox.current = want;
    } catch {
      /* sin conexión: queda lo que había */
    } finally {
      if (parcelsAbort.current === ctrl) setParcelsLoading(false);
    }
  }, []);

  /* ───────── crear el mapa ───────── */
  useEffect(() => {
    let cancelled = false;
    const startLocation = useGalpones.getState().warehouse.config?.lot.location ?? null;
    loadMapLibre()
      .then((ml) => {
        if (cancelled || !holder.current) return;
        const map = new ml.Map({
          container: holder.current,
          style: {
            version: 8,
            sources: {
              ign: { type: "raster", tiles: [IGN_DARK_TILES], tileSize: 256, scheme: "tms", maxzoom: 18 },
              orto: { type: "raster", tiles: [IDECOR_ORTHO_TILES], tileSize: 256, bounds: IDECOR_ORTHO_BOUNDS, minzoom: 9, maxzoom: 18 },
            },
            layers: [
              { id: "bg", type: "background", paint: { "background-color": "#0e1011" } },
              { id: "ign", type: "raster", source: "ign", paint: { "raster-opacity": 1 } },
              { id: "orto", type: "raster", source: "orto", paint: { "raster-saturation": -0.18, "raster-contrast": 0.06, "raster-brightness-max": 0.9, "raster-fade-duration": 250 } },
            ],
          },
          center: startLocation?.center ?? CORDOBA,
          zoom: startLocation ? 17.5 : 11.4,
          maxPitch: 70,
          attributionControl: false,
          fadeDuration: 150,
        });
        mapRef.current = map;
        map.on("load", () => {
          if (cancelled) return;
          addLayers(map);
          setStatus("ready");
          refreshParcels();
          if (startLocation) selectAt(startLocation.center, true);
        });
        map.on("moveend", () => refreshParcels());
        map.on("zoom", () => setZoomOk(map.getZoom() >= PARCEL_ZOOM - 0.5));
        map.on("pitchend", () => setView3d(map.getPitch() > 20));
        const onMove = (e: MapMouseEvent) => {
          const f = e.features?.[0];
          if (!f || f.id === undefined) return;
          if (hoverId.current !== null && hoverId.current !== f.id) map.setFeatureState({ source: "parcels", id: hoverId.current }, { hover: false });
          hoverId.current = f.id;
          map.setFeatureState({ source: "parcels", id: f.id }, { hover: true });
          map.getCanvas().style.cursor = "pointer";
          const p = f.properties as ParcelProps;
          const area = (Number(p.Superficie_Tierra_Urbana) || 0) + (Number(p.Superficie_Tierra_Rural) || 0);
          setHover({ x: e.point.x, y: e.point.y, title: String(p.desig_oficial || "Parcela").trim() || "Parcela", detail: `${area ? m2(area) : ""}${area ? " · " : ""}${estadoText(String(p.Estado ?? ""))}` });
        };
        const onLeave = () => {
          if (hoverId.current !== null) map.setFeatureState({ source: "parcels", id: hoverId.current }, { hover: false });
          hoverId.current = null;
          map.getCanvas().style.cursor = "";
          setHover(null);
        };
        map.on("mousemove", "parcels-hit", onMove);
        map.on("mouseleave", "parcels-hit", onLeave);
        map.on("click", "parcels-hit", (e) => {
          const f = e.features?.[0];
          if (!f) return;
          // Se vuelve a pedir la parcela completa (geometría sin recortar por la vista).
          selectAt([e.lngLat.lng, e.lngLat.lat], true);
        });
      })
      .catch(() => !cancelled && setStatus("error"));
    return () => {
      cancelled = true;
      parcelsAbort.current?.abort();
      selAbort.current?.abort();
      markers.current.forEach((m) => m.remove());
      markers.current = [];
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [refreshParcels, selectAt]);

  /* ───────── capa base ───────── */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || status !== "ready") return;
    map.setLayoutProperty("orto", "visibility", base === "photo" ? "visible" : "none");
  }, [base, status]);

  /* ───────── dibujar la selección ───────── */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || status !== "ready") return;
    markers.current.forEach((m) => m.remove());
    markers.current = [];
    if (!sel) {
      for (const id of ["lot", "mask", "streets", "guides", "ghost"]) map.getSource(id)?.setData(EMPTY);
      return;
    }
    const o = lotOverlays(sel);
    map.getSource("lot")?.setData(o.lot);
    map.getSource("mask")?.setData(o.mask);
    map.getSource("streets")?.setData(o.lines);
    if (definition && preview && !preview.impossible) {
      const w = warehouseOverlays(definition, sel, preview);
      map.getSource("guides")?.setData(w.guides);
      map.getSource("ghost")?.setData(w.ghost);
    } else {
      map.getSource("guides")?.setData(EMPTY);
      map.getSource("ghost")?.setData(EMPTY);
    }
    // Rótulos de los lados a la calle: el frente, y los otros se pueden elegir como frente.
    const ml = window.maplibregl;
    if (!ml) return;
    const a = sel.analysis;
    const frontSide = a.sides.find((s) => s.edges.includes(a.frontEdge));
    for (const side of a.sides) {
      const isFront = side === frontSide;
      const mid = a.ringLonLat[side.edges[0]];
      const end = a.ringLonLat[(side.edges[side.edges.length - 1] + 1) % a.ringLonLat.length];
      const at: LonLat = [(mid[0] + end[0]) / 2, (mid[1] + end[1]) / 2];
      const el = document.createElement("button");
      el.type = "button";
      el.className = `gp-map__edge ${isFront ? "is-front" : ""}`;
      el.innerHTML = isFront ? `<b>Frente</b><span>${m1(side.length)}</span>` : `<span>${m1(side.length)}</span><em>Usar como frente</em>`;
      el.title = isFront ? "Lado del lote sobre la calle que se toma como frente" : "Tomar este lado como frente del lote";
      if (!isFront) el.addEventListener("click", (ev) => {
        ev.stopPropagation();
        setSel((cur) => (cur ? withFront(cur, side.edges[0]) : cur));
      });
      markers.current.push(new ml.Marker({ element: el, anchor: "center" }).setLngLat(at).addTo(map));
    }
  }, [sel, preview, definition, status]);

  /* ───────── vista 3D: un solo movimiento, al terminar de cargar el lote ───────── */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !sel || sel.zoneStatus === "loading" || tilted.current || !preview || preview.impossible) return;
    tilted.current = true;
    tiltTo(map, sel, true);
  }, [sel, preview]);

  const toggle3d = () => {
    const map = mapRef.current;
    if (!map) return;
    if (view3d) {
      const cam = sel ? map.cameraForBounds(ringBounds(sel.ring), { padding: framePadding(), maxZoom: 19 }) : undefined;
      map.easeTo({ pitch: 0, bearing: 0, duration: 900, ...(cam ? { center: cam.center, zoom: cam.zoom } : {}) });
    } else if (sel) tiltTo(map, sel, false);
    else map.easeTo({ pitch: 55, bearing: -20, duration: 1200 });
  };

  /* ───────── búsqueda ───────── */
  const runSearch = async (e?: FormEvent) => {
    e?.preventDefault();
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    setSearchError(null);
    setResults(null);
    try {
      const found = await search(q);
      if (!found.length) setSearchError("No encontramos ese lugar en la provincia de Córdoba. Probá con el número de cuenta del inmobiliario (12 dígitos, está en la boleta).");
      else if (found.length === 1) choose(found[0]);
      else setResults(found);
    } catch {
      setSearchError("El buscador no respondió. Revisá la conexión y probá de nuevo.");
    } finally {
      setSearching(false);
    }
  };

  const choose = (r: SearchResult) => {
    setResults(null);
    const map = mapRef.current;
    if (r.parcel) {
      select(r.parcel, true);
      return;
    }
    // Acerca el mapa a la dirección mientras se busca la parcela; al encontrarla, se encuadra el lote.
    map?.flyTo({ center: r.center, zoom: 17.5, pitch: 0, bearing: 0, duration: 1200 });
    selectAt(r.center, true);
  };

  const close = () => setModal(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const use = () => {
    if (!sel) return;
    applyLotLocation(sel.location, sel.analysis.corner, sel.zone);
  };

  return (
    <div className="gp-map" role="dialog" aria-modal="true" aria-label="Ubicar el lote en el mapa">
      <div ref={holder} className="gp-map__canvas" />

      <header className="gp-map__top">
        <button type="button" className="gp-map__back" onClick={close} aria-label="Volver al configurador">
          <ArrowLeft aria-hidden /> <span>Volver</span>
        </button>
        <form className="gp-map__search" onSubmit={runSearch} role="search">
          <Search aria-hidden />
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSearchError(null);
            }}
            placeholder="Dirección, número de cuenta o nomenclatura"
            aria-label="Buscar el lote"
            autoFocus
          />
          {query && (
            <button type="button" className="gp-map__clear" onClick={() => (setQuery(""), setResults(null), setSearchError(null))} aria-label="Borrar búsqueda">
              <X aria-hidden />
            </button>
          )}
          <button type="submit" className="gp-map__go" disabled={searching || !query.trim()}>
            {searching ? <LoaderCircle className="gp-spin" aria-hidden /> : "Buscar"}
          </button>
          {(results || searchError) && (
            <div className="gp-map__results" role="listbox">
              {searchError && <p className="gp-map__msg">{searchError}</p>}
              {results?.map((r) => (
                <button key={`${r.label}-${r.center.join()}`} type="button" role="option" aria-selected={false} onClick={() => choose(r)}>
                  <strong>{r.label}</strong>
                  <span>{r.detail}</span>
                </button>
              ))}
            </div>
          )}
        </form>
        <div className="gp-map__bases" role="radiogroup" aria-label="Fondo del mapa">
          <button type="button" role="radio" aria-checked={base === "photo"} className={base === "photo" ? "is-on" : ""} onClick={() => setBase("photo")}>
            <Layers aria-hidden /> Foto aérea
          </button>
          <button type="button" role="radio" aria-checked={base === "map"} className={base === "map" ? "is-on" : ""} onClick={() => setBase("map")}>
            <MapIcon aria-hidden /> Mapa
          </button>
        </div>
      </header>

      {status === "loading" && (
        <div className="gp-map__center-msg">
          <LoaderCircle className="gp-spin" aria-hidden /> Cargando el mapa de Córdoba…
        </div>
      )}
      {status === "error" && (
        <div className="gp-map__center-msg is-error">
          <CircleX aria-hidden /> No se pudo cargar el mapa. Revisá la conexión a internet y volvé a abrirlo.
        </div>
      )}
      {status === "ready" && !zoomOk && !sel && <div className="gp-map__hint">Acercá el mapa o buscá una dirección para ver los lotes</div>}
      {status === "ready" && zoomOk && parcelsLoading && (
        <div className="gp-map__hint is-quiet">
          <LoaderCircle className="gp-spin" aria-hidden /> Cargando lotes del catastro…
        </div>
      )}
      {hover && !sel && (
        <div className="gp-map__tip" style={{ left: hover.x, top: hover.y }}>
          <strong>{hover.title}</strong>
          <span>{hover.detail}</span>
        </div>
      )}

      <aside className={`gp-map__card ${sel ? "has-lot" : ""}`} aria-live="polite">
        {!sel ? (
          <EmptyCard error={selError} />
        ) : (
          <LotCard
            sel={sel}
            preview={preview}
            error={selError}
            onUse={use}
            onClear={() => setSel(null)}
            betterFront={betterFront}
            onBetterFront={() => betterFront && setSel((cur) => (cur ? withFront(cur, betterFront.edge) : cur))}
          />
        )}
      </aside>

      <div className="gp-map__tools">
        <button type="button" onClick={toggle3d} className={view3d ? "is-on" : ""} aria-pressed={view3d} title="Inclinar el mapa para ver el galpón en 3D">
          <Box aria-hidden /> {view3d ? "Vista en planta" : "Ver en 3D"}
        </button>
        {sel && (
          <button
            type="button"
            onClick={() => mapRef.current?.fitBounds(ringBounds(sel.ring), { padding: framePadding(), maxZoom: 19, duration: 800, pitch: 0, bearing: 0 })}
            title="Centrar el lote"
            aria-label="Centrar el lote"
          >
            <Crosshair aria-hidden /> <span className="gp-map__label">Centrar lote</span>
          </button>
        )}
      </div>
      <p className="gp-map__attribution">{ATTRIBUTION}</p>
    </div>
  );
}

function EmptyCard({ error }: { error: string | null }) {
  return (
    <div className="gp-map__empty">
      <h2>Ubicá tu lote</h2>
      <p>Buscalo por dirección o por el número de cuenta del inmobiliario, o acercá el mapa y tocalo.</p>
      <p>Con el lote real, la app toma sus medidas y la normativa de la zona, y te muestra tu galpón parado en el terreno.</p>
      {error && (
        <p className="gp-map__error">
          <CircleAlert aria-hidden /> {error}
        </p>
      )}
      <div className="gp-map__legend">
        <span>
          <i className="is-lot" /> Límite de parcela
        </span>
        <span>
          <i className="is-vacant" /> Terreno baldío
        </span>
      </div>
      <p className="gp-map__note">Por ahora con normativa de Córdoba capital. El catastro cubre toda la provincia.</p>
    </div>
  );
}

type BetterFront = { edge: number; length: number; width: number; long: number } | null;

function LotCard({
  sel,
  preview,
  error,
  onUse,
  onClear,
  betterFront,
  onBetterFront,
}: {
  sel: LotSelection;
  preview: ReturnType<typeof previewFor> | null;
  error: string | null;
  onUse: () => void;
  onClear: () => void;
  betterFront: BetterFront;
  onBetterFront: () => void;
}) {
  const config = useGalpones((s) => s.warehouse.config);
  const loc = sel.location;
  const a = sel.analysis;
  const zone = sel.zone?.zone ?? null;
  const rules = sel.zone?.rules ?? null;
  const irregular = a.fit.coverage < 0.9;
  const sideText = rules?.setbackSide ? `${m1(rules.setbackSide)}${rules.sideCount === 1 ? " (un lado)" : ""}` : rules?.sideCount === 0 ? "no exige" : "a confirmar";
  const d = preview?.config.dimensions;
  const current = config?.dimensions;
  return (
    <div className="gp-map__lot">
      <header>
        <div>
          <h2>{loc.designacion || "Parcela sin designación"}</h2>
          <p>
            {[loc.localidad && loc.localidad.charAt(0) + loc.localidad.slice(1).toLowerCase(), loc.nomenclatura && `Nomenclatura ${loc.nomenclatura}`].filter(Boolean).join(" · ")}
          </p>
        </div>
        <button type="button" className="gp-ghost" onClick={onClear} aria-label="Elegir otro lote">
          <X aria-hidden />
        </button>
      </header>

      <dl className="gp-map__stats">
        <div>
          <dt>Superficie</dt>
          <dd>{m2(loc.superficie)}</dd>
        </div>
        <div>
          <dt>Frente</dt>
          <dd>{m1(frontLength(a))}</dd>
        </div>
        <div>
          <dt>Estado</dt>
          <dd>{estadoText(loc.estado)}</dd>
        </div>
      </dl>
      <p className="gp-map__fitline">
        {irregular ? (
          <>
            <Info aria-hidden /> Lote irregular: el diseño usa su parte rectangular más grande, {m1(a.fit.width)} × {m1(a.fit.depth)} ({Math.round(a.fit.coverage * 100)} % del lote).
          </>
        ) : (
          <>
            Rectángulo útil {m1(a.fit.width)} × {m1(a.fit.depth)}
            {a.corner !== "none" ? " · lote en esquina" : ""}
          </>
        )}
      </p>

      <section className="gp-map__zone">
        {sel.zoneStatus === "loading" && (
          <p className="gp-map__loading">
            <LoaderCircle className="gp-spin" aria-hidden /> Consultando la normativa de la zona…
          </p>
        )}
        {sel.zoneStatus === "none" && <p className="gp-map__msg">La normativa municipal de esta localidad todavía no está cargada en la app: se mantiene la normativa que elegiste.</p>}
        {sel.zoneStatus === "error" && <p className="gp-map__msg">No se pudo consultar la normativa de la zona. Se mantiene la que elegiste.</p>}
        {zone && rules && (
          <>
            <div className="gp-map__zonehead">
              <h3>{zone.label}</h3>
              <span className={`gp-map__use is-${zone.uso}`}>
                {zone.uso === "industrial" ? <CircleCheck aria-hidden /> : zone.uso === "no" ? <CircleX aria-hidden /> : <CircleAlert aria-hidden />}
                {zone.uso === "industrial" ? "Uso industrial" : zone.uso === "condicionado" ? "Industria con condiciones" : zone.uso === "no" ? "No prevista para industria" : "Uso a confirmar"}
              </span>
            </div>
            <dl className="gp-map__rules">
              <div>
                <dt>FOS</dt>
                <dd>{rules.fos !== null && rules.fos !== undefined ? `${Math.round(rules.fos * 100)} %` : "—"}</dd>
              </div>
              <div>
                <dt>FOT</dt>
                <dd>{rules.fot ? formatNumber(rules.fot, 1) : "—"}</dd>
              </div>
              <div>
                <dt>Altura</dt>
                <dd>{rules.maxHeight ? m1(rules.maxHeight) : "sin límite"}</dd>
              </div>
              <div>
                <dt>Retiro de frente</dt>
                <dd>{rules.setbackFront !== null && rules.setbackFront !== undefined ? m1(rules.setbackFront) : "a confirmar"}</dd>
              </div>
              <div>
                <dt>Laterales</dt>
                <dd>{sideText}</dd>
              </div>
              <div>
                <dt>Fondo</dt>
                <dd>{rules.setbackBack !== null && rules.setbackBack !== undefined ? m1(rules.setbackBack) : "a confirmar"}</dd>
              </div>
            </dl>
            <p className="gp-map__usetext">{zone.usoTexto}</p>
            {zone.notes.length > 0 && (
              <details className="gp-map__notes">
                <summary>Aclaraciones ({zone.notes.length})</summary>
                <ul>
                  {zone.notes.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              </details>
            )}
          </>
        )}
      </section>

      {preview && d && current && (
        <p className={`gp-map__verdict ${preview.impossible ? "is-fail" : preview.resized ? "is-warn" : "is-ok"}`}>
          {preview.impossible ? (
            <>
              <CircleX aria-hidden /> Tu galpón no entra en este lote ni con las medidas mínimas de esta tipología.
            </>
          ) : preview.resized ? (
            <>
              <CircleAlert aria-hidden /> Para cumplir la normativa, tu galpón pasa de {formatNumber(current.width)} × {formatNumber(current.length)} m a {formatNumber(d.width)} × {formatNumber(d.length)} m.
            </>
          ) : (
            <>
              <CircleCheck aria-hidden /> Tu galpón de {formatNumber(d.width)} × {formatNumber(d.length)} m entra en este lote y cumple la normativa.
            </>
          )}
        </p>
      )}
      {betterFront && (
        <button type="button" className="gp-map__suggest" onClick={onBetterFront}>
          <strong>Tomá como frente el lado de {m1(betterFront.length)}</strong>
          <span>
            Así el galpón puede ser de {formatNumber(betterFront.width)} × {formatNumber(betterFront.long)} m.
          </span>
        </button>
      )}
      {error && (
        <p className="gp-map__error">
          <CircleAlert aria-hidden /> {error}
        </p>
      )}

      <div className="gp-map__actions">
        <button type="button" className="gp-button gp-button--primary" onClick={onUse} disabled={sel.zoneStatus === "loading"}>
          Usar este lote
        </button>
        <button type="button" className="gp-button" onClick={onClear}>
          Elegir otro
        </button>
      </div>
      <p className="gp-map__source">Datos de IDECOR (Catastro y Mapas Córdoba), consultados hoy. Son de referencia: no reemplazan un informe catastral ni la consulta en la Municipalidad.</p>
    </div>
  );
}
