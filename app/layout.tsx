import type { Metadata, Viewport } from "next";
import { assetPath } from "../components/environment/utils/assetPath";
import "../assets/mw-tokens.css";
import "./globals.css";
import "./modellwerk-premium.css";
import "../components/loading/loading.css";

export const metadata: Metadata = {
  title: "MODELLWERK / CONFIGURE — Visor 1.0",
  description:
    "Experiencia BIM interactiva desarrollada por MODELLWERK para explorar, comprender y configurar arquitectura directamente desde la web.",
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
