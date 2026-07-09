import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://fichapro-online.vercel.app'),
  title: 'FichaPro CRM',
  description: 'CRM para consultoras controlarem clientes, vendas, estoque e vencimentos.',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/favicon.ico' },
      { url: '/favicon-16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' }
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }]
  },
  openGraph: {
    title: 'FichaPro CRM',
    description: 'Controle clientes, vendas, estoque e vencimentos em um só lugar.',
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'FichaPro CRM' }]
  },
  robots: { index: false, follow: false, nocache: true },
  referrer: 'no-referrer'
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover'
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="pt-BR">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover, interactive-widget=resizes-content" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function(){
                var meta = document.querySelector('meta[name="viewport"]');
                if(!meta){
                  meta = document.createElement('meta');
                  meta.setAttribute('name','viewport');
                  document.head.appendChild(meta);
                }
                meta.setAttribute('content','width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover, interactive-widget=resizes-content');
                document.documentElement.style.overflowX = 'hidden';
                var isRealMobile = (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) || (navigator.maxTouchPoints && navigator.maxTouchPoints > 0);
                if (isRealMobile && Math.min(screen.width || 0, window.innerWidth || 0) <= 900) {
                  document.documentElement.classList.add('mobile-real');
                }
              })();
            `
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
