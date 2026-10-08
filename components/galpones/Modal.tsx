"use client";

import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import { useGalpones } from "./store";

export function Modal({ title, kicker, children, wide }: { title: string; kicker?: string; children: ReactNode; wide?: boolean }) {
  const setModal = useGalpones((s) => s.setModal);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setModal(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setModal]);
  return (
    <div className="gp-modal" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(e) => e.target === e.currentTarget && setModal(null)}>
      <div className={`gp-modal__card ${wide ? "is-wide" : ""}`}>
        <header className="gp-modal__head">
          <div>
            {kicker && <p className="gp-kicker">{kicker}</p>}
            <h2>{title}</h2>
          </div>
          <button type="button" className="gp-ghost" onClick={() => setModal(null)} aria-label="Cerrar">
            <X aria-hidden />
          </button>
        </header>
        <div className="gp-modal__body">{children}</div>
      </div>
    </div>
  );
}
