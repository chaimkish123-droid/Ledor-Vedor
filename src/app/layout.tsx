import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: "L'Dor VaDor — לדור ודור",
  description: 'Our family. Our stories. Our legacy.',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: "L'Dor VaDor", statusBarStyle: 'default' },
};

export const viewport: Viewport = {
  themeColor: '#faf8f4',
  width: 'device-width',
  initialScale: 1,
  // The canvas has its own zoom; the page itself should still be zoomable
  // for anyone who needs larger text.
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-ink focus:card-shadow"
        >
          Skip to main content
        </a>
        {children}
      </body>
    </html>
  );
}
