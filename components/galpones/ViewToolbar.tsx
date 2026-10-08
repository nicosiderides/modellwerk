"use client";

import { Box, Expand, Eye, Maximize2, PersonStanding, ScanEye, Sparkles, SquareDashed, View } from "lucide-react";
import type { CameraPresetId } from "@/components/product-viewer/types";
import { useGalpones } from "./store";

const PRESETS: { id: CameraPresetId; label: string; icon: typeof Box }[] = [
  { id: "perspective", label: "Perspectiva", icon: Box },
  { id: "front", label: "Frente", icon: SquareDashed },
  { id: "side", label: "Lateral", icon: View },
  { id: "top", label: "Planta", icon: Expand },
  { id: "interior", label: "Interior", icon: Eye },
];

export function ViewToolbar() {
  const requestCamera = useGalpones((s) => s.requestCamera);
  const viewer = useGalpones((s) => s.viewer);
  const setExplode = useGalpones((s) => s.setExplode);
  const setScale = useGalpones((s) => s.setScaleReferences);
  const setQuality = useGalpones((s) => s.setQuality);
  const camera = viewer.camera;

  return (
    <div className="gp-toolbar" role="toolbar" aria-label="Vista">
      <div className="gp-toolbar__group">
        {PRESETS.map(({ id, label, icon: Icon }) => (
          <button key={id} type="button" className={camera.nonce > 0 && camera.preset === id ? "is-active" : ""} onClick={() => requestCamera(id)} title={label}>
            <Icon aria-hidden />
            <span>{label}</span>
          </button>
        ))}
        <button type="button" onClick={() => requestCamera("fit")} title="Encuadrar modelo">
          <Maximize2 aria-hidden />
          <span>Encuadrar</span>
        </button>
      </div>
      <div className="gp-toolbar__group">
        <button type="button" className={viewer.explode ? "is-active" : ""} onClick={() => setExplode(!viewer.explode)} title="Vista explotada">
          <ScanEye aria-hidden />
          <span>Explotar</span>
        </button>
        <button type="button" className={viewer.scaleReferences ? "is-active" : ""} onClick={() => setScale(!viewer.scaleReferences)} title="Referencias de escala">
          <PersonStanding aria-hidden />
          <span>Escala</span>
        </button>
        <button type="button" className={`gp-hide-mobile ${viewer.quality === "high" ? "is-active" : ""}`} onClick={() => setQuality(viewer.quality === "high" ? "balanced" : "high")} title="Calidad visual (oclusión ambiental)">
          <Sparkles aria-hidden />
          <span>{viewer.quality === "high" ? "Alta" : "Fluida"}</span>
        </button>
      </div>
    </div>
  );
}
