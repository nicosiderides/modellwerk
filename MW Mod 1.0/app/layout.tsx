import type { Metadata } from 'next';
import { headers } from 'next/headers';
import './globals.css';
import './platform.css';
const pageMetadata: Metadata = {
  icons: { icon: '/favicon.svg' },
  title: 'MW Mod 1.0 — Modellwerk',
  description:
    'Tu sistema constructivo, listo para configurar, cotizar y comprender. Plataforma piloto de construcción industrializada.',
  robots: { index: false, follow: false },
  openGraph: {
    title: 'MW Mod 1.0 — Modellwerk',
    description: 'Tu construcción, conectada.',
    type: 'website',
    images: [
      {
        url: '/og.png',
        width: 1731,
        height: 909,
        alt: 'MW Mod 1.0 — Tu construcción, conectada.',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'MW Mod 1.0 — Modellwerk',
    description: 'Tu construcción, conectada.',
    images: ['/og.png'],
  },
};
export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get('host') || 'localhost:3100';
  const safeHost = /^[a-zA-Z0-9.-]+(?::\d{1,5})?$/.test(host)
    ? host
    : 'localhost:3100';
  const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(safeHost);
  return {
    ...pageMetadata,
    metadataBase: new URL(`${local ? 'http' : 'https'}://${safeHost}`),
  };
}
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es-AR">
      <body>{children}</body>
    </html>
  );
}
