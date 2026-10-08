"use client";

import { useSyncExternalStore } from "react";
import { ArrowRight, Box, FolderOpen } from "lucide-react";
import { assetPath } from "@/components/environment/utils/assetPath";
import { staticCatalog } from "@/core/galpones/catalog";
import { readSaved } from "@/core/galpones/storage";
import type { WarehouseDefinition } from "@/core/galpones/types";
import { useGalpones } from "./store";

function subscribeStorage(callback: () => void) {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

function readSavedCount() {
  try {
    return readSaved(window.localStorage).length;
  } catch {
    return 0;
  }
}

function range(r: { min: number; max: number }, unit = "m") {
  return `${r.min}–${r.max} ${unit}`;
}

function Meter({ value, max, label }: { value: number; max: number; label: string }) {
  return (
    <span className="gp-meter" aria-label={label}>
      {Array.from({ length: max }, (_, i) => (
        <i key={i} className={i < value ? "is-on" : ""} />
      ))}
    </span>
  );
}

function Card({ definition, index }: { definition: WarehouseDefinition; index: number }) {
  const openWarehouse = useGalpones((s) => s.openWarehouse);
  const system = definition.structure.systems.find((s) => s.id === definition.structure.default);
  const bim = definition.model.strategy === "discreteVariant";
  return (
    <article className="gp-card" style={{ animationDelay: `${index * 70}ms` }}>
      <button type="button" className="gp-card__hit" onClick={() => openWarehouse(definition.id)} aria-label={`Explorar ${definition.name}`}>
        <div className="gp-card__media">
          <img src={assetPath(definition.thumbnail)} alt="" loading="lazy" />
          <span className="gp-card__code">{definition.code}</span>
          {bim && (
            <span className="gp-card__tag">
              <Box aria-hidden /> Modelo BIM · GLB
            </span>
          )}
          <span className="gp-card__cta">
            Explorar <ArrowRight aria-hidden />
          </span>
        </div>
        <div className="gp-card__body">
          <p className="gp-kicker">{definition.structuralSystemLabel}</p>
          <h2>{definition.name}</h2>
          <p className="gp-card__tagline">{definition.tagline}</p>
          <dl className="gp-card__specs">
            <div>
              <dt>Luz</dt>
              <dd>{range(definition.dimensions.width)}</dd>
            </div>
            <div>
              <dt>Altura</dt>
              <dd>{range(definition.dimensions.eaveHeight)}</dd>
            </div>
            <div>
              <dt>Uso</dt>
              <dd>{definition.use}</dd>
            </div>
            <div>
              <dt>Sistema</dt>
              <dd>{system?.name ?? definition.structuralSystemLabel}</dd>
            </div>
            <div>
              <dt>Aislación</dt>
              <dd>
                <Meter value={definition.insulationLevel.score} max={3} label={`Aislación ${definition.insulationLevel.label}`} /> {definition.insulationLevel.label}
              </dd>
            </div>
            <div>
              <dt>Precio</dt>
              <dd className="gp-price">
                <b>{"$".repeat(definition.relativePrice)}</b>
                <span>{"$".repeat(4 - definition.relativePrice)}</span>
              </dd>
            </div>
          </dl>
        </div>
      </button>
    </article>
  );
}

export function WarehouseCatalog() {
  const definitions = staticCatalog.list();
  const setModal = useGalpones((s) => s.setModal);
  const savedCount = useSyncExternalStore(subscribeStorage, readSavedCount, () => 0);

  return (
    <main className="gp-catalog">
      <section className="gp-catalog__intro">
        <p className="gp-kicker">Catálogo técnico interactivo / {String(definitions.length).padStart(2, "0")} sistemas</p>
        <h1>
          Naves industriales,
          <br />
          <em>explicadas en 3D.</em>
        </h1>
        <p className="gp-catalog__lead">
          Elegí una tipología, recorrela por dentro, cambiá medidas, estructura y envolvente, y llevate una ficha técnica lista para pedir presupuesto.
        </p>
        <ol className="gp-catalog__flow" aria-label="Recorrido">
          <li><span>01</span>Elegí</li>
          <li><span>02</span>Configurá</li>
          <li><span>03</span>Explorá</li>
          <li><span>04</span>Cotizá</li>
        </ol>
        {savedCount > 0 && (
          <button type="button" className="gp-link-button" onClick={() => setModal("saved")}>
            <FolderOpen aria-hidden /> Abrir {savedCount === 1 ? "una configuración guardada" : `${savedCount} configuraciones guardadas`}
          </button>
        )}
      </section>
      <section className="gp-catalog__grid" aria-label="Tipologías">
        {definitions.map((definition, index) => (
          <Card key={definition.id} definition={definition} index={index} />
        ))}
      </section>
      <footer className="gp-catalog__foot">
        <span>Datos demostrativos. Dimensiones de perfiles y fundaciones a definir por ingeniería.</span>
        <span>MW Product Engine · BIM model + metadata + configuration + visualization + commercial data</span>
      </footer>
    </main>
  );
}
