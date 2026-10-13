import type { Metadata } from 'next';
import { Cormorant_Garamond, DM_Sans } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/lib/auth';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';

// Serif display face for headings, clean sans for everything else. Served
// by next/font, so they're self-hosted at build time — no request to Google
// from the visitor's browser.
const display = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  style: ['normal', 'italic'],
  variable: '--font-display',
  display: 'swap',
});

const sans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'ZW Supplier Portal',
  description: 'Verified local suppliers for Zimbabwean mining companies',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable}`}>
      <body className="flex min-h-screen flex-col bg-paper font-sans text-ink antialiased">
        <AuthProvider>
          <Navbar />
          <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6 lg:py-14">
            {children}
          </main>
          <Footer />
        </AuthProvider>
      </body>
    </html>
  );
}
