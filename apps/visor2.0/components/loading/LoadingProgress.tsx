"use client";

type LoadingProgressProps = {
  loaded: number;
  measured: boolean;
  progress: number;
  status: string;
  total: number;
};

export function LoadingProgress({
  loaded,
  measured,
  progress,
  status,
  total,
}: LoadingProgressProps) {
  return (
    <div className="precision-progress">
      <div className="precision-progress-copy" aria-live="polite">
        <span>{status}</span>
        <strong>{measured ? `${Math.round(progress)}%` : "—"}</strong>
      </div>
      <div className={`precision-progress-track ${measured ? "" : "is-indeterminate"}`} aria-hidden="true">
        <span />
        <i />
      </div>
      <div className="precision-progress-meta" aria-hidden="true">
        <span>VISUALIZADOR DE ARQUITECTURA MODULAR</span>
        <em>{measured ? `${loaded} / ${total} RECURSOS` : "MODULE_SYSTEM.MW50"}</em>
      </div>
    </div>
  );
}
