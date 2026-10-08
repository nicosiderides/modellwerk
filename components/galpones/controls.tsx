"use client";

import { useState, type ReactNode } from "react";
import { Check, Lock, Minus, Plus } from "lucide-react";
import { formatNumber } from "@/core/galpones/metrics";

/** Controles de formulario compartidos (estilo técnico MW). */

export function NumberField({
  label,
  value,
  min,
  max,
  step,
  unit,
  decimals = 1,
  locked,
  hint,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  decimals?: number;
  locked?: boolean;
  hint?: string;
  onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? formatNumber(value, decimals);
  const commit = () => {
    if (draft === null) return;
    const parsed = Number(draft.replace(/\./g, "").replace(",", "."));
    if (Number.isFinite(parsed)) onChange(parsed);
    setDraft(null);
  };
  return (
    <div className={`gp-field ${locked ? "is-locked" : ""}`}>
      <div className="gp-field__head">
        <label className="gp-label">{label}</label>
        {locked && (
          <span className="gp-field__lock" title="Definido por el modelo BIM">
            <Lock aria-hidden /> BIM
          </span>
        )}
      </div>
      <div className="gp-field__value">
        <button type="button" aria-label={`Restar ${label}`} disabled={locked || value <= min} onClick={() => onChange(value - step)}>
          <Minus aria-hidden />
        </button>
        <input
          inputMode="decimal"
          value={shown}
          disabled={locked}
          aria-label={label}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") setDraft(null);
          }}
        />
        {unit && <span className="gp-field__unit">{unit}</span>}
        <button type="button" aria-label={`Sumar ${label}`} disabled={locked || value >= max} onClick={() => onChange(value + step)}>
          <Plus aria-hidden />
        </button>
      </div>
      {!locked && (
        <input
          className="gp-range"
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          aria-label={`${label} (deslizador)`}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{ ["--gp-fill" as string]: `${((value - min) / Math.max(1e-6, max - min)) * 100}%` }}
        />
      )}
      {hint && <p className="gp-field__hint">{hint}</p>}
    </div>
  );
}

export function Stepper({ label, value, max, onChange, hint }: { label: string; value: number; max: number; onChange: (v: number) => void; hint?: string }) {
  return (
    <div className="gp-stepper">
      <div>
        <span className="gp-stepper__label">{label}</span>
        {hint && <span className="gp-stepper__hint">{hint}</span>}
      </div>
      <div className="gp-stepper__control">
        <button type="button" aria-label={`Menos ${label}`} disabled={value <= 0} onClick={() => onChange(value - 1)}>
          <Minus aria-hidden />
        </button>
        <output aria-live="polite">{value}</output>
        <button type="button" aria-label={`Más ${label}`} disabled={value >= max} onClick={() => onChange(value + 1)}>
          <Plus aria-hidden />
        </button>
      </div>
    </div>
  );
}

export function ChoiceCard({
  selected,
  title,
  summary,
  onSelect,
  children,
  badge,
  disabled,
}: {
  selected: boolean;
  title: string;
  summary?: string;
  onSelect: () => void;
  children?: ReactNode;
  badge?: string;
  disabled?: boolean;
}) {
  return (
    <button type="button" className={`gp-choice ${selected ? "is-selected" : ""}`} aria-pressed={selected} onClick={onSelect} disabled={disabled}>
      <span className="gp-choice__check" aria-hidden>
        {selected && <Check />}
      </span>
      <span className="gp-choice__text">
        <span className="gp-choice__title">
          {title}
          {badge && <em>{badge}</em>}
        </span>
        {summary && <span className="gp-choice__summary">{summary}</span>}
        {children}
      </span>
    </button>
  );
}

export function Swatches({ label, colors, value, onChange }: { label: string; colors: { id: string; name: string; hex: string }[]; value: string; onChange: (id: string) => void }) {
  const current = colors.find((c) => c.id === value);
  return (
    <div className="gp-swatches">
      <div className="gp-field__head">
        <span className="gp-label">{label}</span>
        <span className="gp-swatches__name">{current?.name}</span>
      </div>
      <div className="gp-swatches__row" role="radiogroup" aria-label={label}>
        {colors.map((color) => (
          <button
            key={color.id}
            type="button"
            role="radio"
            aria-checked={color.id === value}
            title={color.name}
            className={color.id === value ? "is-selected" : ""}
            style={{ ["--gp-swatch" as string]: color.hex }}
            onClick={() => onChange(color.id)}
          />
        ))}
      </div>
    </div>
  );
}

export function Toggle({ label, summary, checked, disabled, note, onChange }: { label: string; summary?: string; checked: boolean; disabled?: boolean; note?: string; onChange: (on: boolean) => void }) {
  return (
    <label className={`gp-toggle ${disabled ? "is-disabled" : ""}`}>
      <span className="gp-toggle__text">
        <span className="gp-toggle__label">{label}</span>
        {summary && <span className="gp-toggle__summary">{summary}</span>}
        {note && <span className="gp-toggle__note">{note}</span>}
      </span>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="gp-toggle__track" aria-hidden />
    </label>
  );
}

/** Pequeño hook para recordar (por visitante) un panel colapsado. */
export function useRemembered(key: string, initial: boolean) {
  // Sólo se usa en paneles que se montan en el cliente (después de elegir una tipología).
  const [value, setValue] = useState(() => {
    try {
      const stored = window.localStorage.getItem(`mw-galpones:ui:${key}`);
      return stored === null ? initial : stored === "1";
    } catch {
      return initial;
    }
  });
  const update = (next: boolean) => {
    setValue(next);
    try {
      window.localStorage.setItem(`mw-galpones:ui:${key}`, next ? "1" : "0");
    } catch {
      /* sin almacenamiento */
    }
  };
  return [value, update] as const;
}
