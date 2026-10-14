/**
 * Geometría de parcelas reales (catastro) para el configurador de galpones.
 *
 * Trabaja en metros sobre un plano local centrado en la parcela (a la escala
 * de un lote, el error de aplanar la Tierra es menor a 1 cm).
 *
 * Marco del lote (igual que el 3D del galpón):
 *   - eje "s": a lo largo del frente, de oeste (s0) a este;
 *   - eje "t": hacia adentro del lote, desde la línea municipal.
 *   "Oeste" es el lado derecho mirando el lote desde la calle (como en el 3D).
 */

export type LonLat = [number, number];
export type XY = [number, number];

/* ─────────────────────────── proyección local ─────────────────────────── */

export type LocalFrame = { lon0: number; lat0: number; mx: number; my: number };

/** Metros por grado de longitud y latitud a una latitud dada (elipsoide WGS84). */
export function metersPerDegree(lat: number) {
  const p = (lat * Math.PI) / 180;
  return {
    mx: 111412.84 * Math.cos(p) - 93.5 * Math.cos(3 * p) + 0.118 * Math.cos(5 * p),
    my: 111132.92 - 559.82 * Math.cos(2 * p) + 1.175 * Math.cos(4 * p) - 0.0023 * Math.cos(6 * p),
  };
}

export function localFrame(center: LonLat): LocalFrame {
  const { mx, my } = metersPerDegree(center[1]);
  return { lon0: center[0], lat0: center[1], mx, my };
}

export const toXY = (f: LocalFrame, [lon, lat]: LonLat): XY => [(lon - f.lon0) * f.mx, (lat - f.lat0) * f.my];
export const toLonLat = (f: LocalFrame, [x, y]: XY): LonLat => [f.lon0 + x / f.mx, f.lat0 + y / f.my];

/* ─────────────────────────── polígonos ─────────────────────────── */

export function ringArea(ring: XY[]) {
  let a = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
}

export function centroid(ring: XY[]): XY {
  let cx = 0;
  let cy = 0;
  let a = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    const k = x1 * y2 - x2 * y1;
    a += k;
    cx += (x1 + x2) * k;
    cy += (y1 + y2) * k;
  }
  if (Math.abs(a) < 1e-9) return ring.reduce<XY>((acc, p) => [acc[0] + p[0] / ring.length, acc[1] + p[1] / ring.length], [0, 0]);
  return [cx / (3 * a), cy / (3 * a)];
}

export function pointInRing([x, y]: XY, ring: XY[]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function distToSegment([px, py]: XY, [ax, ay]: XY, [bx, by]: XY) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

export function distToRing(p: XY, ring: XY[]) {
  let d = Infinity;
  for (let i = 0; i < ring.length; i += 1) d = Math.min(d, distToSegment(p, ring[i], ring[(i + 1) % ring.length]));
  return d;
}

/** Quita el punto repetido del cierre, vértices duplicados y puntos alineados. */
export function cleanRing(ring: XY[], tolerance = 0.05): XY[] {
  let pts = ring.slice();
  if (pts.length > 1 && Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) < 1e-6) pts.pop();
  pts = pts.filter((p, i) => i === 0 || Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) > 0.01);
  let changed = true;
  while (changed && pts.length > 3) {
    changed = false;
    for (let i = 0; i < pts.length; i += 1) {
      const a = pts[(i - 1 + pts.length) % pts.length];
      const b = pts[i];
      const c = pts[(i + 1) % pts.length];
      if (distToSegment(b, a, c) < tolerance) {
        pts.splice(i, 1);
        changed = true;
        break;
      }
    }
  }
  return pts;
}

/* ─────────────────────────── lados y frente ─────────────────────────── */

export type Edge = { index: number; a: XY; b: XY; length: number; dir: XY };

export function edgesOf(ring: XY[]): Edge[] {
  return ring.map((a, index) => {
    const b = ring[(index + 1) % ring.length];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    return { index, a, b, length, dir: [(b[0] - a[0]) / (length || 1), (b[1] - a[1]) / (length || 1)] as XY };
  });
}

/**
 * Lados que dan a la calle: los que caen sobre el borde de la manzana.
 * Sin manzana (zonas rurales), los que no tocan ninguna parcela vecina.
 */
export function streetEdges(ring: XY[], options: { block?: XY[] | null; neighbors?: XY[][]; tolerance?: number } = {}) {
  const tol = options.tolerance ?? 0.8;
  const edges = edgesOf(ring);
  const samples = (e: Edge) => [0.2, 0.5, 0.8].map((k) => [e.a[0] + (e.b[0] - e.a[0]) * k, e.a[1] + (e.b[1] - e.a[1]) * k] as XY);
  if (options.block && options.block.length >= 3) {
    const block = options.block;
    return edges.filter((e) => e.length > 0.5 && samples(e).every((p) => distToRing(p, block) < tol)).map((e) => e.index);
  }
  const neighbors = options.neighbors ?? [];
  return edges.filter((e) => e.length > 0.5 && !samples(e).some((p) => neighbors.some((n) => distToRing(p, n) < tol))).map((e) => e.index);
}

export type StreetSide = { edges: number[]; length: number; a: XY; b: XY; dir: XY };

/** Agrupa lados a la calle consecutivos y casi alineados (un frente puede tener quiebres). */
export function streetSides(ring: XY[], street: number[]): StreetSide[] {
  const edges = edgesOf(ring);
  const set = new Set(street);
  const sides: StreetSide[] = [];
  const used = new Set<number>();
  for (const i of street) {
    if (used.has(i)) continue;
    // retroceder hasta el inicio del tramo
    let start = i;
    for (let k = 0; k < ring.length; k += 1) {
      const prev = (start - 1 + ring.length) % ring.length;
      if (!set.has(prev) || used.has(prev) || prev === i) break;
      const d = edges[prev].dir;
      const c = edges[start].dir;
      if (d[0] * c[0] + d[1] * c[1] < Math.cos((25 * Math.PI) / 180)) break;
      start = prev;
    }
    const group = [start];
    used.add(start);
    let cur = start;
    for (let k = 0; k < ring.length; k += 1) {
      const next = (cur + 1) % ring.length;
      if (!set.has(next) || used.has(next)) break;
      const d = edges[cur].dir;
      const n = edges[next].dir;
      if (d[0] * n[0] + d[1] * n[1] < Math.cos((25 * Math.PI) / 180)) break;
      group.push(next);
      used.add(next);
      cur = next;
    }
    const a = edges[group[0]].a;
    const b = edges[group[group.length - 1]].b;
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    sides.push({ edges: group, length, a, b, dir: [(b[0] - a[0]) / (length || 1), (b[1] - a[1]) / (length || 1)] });
  }
  return sides.sort((p, q) => q.length - p.length);
}

/* ─────────────────────────── marco del lote ─────────────────────────── */

export type LotAxes = {
  /** Punto de la línea municipal desde donde se mide. */
  origin: XY;
  /** Eje a lo largo del frente, de oeste a este. */
  s: XY;
  /** Eje hacia adentro del lote. */
  t: XY;
};

/** Ejes del lote a partir del lado que se toma como frente. */
export function lotAxes(ring: XY[], front: { a: XY; b: XY }): LotAxes {
  const dx = front.b[0] - front.a[0];
  const dy = front.b[1] - front.a[1];
  const len = Math.hypot(dx, dy) || 1;
  const u: XY = [dx / len, dy / len];
  // "t" apunta hacia el interior del lote
  const c = centroid(ring);
  let t: XY = [-u[1], u[0]];
  if ((c[0] - front.a[0]) * t[0] + (c[1] - front.a[1]) * t[1] < 0) t = [u[1], -u[0]];
  // Oeste = derecha mirando el lote desde la calle; "s" va de oeste a este = izquierda de "t".
  const s: XY = [-t[1], t[0]];
  return { origin: front.a, s, t };
}

export const toLot = (ax: LotAxes, p: XY): XY => [(p[0] - ax.origin[0]) * ax.s[0] + (p[1] - ax.origin[1]) * ax.s[1], (p[0] - ax.origin[0]) * ax.t[0] + (p[1] - ax.origin[1]) * ax.t[1]];
export const fromLot = (ax: LotAxes, [s, t]: XY): XY => [ax.origin[0] + ax.s[0] * s + ax.t[0] * t, ax.origin[1] + ax.s[1] * s + ax.t[1] * t];

export type LotFit = {
  /** Ejes del rectángulo útil: origen en la esquina frente-oeste, "s" hacia el este, "t" hacia el fondo. */
  axes: LotAxes;
  width: number;
  depth: number;
  /** Superficie del rectángulo / superficie del lote (1 = lote rectangular). */
  coverage: number;
};

/** Rectángulo más grande alineado con los ejes, dentro de un polígono (grilla + histograma). */
function largestAxisRect(poly: XY[], cells = 420) {
  const xs = poly.map((p) => p[0]);
  const ys = poly.map((p) => p[1]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const spanX = Math.max(...xs) - minX;
  const spanY = Math.max(...ys) - minY;
  const step = Math.max(0.2, Math.max(spanX, spanY) / cells);
  const cols = Math.max(1, Math.ceil(spanX / step));
  const rows = Math.max(1, Math.ceil(spanY / step));
  const heights = new Array(cols).fill(0);
  let best = { area: 0, x0: 0, x1: 0, y0: 0, y1: 0 };
  // Celdas dentro del polígono, fila por fila (cruces con cada lado, como un escáner).
  for (let r = 0; r < rows; r += 1) {
    const y = minY + (r + 0.5) * step;
    const cuts: number[] = [];
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
      const [xi, yi] = poly[i];
      const [xj, yj] = poly[j];
      if (yi > y !== yj > y) cuts.push(((xj - xi) * (y - yi)) / (yj - yi) + xi);
    }
    cuts.sort((p, q) => p - q);
    const insideCol = new Array(cols).fill(false);
    for (let k = 0; k + 1 < cuts.length; k += 2) {
      const c0 = Math.ceil((cuts[k] - minX) / step - 0.5);
      const c1 = Math.floor((cuts[k + 1] - minX) / step - 0.5);
      for (let c = Math.max(0, c0); c <= Math.min(cols - 1, c1); c += 1) insideCol[c] = true;
    }
    for (let c = 0; c < cols; c += 1) heights[c] = insideCol[c] ? heights[c] + 1 : 0;
    const stack: number[] = [];
    for (let c = 0; c <= cols; c += 1) {
      const h = c < cols ? heights[c] : 0;
      while (stack.length && heights[stack[stack.length - 1]] >= h) {
        const top = stack.pop()!;
        const left = stack.length ? stack[stack.length - 1] + 1 : 0;
        const area = (c - left) * heights[top];
        if (area > best.area) best = { area, x0: left, x1: c, y0: r + 1 - heights[top], y1: r + 1 };
      }
      stack.push(c);
    }
  }
  // Se achica media celda por lado: el rectángulo queda siempre dentro del lote real.
  const x0 = minX + best.x0 * step + step / 2;
  const x1 = minX + best.x1 * step - step / 2;
  const y0 = minY + best.y0 * step + step / 2;
  const y1 = minY + best.y1 * step - step / 2;
  return { x0, x1, y0, y1, area: Math.max(0, x1 - x0) * Math.max(0, y1 - y0) };
}

/**
 * Rectángulo útil más grande dentro del lote: es el lote que usa el configurador,
 * así el galpón nunca queda fuera del lote real aunque el lote sea irregular.
 * Prueba la orientación del frente y la de cada lado largo del lote (hay lotes
 * en diagonal a la calle) y se queda con la de mayor superficie; a igualdad,
 * prefiere quedar paralelo al frente. El lado del rectángulo más cercano a la
 * calle pasa a ser su frente.
 */
export function fitRectangle(ring: XY[], frontAxes: LotAxes, front: { a: XY; b: XY }): LotFit {
  const lotArea = Math.abs(ringArea(ring));
  const dirs: XY[] = [frontAxes.s];
  for (const e of edgesOf(ring)) {
    if (e.length < 5) continue;
    // Descarta direcciones casi iguales (o a 90°) a una ya probada: dan el mismo rectángulo.
    const same = Math.cos((0.3 * Math.PI) / 180);
    if (dirs.some((d) => Math.abs(d[0] * e.dir[0] + d[1] * e.dir[1]) > same || Math.abs(d[0] * e.dir[1] - d[1] * e.dir[0]) > same)) continue;
    dirs.push(e.dir);
  }
  let best: { u: XY; v: XY; r: ReturnType<typeof largestAxisRect>; score: number } | null = null;
  for (const [i, u] of dirs.entries()) {
    const v: XY = [-u[1], u[0]];
    const poly = ring.map((p) => [p[0] * u[0] + p[1] * u[1], p[0] * v[0] + p[1] * v[1]] as XY);
    const r = largestAxisRect(poly);
    const score = r.area * (i === 0 ? 1.04 : 1);
    if (!best || score > best.score) best = { u, v, r, score };
  }
  const { u, v, r } = best!;
  const back = (a: number, b: number): XY => [a * u[0] + b * v[0], a * u[1] + b * v[1]];
  const corners = [back(r.x0, r.y0), back(r.x1, r.y0), back(r.x1, r.y1), back(r.x0, r.y1)];
  // Lado del rectángulo más cercano al frente del lote → frente del rectángulo.
  const fm: XY = [(front.a[0] + front.b[0]) / 2, (front.a[1] + front.b[1]) / 2];
  let side = 0;
  let dmin = Infinity;
  for (let k = 0; k < 4; k += 1) {
    const p = corners[k];
    const q = corners[(k + 1) % 4];
    const d = distToSegment(fm, p, q);
    if (d < dmin) {
      dmin = d;
      side = k;
    }
  }
  const p = corners[side];
  const q = corners[(side + 1) % 4];
  const width = Math.hypot(q[0] - p[0], q[1] - p[1]);
  const opposite = corners[(side + 2) % 4];
  const depth = distToSegment(opposite, p, q) || Math.hypot(opposite[0] - q[0], opposite[1] - q[1]);
  const axes = lotAxes(ring, { a: p, b: q });
  // origen en la esquina oeste (s mínimo) del frente del rectángulo
  const sp = (x: XY) => (x[0] - axes.origin[0]) * axes.s[0] + (x[1] - axes.origin[1]) * axes.s[1];
  const origin = sp(p) <= sp(q) ? p : q;
  return { axes: { origin, s: axes.s, t: axes.t }, width, depth, coverage: lotArea > 0 ? (width * depth) / lotArea : 0 };
}

/* ─────────────────────────── análisis completo ─────────────────────────── */

export type ParcelAnalysis = {
  frame: LocalFrame;
  ring: XY[];
  /** Contorno limpio en lon/lat (el que se guarda). */
  ringLonLat: LonLat[];
  area: number;
  edges: Edge[];
  streetEdges: number[];
  sides: StreetSide[];
  /** Lado (índice) tomado como frente. */
  frontEdge: number;
  axes: LotAxes;
  fit: LotFit;
  corner: "none" | "east" | "west";
};

/** Lado de calle al que pertenece un índice de lado. */
const sideOfEdge = (sides: StreetSide[], index: number) => sides.find((s) => s.edges.includes(index)) ?? null;

/**
 * Analiza una parcela: lados a la calle, frente, esquina y rectángulo útil.
 * `preferredFront` permite elegir otro frente (por ejemplo, el usuario tocó otro lado).
 */
export function analyzeParcel(ringLonLat: LonLat[], options: { block?: LonLat[] | null; neighbors?: LonLat[][]; preferredFront?: number | null; mainRoads?: LonLat[][] } = {}): ParcelAnalysis {
  const center = ringLonLat.reduce<LonLat>((acc, p) => [acc[0] + p[0] / ringLonLat.length, acc[1] + p[1] / ringLonLat.length], [0, 0]);
  const frame = localFrame(center);
  let ring = cleanRing(ringLonLat.map((p) => toXY(frame, p)));
  if (ringArea(ring) < 0) ring = ring.reverse(); // antihorario
  const edges = edgesOf(ring);
  const block = options.block ? options.block.map((p) => toXY(frame, p)) : null;
  const neighbors = (options.neighbors ?? []).map((n) => n.map((p) => toXY(frame, p)));
  let street = streetEdges(ring, { block, neighbors });
  if (!street.length) street = [edges.reduce((best, e) => (e.length > best.length ? e : best), edges[0]).index];
  const sides = streetSides(ring, street);

  // Frente: el que eligió el usuario; si no, el lado sobre una vía principal; si no, el más largo.
  let frontSide: StreetSide = sides[0];
  const preferred = options.preferredFront ?? null;
  if (preferred !== null) {
    frontSide = sideOfEdge(sides, preferred) ?? (edges[preferred] ? { edges: [preferred], length: edges[preferred].length, a: edges[preferred].a, b: edges[preferred].b, dir: edges[preferred].dir } : frontSide);
  } else if (options.mainRoads?.length && sides.length > 1) {
    const roads = options.mainRoads.map((r) => r.map((p) => toXY(frame, p)));
    const near = (side: StreetSide) => {
      const mid: XY = [(side.a[0] + side.b[0]) / 2, (side.a[1] + side.b[1]) / 2];
      return Math.min(...roads.map((r) => polylineDistance(mid, r)));
    };
    const ranked = sides.map((s) => ({ s, d: near(s) })).sort((p, q) => p.d - q.d);
    if (ranked[0].d < 45) frontSide = ranked[0].s;
  }

  const axes = lotAxes(ring, frontSide);
  const fit = fitRectangle(ring, axes, frontSide);

  // Esquina: otro lado a la calle casi perpendicular al frente, en uno de sus extremos.
  let corner: ParcelAnalysis["corner"] = "none";
  const mid = fit.width / 2;
  for (const side of sides) {
    if (side === frontSide) continue;
    const dot = Math.abs(side.dir[0] * axes.s[0] + side.dir[1] * axes.s[1]);
    if (dot > Math.cos((50 * Math.PI) / 180)) continue; // paralelo al frente (calle de atrás)
    const m = toLot(fit.axes, [(side.a[0] + side.b[0]) / 2, (side.a[1] + side.b[1]) / 2]);
    corner = m[0] > mid ? "east" : "west";
    break;
  }

  return {
    frame,
    ring,
    ringLonLat: ring.map((p) => toLonLat(frame, p)),
    area: Math.abs(ringArea(ring)),
    edges,
    streetEdges: street,
    sides,
    frontEdge: frontSide.edges[0],
    axes,
    fit,
    corner,
  };
}

function polylineDistance(p: XY, line: XY[]) {
  let d = Infinity;
  for (let i = 0; i < line.length - 1; i += 1) d = Math.min(d, distToSegment(p, line[i], line[i + 1]));
  return d;
}

/** Convierte un punto del lote del configurador (x desde el lindero oeste, z desde la línea municipal) a lon/lat. */
export function lotPointToLonLat(analysis: Pick<ParcelAnalysis, "frame" | "fit">, x: number, z: number): LonLat {
  return toLonLat(analysis.frame, fromLot(analysis.fit.axes, [x, z]));
}

/** Punto del lote del configurador (x desde el lindero oeste, z desde el frente) → lon/lat, usando el rectángulo guardado. */
export function fitPointToLonLat(fit: { origin: LonLat; s: XY; t: XY }, x: number, z: number): LonLat {
  const frame = localFrame(fit.origin);
  return toLonLat(frame, [fit.s[0] * x + fit.t[0] * z, fit.s[1] * x + fit.t[1] * z]);
}

/** Rumbo (grados desde el norte, sentido horario) de una dirección local (este, norte). */
export const bearingOf = ([e, n]: XY) => ((Math.atan2(e, n) * 180) / Math.PI + 360) % 360;
