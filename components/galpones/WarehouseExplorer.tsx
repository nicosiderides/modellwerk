"use client";

import { useMemo, useState } from "react";
import { ChevronRight, Eye, EyeOff, Focus, Layers, MousePointerClick, ScanEye, X } from "lucide-react";
import { buildModelTree, categoriesOfTreeNode } from "@/core/product-engine/metadata";
import type { ModelTreeNode } from "@/core/product-engine/types";
import { staticCatalog } from "@/core/galpones/catalog";
import { TechnicalPanel } from "./TechnicalPanel";
import { definitionOf, useGalpones } from "./store";

/**
 * EXPLORE: árbol de modelo (aislar / ocultar por categoría), vista explotada
 * y ficha contextual del elemento seleccionado (metadata BIM).
 */

function TreeNode({ node, depth }: { node: ModelTreeNode; depth: number }) {
  const hidden = useGalpones((s) => s.viewer.hidden);
  const isolated = useGalpones((s) => s.viewer.isolated);
  const toggleHidden = useGalpones((s) => s.toggleHidden);
  const isolate = useGalpones((s) => s.isolate);
  const [open, setOpen] = useState(depth < 1);
  const categories = categoriesOfTreeNode(node);
  const isHidden = categories.every((c) => hidden.includes(c));
  const isIsolated = isolated?.id === node.id;
  const dimmed = Boolean(isolated) && !categories.some((c) => isolated!.categories.includes(c));
  return (
    <li className={`gp-tree__node ${dimmed || isHidden ? "is-dimmed" : ""}`}>
      <div className="gp-tree__row" style={{ paddingLeft: `${depth * 14 + 6}px` }}>
        {node.children.length > 0 ? (
          <button type="button" className={`gp-tree__caret ${open ? "is-open" : ""}`} onClick={() => setOpen(!open)} aria-label={open ? "Contraer" : "Expandir"}>
            <ChevronRight aria-hidden />
          </button>
        ) : (
          <span className="gp-tree__caret" />
        )}
        <span className="gp-tree__label">{node.label}</span>
        <span className="gp-tree__count">{node.count}</span>
        <button type="button" className={`gp-tree__action ${isIsolated ? "is-active" : ""}`} title={isIsolated ? "Quitar aislamiento" : "Aislar"} onClick={() => isolate(node.id, categories)}>
          <Focus aria-hidden />
        </button>
        <button type="button" className="gp-tree__action" title={isHidden ? "Mostrar" : "Ocultar"} onClick={() => toggleHidden(categories)}>
          {isHidden ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
        </button>
      </div>
      {open && node.children.length > 0 && (
        <ul>
          {node.children.map((child) => (
            <TreeNode key={child.id} node={child} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

function ElementPanel() {
  const selection = useGalpones((s) => s.selection);
  const select = useGalpones((s) => s.select);
  const isolate = useGalpones((s) => s.isolate);
  const toggleHidden = useGalpones((s) => s.toggleHidden);
  const source = useGalpones((s) => s.model.metadata?.model.source);
  if (!selection) return null;
  const e = selection.element;
  const content = staticCatalog.shared().categories[e.category];
  const params = Object.entries(e.parameters ?? {});
  const rows: [string, string | undefined][] = [
    ["Sistema", (e.parameters?.sistema as string | undefined) ?? e.family],
    ["Familia", e.family],
    ["Tipo", e.type],
    ["Material", e.material],
    ["Terminación", e.parameters?.terminacion as string | undefined],
    ["Nivel", e.level],
    ["Categoría BIM", e.bimCategory],
  ];
  return (
    <aside className="gp-panel gp-panel--element" aria-label="Elemento seleccionado">
      <div className="gp-panel__head">
        <div>
          <p className="gp-kicker">{content?.label ?? e.category}</p>
          <h2>{e.label ?? e.nodeName ?? e.elementId}</h2>
        </div>
        <button type="button" className="gp-ghost" onClick={() => select(null)} aria-label="Cerrar">
          <X aria-hidden />
        </button>
      </div>
      <div className="gp-panel__body">
        {content && <p className="gp-element__explain">{content.explanation}</p>}
        <dl className="gp-deflist">
          {rows
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          <div className="gp-deflist__id">
            <dt>BIM ID</dt>
            <dd>
              <code>{e.elementId}</code>
              {(source === "demo" || source === "procedural") && <em className="gp-chip">{source === "demo" ? "demo" : "paramétrico"}</em>}
            </dd>
          </div>
        </dl>
        {params.length > 0 && (
          <>
            <h3 className="gp-subhead">Parámetros</h3>
            <dl className="gp-deflist gp-deflist--params">
              {params
                .filter(([k]) => k !== "sistema" && k !== "terminacion")
                .map(([k, v]) => (
                  <div key={k}>
                    <dt>{k.replace(/_/g, " ")}</dt>
                    <dd>{String(v)}</dd>
                  </div>
                ))}
            </dl>
          </>
        )}
        <div className="gp-element__actions">
          <button type="button" className="gp-button" onClick={() => isolate(`cat/${e.category}`, [e.category])}>
            <Focus aria-hidden /> Aislar {content?.plural.toLowerCase() ?? "categoría"}
          </button>
          <button type="button" className="gp-button" onClick={() => { toggleHidden([e.category]); select(null); }}>
            <EyeOff aria-hidden /> Ocultar
          </button>
        </div>
      </div>
    </aside>
  );
}

export function WarehouseExplorer() {
  const definition = useGalpones((s) => definitionOf(s));
  const config = useGalpones((s) => s.warehouse.config);
  const index = useGalpones((s) => s.model.index);
  const viewer = useGalpones((s) => s.viewer);
  const showAll = useGalpones((s) => s.showAll);
  const setExplode = useGalpones((s) => s.setExplode);
  const panelOpen = useGalpones((s) => s.ui.panelOpen);
  const setPanelOpen = useGalpones((s) => s.setPanelOpen);
  const selection = useGalpones((s) => s.selection);
  const [tab, setTab] = useState<"model" | "data">("model");
  const shared = staticCatalog.shared();

  const tree = useMemo(() => {
    if (!index || !definition) return null;
    const labels = Object.fromEntries(Object.entries(shared.categories).map(([k, v]) => [k, v.plural]));
    return buildModelTree(definition.name, index, shared.groups, labels);
  }, [index, definition, shared]);

  if (!definition || !config) return null;
  const filtered = viewer.hidden.length > 0 || viewer.isolated;

  return (
    <>
      <aside className={`gp-panel gp-panel--tree ${panelOpen ? "is-open" : "is-collapsed"}`} aria-label="Modelo">
        <div className="gp-panel__head">
          <div>
            <p className="gp-kicker">Explorar / {definition.code}</p>
            <h2>Sistema constructivo</h2>
          </div>
          <button type="button" className="gp-ghost gp-show-mobile" onClick={() => setPanelOpen(!panelOpen)} aria-label="Contraer panel">
            {panelOpen ? <X aria-hidden /> : <Layers aria-hidden />}
          </button>
        </div>
        <div className="gp-tabs gp-tabs--two" role="tablist">
          <button type="button" role="tab" aria-selected={tab === "model"} className={tab === "model" ? "is-active" : ""} onClick={() => setTab("model")}>
            <span>01</span>Árbol
          </button>
          <button type="button" role="tab" aria-selected={tab === "data"} className={tab === "data" ? "is-active" : ""} onClick={() => setTab("data")}>
            <span>02</span>Datos técnicos
          </button>
        </div>
        <div className="gp-panel__body">
          {tab === "model" ? (
            <>
              <button type="button" className={`gp-explode ${viewer.explode ? "is-active" : ""}`} onClick={() => setExplode(!viewer.explode)}>
                <ScanEye aria-hidden />
                <span>
                  <b>{viewer.explode ? "Unir piezas" : "Vista explotada"}</b>
                  <small>Separa estructura, correas, cubierta y cerramientos</small>
                </span>
              </button>
              {tree ? (
                <ul className="gp-tree" aria-label="Árbol del modelo">
                  <TreeNode node={tree} depth={0} />
                </ul>
              ) : (
                <p className="gp-field__hint">Cargando estructura del modelo…</p>
              )}
              {filtered && (
                <button type="button" className="gp-link-button" onClick={showAll}>
                  <Eye aria-hidden /> Mostrar todo
                </button>
              )}
              {!selection && (
                <p className="gp-hint">
                  <MousePointerClick aria-hidden /> Tocá cualquier pieza del modelo para ver su ficha BIM.
                </p>
              )}
            </>
          ) : (
            <TechnicalPanel config={config} definition={definition} compact />
          )}
        </div>
      </aside>
      <ElementPanel />
    </>
  );
}
