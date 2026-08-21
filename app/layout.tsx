import type { Metadata, Viewport } from "next";
import { assetPath } from "../components/environment/utils/assetPath";
import "./globals.css";
import "./modellwerk-premium.css";
import "../components/loading/loading.css";

export const metadata: Metadata = {
  title: "MODELLWERK — Configurador modular",
  description:
    "Configurador 3D industrial para diseñar módulos Modellwerk listos para fabricar.",
  icons: {
    icon: {
      url: assetPath("/brand/mw-isotype.svg"),
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
