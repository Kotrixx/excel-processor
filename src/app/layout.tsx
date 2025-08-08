import type { Metadata } from 'next';
import Navigation from './components/Navigation';
import './globals.css';

export const metadata: Metadata = {
  title: 'Excel Processor',
  description: 'Aplicación para procesar archivos Excel - Concatenar, Extraer únicos y Unir archivos',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>
        <div className="min-h-screen bg-gray-100">
          <Navigation />
          <main className="container mx-auto px-4 py-8">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}