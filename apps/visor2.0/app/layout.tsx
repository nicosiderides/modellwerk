import type { Metadata, Viewport } from "next";
import { assetPath } from "../components/environment/utils/assetPath";
import "../assets/mw-tokens.css";
import "./visor2.css";

export const metadata: Metadata = {
  title: "MODELLWERK / PROJECT — Visor 2.0",
  description:
    "Compositor interactivo MODELLWERK para crear edificios modulares, ordenar su implantación y definir la primera etapa del proyecto.",
  icons: {
    icon: {
      url: assetPath("/brand/favicon.svg?v=5"),
      type: "image/svg+xml",
    },
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
