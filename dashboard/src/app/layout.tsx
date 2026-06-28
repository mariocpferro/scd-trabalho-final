import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'CityPulse — Dashboard',
  description: 'Monitoramento de cidade inteligente em tempo real',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body>
        <header className="topo">
          <h1>🏙 CityPulse</h1>
          <nav>
            <a href="/">Zonas</a>
            <a href="/replicacao">Replicação</a>
            <a href="/historico">Histórico</a>
            <a href="/alertas">Alertas</a>
            <a href="/limites">Limites</a>
          </nav>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
