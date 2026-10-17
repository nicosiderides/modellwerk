import type { Metadata } from "next";
import LandExperience from "@/components/land/LandExperience";
import "@/components/galpones/galpones.css";
import "@/components/land/land.css";

export const metadata: Metadata = {
  title: "MW Land — Qué podés construir en tu lote / MODELLWERK",
  description: "Prefactibilidad de lotes en Córdoba: normativa oficial, tipos de edificio permitidos y la caja máxima construible en 3D sobre el terreno real.",
};

export default function LandPage() {
  return <LandExperience />;
}
