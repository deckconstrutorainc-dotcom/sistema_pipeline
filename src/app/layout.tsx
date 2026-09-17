import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";

import { ThemeScript } from "@/components/layout/theme-script";

import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: {
    default: "Koryn Task",
    template: "%s | Koryn Task",
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
    // `suppressHydrationWarning`: o ThemeScript altera a classe do <html>
    // antes da hidratação, então o React encontra um valor diferente do que
    // renderizou no servidor. É esperado e restrito a este elemento.
    <html lang="pt-BR" className={inter.variable} suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body className="min-h-screen font-sans antialiased">{children}</body>
    </html>
  );
}
