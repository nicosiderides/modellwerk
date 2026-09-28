import type { Metadata } from "next";
import AssemblyPlanner from "@/components/assembly/AssemblyPlanner";

export const metadata: Metadata = {
  title: "MW Assembly Planner — MODELLWERK",
  description: "Planificación de montaje modular: modelo, secuencia, grúa, logística y simulación 4D.",
};

export default function AssemblyPage() { return <AssemblyPlanner />; }
