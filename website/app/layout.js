import { Inter, Plus_Jakarta_Sans } from 'next/font/google';
import { SITE_URL, asset } from '../lib/site';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-body', display: 'swap' });
const jakarta = Plus_Jakarta_Sans({ subsets: ['latin'], weight: ['600', '700', '800'], variable: '--font-display', display: 'swap' });

const title = 'Cursora: your cursor, reimagined';
const description = 'Animations that follow your pointer, custom Windows cursors and pixel-perfect crosshairs, in one lightweight tray app for Windows 10 and 11.';

export const metadata = {
  metadataBase: new URL(`${SITE_URL}/`),
  title,
  description,
  applicationName: 'Cursora',
  keywords: ['Cursora', 'cursor', 'crosshair overlay', 'custom cursors', 'Windows', 'desktop animations'],
  icons: { icon: asset('generated/logo.svg'), apple: asset('generated/apple-touch-icon.png') },
  openGraph: {
    type: 'website',
    siteName: 'Cursora',
    title,
    description,
    url: './',
    images: [{ url: 'generated/social-preview.png', width: 1280, height: 640, alt: 'Cursora: your cursor, reimagined' }],
  },
  twitter: { card: 'summary_large_image', title, description, images: ['generated/social-preview.png'] },
};

export const viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#05070c' },
    { media: '(prefers-color-scheme: light)', color: '#f5f8fb' },
  ],
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${inter.variable} ${jakarta.variable}`}>
      <body>{children}</body>
    </html>
  );
}
