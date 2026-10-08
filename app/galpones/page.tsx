import type { Metadata } from "next";
import GalponesExperience from "@/components/galpones/GalponesExperience";
import "@/components/galpones/galpones.css";

export const metadata: Metadata = {
  title: "MW Warehouse — Configurador de galpones / MODELLWERK",
  description: "Catálogo técnico interactivo de naves industriales: explorá en 3D, configurá medidas, estructura y envolvente, y pedí presupuesto.",
};

export default function GalponesPage() {
  return <GalponesExperience />;
}
