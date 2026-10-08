"use client";

import { useState } from "react";
import { FolderOpen, Link, Save, Trash2 } from "lucide-react";
import { staticCatalog } from "@/core/galpones/catalog";
import { formatNumber } from "@/core/galpones/metrics";
import { configToShareCode, deleteSaved, deserializeConfig, readSaved, saveConfig, type SavedEntry } from "@/core/galpones/storage";
import { Modal } from "./Modal";
import { shareUrl } from "./WarehouseSummary";
import { definitionOf, useGalpones } from "./store";

const storage = () => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

export function SavedModal() {
  const config = useGalpones((s) => s.warehouse.config);
  const definition = useGalpones((s) => definitionOf(s));
  const replaceConfig = useGalpones((s) => s.replaceConfig);
  const setModal = useGalpones((s) => s.setModal);
  const toast = useGalpones((s) => s.toast);
  const [entries, setEntries] = useState<SavedEntry[]>(() => readSaved(storage()));
  const [name, setName] = useState("");

  const defaultName = definition && config ? `${definition.name} ${formatNumber(config.dimensions.width)}×${formatNumber(config.dimensions.length)}` : "";

  return (
    <Modal title="Guardar y abrir" kicker="Configuraciones en este navegador">
      {config && (
        <form
          className="gp-save"
          onSubmit={(e) => {
            e.preventDefault();
            setEntries(saveConfig(storage(), name.trim() || defaultName, config));
            setName("");
            toast("Configuración guardada");
          }}
        >
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={defaultName} aria-label="Nombre" />
          <button type="submit" className="gp-button gp-button--primary">
            <Save aria-hidden /> Guardar
          </button>
          <button
            type="button"
            className="gp-button"
            onClick={async () => {
              const url = shareUrl(configToShareCode(config));
              try {
                await navigator.clipboard.writeText(url);
                toast("Enlace copiado");
              } catch {
                window.prompt("Copiá este enlace", url);
              }
            }}
          >
            <Link aria-hidden /> Copiar enlace
          </button>
        </form>
      )}
      {entries.length === 0 ? (
        <p className="gp-empty">Todavía no hay configuraciones guardadas en este navegador.</p>
      ) : (
        <ul className="gp-saved">
          {entries.map((entry) => {
            const c = deserializeConfig(entry.config);
            const def = c ? staticCatalog.get(c.warehouse) : undefined;
            if (!c || !def) return null;
            return (
              <li key={entry.id}>
                <div>
                  <b>{entry.name}</b>
                  <span>
                    {def.name} · {formatNumber(c.dimensions.width)} × {formatNumber(c.dimensions.length)} m · {new Date(entry.config.savedAt).toLocaleDateString("es-AR")}
                  </span>
                </div>
                <button type="button" className="gp-button" onClick={() => { replaceConfig(c); setModal(null); }}>
                  <FolderOpen aria-hidden /> Abrir
                </button>
                <button type="button" className="gp-ghost" aria-label="Borrar" onClick={() => setEntries(deleteSaved(storage(), entry.id))}>
                  <Trash2 aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}
