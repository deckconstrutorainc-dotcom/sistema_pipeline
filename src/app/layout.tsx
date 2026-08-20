import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";

import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: {
    default: "BTS Pipe",
    template: "%s | BTS Pipe",
  },
  description:
    "Plataforma independente de gestão de processos e workflows.",
};

// Next.js 15 App Router: viewport é um export separado de `metadata`.
// Necessário para que o layout responsivo (mobile-first) seja respeitado
// em dispositivos móveis — sem isso, navegadores mobile renderizam a
// página numa viewport virtual larga e aplicam zoom, ignorando `sm:`/`md:`.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className={inter.variable}>
      <body className="min-h-screen font-sans antialiased">{children}</body>
    </html>
  );
}
