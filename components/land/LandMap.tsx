"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Box, CircleX, Crosshair, Layers, LoaderCircle, Map as MapIcon, Search, X } from "lucide-react";
import { ATTRIBUTION, IDECOR_ORTHO_BOUNDS, IDECOR_ORTHO_TILES, IGN_DARK_TILES, parcelAt, parcelsInBBox, search, type Feature, type ParcelProps, type SearchResult } from "@/core/galpones/geo/idecor";
import { bearingOf, type LonLat } from "@/core/galpones/geo/parcel";
import { formatNumber } from "@/core/galpones/metrics";
import { loadMapLibre, type MapLike, type MapMouseEvent, type MarkerLike } from "@/components/galpones/map/maplibre";
import { studyEnvelope } from "@/core/land/geo/study";
import { EMPTY, envelopeOverlays, lotOverlays } from "./overlays";
import { useLand } from "./store";

/**
 * Mapa de MW Land: foto aérea de Córdoba, parcelas del catastro, búsqueda y,
 * con un lote elegido, la caja máxima que permite la normativa parada sobre
 * el terreno real. Mismo lenguaje visual que el mapa de Galpones.
 */

const START_BOUNDS: [[number, number], [number, number]] = [
  [-64.234, -31.4516],
  [-64.1283, -31.4073],
];
const PARCEL_ZOOM = 16;
const SIGNAL = "#c89b3c";
const SIGNAL_BRIGHT = "#f0c45c";
const CREAM = "#f5f1e8";
const BLUEPRINT = "#8fb8c6";
const OCCUPIED = "#e06a5e";
const ESTADO = ["upcase", ["to-string", ["get", "Estado"]]];
const OCCUPIED_EXPR = ["any", ["in", "EDIFICADO", ESTADO], ["all", ["in", "PH", ESTADO], ["!", ["in", "NOPH", ESTADO]]]];

const framePadding = () => (window.innerWidth > 900 ? { top: 110, bottom: 190, left: 80, right: 500 } : { top: 140, bottom: Math.round(window.innerHeight * 0.58) + 20, left: 30, right: 30 });
const ringBounds = (ring: LonLat[]): [[number, number], [number, number]] => [
  [Math.min(...ring.map((p) => p[0])), Math.min(...ring.map((p) => p[1]))],
  [Math.max(...ring.map((p) => p[0])), Math.max(...ring.map((p) => p[1]))],
];
type Hover = { x: number; y: number; title: string; detail: string } | null;

const m2 = (v: number) => `${formatNumber(Math.round(v))} m²`;
const m1 = (v: number) => `${formatNumber(v, 1)} m`;
export const isOccupied = (e: string) => /EDIFICADO/i.test(e) || (/PH/i.test(e) && !/NoPH/i.test(e));
export const estadoText = (e: string) => (/BALDIO/i.test(e) ? "Baldío" : /PH/i.test(e) && !/NoPH/i.test(e) ? "Propiedad horizontal" : /EDIFICADO/i.test(e) ? "Edificado" : e || "s/d");

function hatchImage(color: [number, number, number], alpha: number) {
  const size = 12;
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y += 1)
    for (let x = 0; x < size; x += 1) {
      const d = (x + y) % size;
      const i = (y * size + x) * 4;
      data[i] = color[0];
      data[i + 1] = color[1];
      data[i + 2] = color[2];
      data[i + 3] = d === 0 || d === 1 ? Math.round(255 * alpha) : 0;
    }
  return { width: size, height: size, data };
}

function addLayers(map: MapLike) {
  for (const id of ["parcels", "lot", "mask", "streets", "ground", "center", "boxes"]) map.addSource(id, { type: "geojson", data: EMPTY, ...(id === "parcels" ? { promoteId: "Nomenclatura" } : {}) });
  if (!map.hasImage("hatch")) map.addImage("hatch", hatchImage([200, 155, 60], 0.75), { pixelRatio: 2 });
  if (!map.hasImage("hatch-red")) map.addImage("hatch-red", hatchImage([224, 106, 94], 0.7), { pixelRatio: 2 });

  map.addLayer({ id: "parcels-vacant", type: "fill", source: "parcels", minzoom: PARCEL_ZOOM - 0.5, filter: ["==", ["get", "Estado"], "BALDIO"], paint: { "fill-pattern": "hatch", "fill-opacity": 0.9 } });
  map.addLayer({ id: "parcels-hit", type: "fill", source: "parcels", minzoom: PARCEL_ZOOM - 0.5, paint: { "fill-color": ["case", OCCUPIED_EXPR, OCCUPIED, SIGNAL], "fill-opacity": ["case", ["boolean", ["feature-state", "hover"], false], 0.16, 0.001] } });
  map.addLayer({
    id: "parcels-line",
    type: "line",
    source: "parcels",
    minzoom: PARCEL_ZOOM - 0.5,
    paint: { "line-color": CREAM, "line-opacity": ["interpolate", ["linear"], ["zoom"], PARCEL_ZOOM - 0.5, 0, PARCEL_ZOOM, 0.32, 19, 0.6], "line-width": ["interpolate", ["linear"], ["zoom"], PARCEL_ZOOM, 0.5, 19, 1.3] },
  });
  map.addLayer({ id: "parcels-hover", type: "line", source: "parcels", minzoom: PARCEL_ZOOM - 0.5, paint: { "line-color": SIGNAL_BRIGHT, "line-width": 1.8, "line-opacity": ["case", ["boolean", ["feature-state", "hover"], false], 1, 0] } });
  map.addLayer({ id: "mask", type: "fill", source: "mask", paint: { "fill-color": "#080a0b", "fill-opacity": 0.55 } });
  map.addLayer({ id: "center-fill", type: "fill", source: "center", paint: { "fill-pattern": "hatch-red", "fill-opacity": 0.9 } });
  map.addLayer({ id: "ground-fill", type: "fill", source: "ground", paint: { "fill-color": BLUEPRINT, "fill-opacity": 0.12 } });
  map.addLayer({ id: "ground-line", type: "line", source: "ground", paint: { "line-color": BLUEPRINT, "line-width": 1.8, "line-dasharray": [3, 2] } });
  map.addLayer({ id: "lot-glow", type: "line", source: "lot", paint: { "line-color": SIGNAL, "line-width": 12, "line-blur": 9, "line-opacity": 0.45 } });
  map.addLayer({ id: "lot-line", type: "line", source: "lot", paint: { "line-color": SIGNAL_BRIGHT, "line-width": 2.2 } });
  map.addLayer({ id: "street-line", type: "line", source: "streets", layout: { "line-cap": "round" }, paint: { "line-color": ["case", ["get", "front"], SIGNAL_BRIGHT, CREAM], "line-width": ["case", ["get", "front"], 6, 3], "line-opacity": ["case", ["get", "front"], 1, 0.55] } });
  map.addLayer({
    id: "boxes",
    type: "fill-extrusion",
    source: "boxes",
    paint: {
      "fill-extrusion-color": ["case", ["get", "upper"], "#a9cbd6", "#e6dcc4"],
      "fill-extrusion-height": ["get", "h"],
      "fill-extrusion-base": ["get", "base"],
      "fill-extrusion-opacity": 0.62,
      "fill-extrusion-vertical-gradient": true,
    },
  });
}

function tiltTo(map: MapLike, ring: LonLat[], t: [number, number], auto: boolean) {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const bearing = bearingOf(t) - 28;
  const cam = map.cameraForBounds(ringBounds(ring), { padding: framePadding(), maxZoom: 19, bearing });
  map.stop();
  map.easeTo({ ...(cam ? { center: cam.center, zoom: Math.min(19.2, cam.zoom - 0.15) } : {}), pitch: 58, bearing, duration: reduce ? 0 : auto ? 2200 : 1300 });
}

export function LandMap() {
  const study = useLand((s) => s.study);
  const typeId = useLand((s) => s.typeId);
  const overrides = useLand((s) => s.overrides);
  const base = useLand((s) => s.base);
  const setBase = useLand((s) => s.setBase);
  const load = useLand((s) => s.load);
  const clear = useLand((s) => s.clear);
  const setError = useLand((s) => s.setError);
  const chooseFront = useLand((s) => s.chooseFront);

  const holder = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLike | null>(null);
  const markers = useRef<MarkerLike[]>([]);
  const loadedBox = useRef<[number, number, number, number] | null>(null);
  const parcelsAbort = useRef<AbortController | null>(null);
  const hoverId = useRef<string | number | null>(null);
  const tiltedFor = useRef<string | null>(null);

  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [zoomOk, setZoomOk] = useState(false);
  const [parcelsLoading, setParcelsLoading] = useState(false);
  const [hover, setHover] = useState<Hover>(null);
  const [view3d, setView3d] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const env = useMemo(() => (study ? studyEnvelope(study, typeId, overrides) : null), [study, typeId, overrides]);

  const select = useCallback(
    (parcel: Feature<ParcelProps>) => {
      const map = mapRef.current;
      const ring = parcel.geometry.type === "MultiPolygon" ? (parcel.geometry.coordinates as LonLat[][][])[0][0] : (parcel.geometry.coordinates as LonLat[][])[0];
      if (map && ring?.length) {
        map.fitBounds(ringBounds(ring), { padding: framePadding(), maxZoom: 19, duration: 900, pitch: 0, bearing: 0 });
        setView3d(false);
      }
      tiltedFor.current = null;
      load(parcel);
    },
    [load]
  );

  const selectAt = useCallback(
    async (p: LonLat) => {
      try {
        const parcel = await parcelAt(p);
        if (parcel) select(parcel);
        else setError("En ese punto no hay una parcela del catastro (puede ser calle o espacio público).");
      } catch {
        setError("El catastro de Córdoba no respondió. Probá de nuevo en unos segundos.");
      }
    },
    [select, setError]
  );

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
      const fcol = await parcelsInBBox(want, ctrl.signal);
      if (ctrl.signal.aborted) return;
      map.getSource("parcels")?.setData(fcol);
      loadedBox.current = want;
    } catch {
      /* sin conexión: queda lo que había */
    } finally {
      if (parcelsAbort.current === ctrl) setParcelsLoading(false);
    }
  }, []);

  /* ── crear el mapa ── */
  useEffect(() => {
    let cancelled = false;
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
              { id: "ign", type: "raster", source: "ign" },
              { id: "orto", type: "raster", source: "orto", paint: { "raster-saturation": -0.18, "raster-contrast": 0.06, "raster-brightness-max": 0.9, "raster-fade-duration": 250 } },
            ],
          },
          bounds: START_BOUNDS,
          maxPitch: 70,
          attributionControl: false,
          fadeDuration: 150,
        });
        mapRef.current = map;
        (window as unknown as { __mwLandMap?: MapLike }).__mwLandMap = map;
        map.on("load", () => {
          if (cancelled) return;
          addLayers(map);
          setStatus("ready");
          refreshParcels();
        });
        map.on("moveend", () => refreshParcels());
        map.on("zoom", () => setZoomOk(map.getZoom() >= PARCEL_ZOOM - 0.5));
        map.on("pitchend", () => setView3d(map.getPitch() > 20));
        map.on("mousemove", "parcels-hit", (e: MapMouseEvent) => {
          const f = e.features?.[0];
          if (!f || f.id === undefined) return;
          if (hoverId.current !== null && hoverId.current !== f.id) map.setFeatureState({ source: "parcels", id: hoverId.current }, { hover: false });
          hoverId.current = f.id;
          map.setFeatureState({ source: "parcels", id: f.id }, { hover: true });
          map.getCanvas().style.cursor = "pointer";
          const p = f.properties as ParcelProps;
          const area = (Number(p.Superficie_Tierra_Urbana) || 0) + (Number(p.Superficie_Tierra_Rural) || 0);
          setHover({ x: e.point.x, y: e.point.y, title: String(p.desig_oficial || "Parcela").trim() || "Parcela", detail: `${area ? m2(area) : ""}${area ? " · " : ""}${estadoText(String(p.Estado ?? ""))}` });
        });
        map.on("mouseleave", "parcels-hit", () => {
          if (hoverId.current !== null) map.setFeatureState({ source: "parcels", id: hoverId.current }, { hover: false });
          hoverId.current = null;
          map.getCanvas().style.cursor = "";
          setHover(null);
        });
        map.on("click", "parcels-hit", (e: MapMouseEvent) => selectAt([e.lngLat.lng, e.lngLat.lat]));
      })
      .catch(() => !cancelled && setStatus("error"));
    return () => {
      cancelled = true;
      parcelsAbort.current?.abort();
      markers.current.forEach((m) => m.remove());
      markers.current = [];
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [refreshParcels, selectAt]);

  /* ── fondo ── */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || status !== "ready") return;
    map.setLayoutProperty("orto", "visibility", base === "photo" ? "visible" : "none");
  }, [base, status]);

  /* ── dibujar el lote y la caja ── */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || status !== "ready") return;
    markers.current.forEach((m) => m.remove());
    markers.current = [];
    if (!study) {
      for (const id of ["lot", "mask", "streets", "ground", "center", "boxes"]) map.getSource(id)?.setData(EMPTY);
      return;
    }
    const o = lotOverlays(study);
    map.getSource("lot")?.setData(o.lot);
    map.getSource("mask")?.setData(o.mask);
    map.getSource("streets")?.setData(o.lines);
    if (env && study.status === "ok") {
      const e = envelopeOverlays(study, env.envelope);
      map.getSource("ground")?.setData(e.ground);
      map.getSource("center")?.setData(e.center);
      map.getSource("boxes")?.setData(e.boxes);
    } else for (const id of ["ground", "center", "boxes"]) map.getSource(id)?.setData(EMPTY);

    // Rótulos de los lados a la calle: el frente, y los otros se pueden elegir como frente.
    const ml = window.maplibregl;
    if (!ml) return;
    const a = study.analysis;
    const frontSide = a.sides.find((s) => s.edges.includes(a.frontEdge));
    for (const side of a.sides) {
      const isFront = side === frontSide;
      const p = a.ringLonLat[side.edges[0]];
      const q = a.ringLonLat[(side.edges[side.edges.length - 1] + 1) % a.ringLonLat.length];
      const el = document.createElement("button");
      el.type = "button";
      el.className = `gp-map__edge ${isFront ? "is-front" : ""}`;
      el.innerHTML = isFront ? `<b>Frente</b><span>${m1(side.length)}</span>` : `<span>${m1(side.length)}</span><em>Usar como frente</em>`;
      el.title = isFront ? "Lado del lote que se toma como frente" : "Tomar este lado como frente del lote";
      if (!isFront)
        el.addEventListener("click", (ev) => {
          ev.stopPropagation();
          chooseFront(side.edges[0]);
        });
      markers.current.push(new ml.Marker({ element: el, anchor: "center" }).setLngLat([(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]).addTo(map));
    }
  }, [study, env, status, chooseFront]);

  /* ── vista 3D: un solo movimiento cuando termina de cargar la normativa ── */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !study || study.status !== "ok") return;
    const key = String(study.parcel.properties.Nomenclatura ?? study.analysis.ringLonLat[0].join());
    if (tiltedFor.current === key) return;
    tiltedFor.current = key;
    tiltTo(map, study.analysis.ringLonLat, study.analysis.axes.t, true);
  }, [study]);

  const toggle3d = () => {
    const map = mapRef.current;
    if (!map) return;
    if (view3d) {
      const cam = study ? map.cameraForBounds(ringBounds(study.analysis.ringLonLat), { padding: framePadding(), maxZoom: 19 }) : undefined;
      map.easeTo({ pitch: 0, bearing: 0, duration: 900, ...(cam ? { center: cam.center, zoom: cam.zoom } : {}) });
    } else if (study) tiltTo(map, study.analysis.ringLonLat, study.analysis.axes.t, false);
    else map.easeTo({ pitch: 55, bearing: -20, duration: 1200 });
  };

  /* ── búsqueda ── */
  const choose = (r: SearchResult) => {
    setResults(null);
    if (r.parcel) return select(r.parcel);
    mapRef.current?.flyTo({ center: r.center, zoom: 17.5, pitch: 0, bearing: 0, duration: 1200 });
    selectAt(r.center);
  };
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

  return (
    <div className="gp-map ld-map">
      <div ref={holder} className="gp-map__canvas" />

      <div className={`gp-map__finder ${study ? "has-lot" : ""}`}>
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
      </div>

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
      {status === "ready" && !zoomOk && !study && <div className="gp-map__hint">Acercá el mapa o buscá una dirección para ver los lotes</div>}
      {status === "ready" && zoomOk && parcelsLoading && (
        <div className="gp-map__hint is-quiet">
          <LoaderCircle className="gp-spin" aria-hidden /> Cargando lotes del catastro…
        </div>
      )}
      {hover && !study && (
        <div className="gp-map__tip" style={{ left: hover.x, top: hover.y }}>
          <strong>{hover.title}</strong>
          <span>{hover.detail}</span>
        </div>
      )}

      <div className="gp-map__tools">
        <div className="gp-map__bases ld-bases" role="radiogroup" aria-label="Fondo del mapa">
          <button type="button" role="radio" aria-checked={base === "photo"} className={base === "photo" ? "is-on" : ""} onClick={() => setBase("photo")}>
            <Layers aria-hidden /> Foto aérea
          </button>
          <button type="button" role="radio" aria-checked={base === "map"} className={base === "map" ? "is-on" : ""} onClick={() => setBase("map")}>
            <MapIcon aria-hidden /> Mapa
          </button>
        </div>
        <button type="button" onClick={toggle3d} className={view3d ? "is-on" : ""} aria-pressed={view3d} title="Inclinar el mapa para ver la caja en 3D">
          <Box aria-hidden /> {view3d ? "Vista en planta" : "Ver en 3D"}
        </button>
        {study && (
          <>
            <button type="button" onClick={() => mapRef.current?.fitBounds(ringBounds(study.analysis.ringLonLat), { padding: framePadding(), maxZoom: 19, duration: 800, pitch: 0, bearing: 0 })} title="Centrar el lote" aria-label="Centrar el lote">
              <Crosshair aria-hidden /> <span className="gp-map__label">Centrar lote</span>
            </button>
            <button type="button" onClick={clear} title="Elegir otro lote">
              <X aria-hidden /> <span className="gp-map__label">Otro lote</span>
            </button>
          </>
        )}
      </div>
      <p className="gp-map__attribution">{ATTRIBUTION}</p>
    </div>
  );
}
