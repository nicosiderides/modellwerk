"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { LoadingProgress } from "../loading/LoadingProgress";
import { LogoAssembly } from "../loading/LogoAssembly";

type ModellwerkLoaderProps = {
  variant: "boot" | "assets";
  active?: boolean;
  item?: string;
  loaded?: number;
  progress?: number;
  total?: number;
  hasError?: boolean;
  onExitStart?: () => void;
};

const INTRO_PREFERENCE_KEY = "modellwerk:skip-intro:v3";
const INTRO_MINIMUM_MS = 2800;
const READY_PAUSE_MS = 420;
const EXIT_DURATION_MS = 880;
const ENTER_OPTION_DELAY_MS = 5600;

function getLoaderMessage(progress: number, item: string, complete: boolean) {
  if (complete) return "Sistema listo";
  if (progress < 12) return "Inicializando entorno";
  if (item.includes("model") || item.includes(".glb") || progress < 45) {
    return "Cargando geometría";
  }
  if (item.includes("texture") || item.match(/\.(webp|png|jpe?g|ktx2)$/) || progress < 72) {
    return "Procesando materiales";
  }
  if (item.includes("hdr") || progress < 86) return "Configurando iluminación";
  if (progress < 96) return "Preparando estaciones";
  return "Sincronizando interfaz";
}

export default function ModellwerkLoader({
  variant,
  active = true,
  item = "",
  loaded = 0,
  progress = 0,
  total = 0,
  hasError = false,
  onExitStart,
}: ModellwerkLoaderProps) {
  const [skipIntro, setSkipIntro] = useState(false);
  const [closing, setClosing] = useState(false);
  const [visible, setVisible] = useState(true);
  const [enterOptionAvailable, setEnterOptionAvailable] = useState(false);
  const mountedAtRef = useRef<number>(0);
  const exitStartedRef = useRef(false);
  const measured = variant === "assets" && total > 0;
  const normalizedProgress = measured ? Math.min(100, Math.max(0, progress)) : 0;
  const complete = measured && !active && !hasError && normalizedProgress >= 99.5;
  const loaderMessage = getLoaderMessage(normalizedProgress, item.toLowerCase(), complete);

  useEffect(() => {
    mountedAtRef.current = performance.now();
    let preferenceTimer: number | null = null;
    try {
      const storedPreference = window.localStorage.getItem(INTRO_PREFERENCE_KEY) === "1";
      preferenceTimer = window.setTimeout(() => setSkipIntro(storedPreference), 0);
    } catch {
      // Storage can be unavailable in strict privacy modes; the intro still works.
    }

    return () => {
      if (preferenceTimer !== null) window.clearTimeout(preferenceTimer);
    };
  }, []);

  useEffect(() => {
    if (variant !== "assets" || complete || hasError) return;
    const timer = window.setTimeout(() => setEnterOptionAvailable(true), ENTER_OPTION_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [complete, hasError, variant]);

  useEffect(() => {
    if (variant !== "assets" || !complete || hasError || exitStartedRef.current) return;

    const elapsed = performance.now() - mountedAtRef.current;
    const remainingIntro = skipIntro ? 0 : Math.max(0, INTRO_MINIMUM_MS - elapsed);
    const timer = window.setTimeout(() => {
      if (exitStartedRef.current) return;
      exitStartedRef.current = true;
      setClosing(true);
      onExitStart?.();
    }, Math.max(READY_PAUSE_MS, remainingIntro));

    return () => window.clearTimeout(timer);
  }, [complete, hasError, onExitStart, skipIntro, variant]);

  useEffect(() => {
    if (!closing) return;
    const timer = window.setTimeout(() => setVisible(false), EXIT_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [closing]);

  if (!visible) return null;

  const handleSkipIntro = () => {
    setSkipIntro(true);
    try {
      window.localStorage.setItem(INTRO_PREFERENCE_KEY, "1");
    } catch {
      // Keep the preference in memory when localStorage is unavailable.
    }
  };

  const progressStyle = {
    "--loader-progress": `${normalizedProgress}%`,
  } as CSSProperties;

  if (hasError) {
    return (
      <div className="modellwerk-loader architectural-loader is-error" style={progressStyle} role="alert">
        <div className="loader-error-panel">
          <LogoAssembly ready={false} />
          <div className="loader-error-copy">
            <strong>No se pudo inicializar el entorno</strong>
            <span>Revisá la conexión o intentá cargar nuevamente.</span>
          </div>
          <button type="button" onClick={() => window.location.reload()}>
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`modellwerk-loader architectural-loader ${variant === "boot" ? "is-booting" : ""} ${
        skipIntro ? "is-condensed" : ""
      } ${complete ? "is-ready" : ""} ${closing ? "is-closing" : ""}`}
      style={progressStyle}
      aria-busy={!complete}
    >
      <div className="loader-architectural-stage">
        <LogoAssembly ready={complete} />
        <LoadingProgress
          loaded={loaded}
          measured={measured}
          progress={normalizedProgress}
          status={variant === "boot" ? "Inicializando entorno" : loaderMessage}
          total={total}
        />
      </div>

      {variant === "assets" && !skipIntro && enterOptionAvailable && normalizedProgress >= 72 && (
        <button className="loader-skip" type="button" onClick={handleSkipIntro}>
          Entrar al visor
        </button>
      )}
    </div>
  );
}
