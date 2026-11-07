import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Antigravity Hub | Maestro de Agentes & Skills',
  description: 'Arquitetura Neo-Tactile Porcelain & Obsidian Liquid Glass para orquestração de Agentes Markdown e integração Neon Database.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Outfit:wght@500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased selection:bg-cyan-500 selection:text-white">
        {children}
      </body>
    </html>
  );
}
