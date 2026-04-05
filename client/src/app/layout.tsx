import type { Metadata, Viewport } from 'next';
import { Playfair_Display, Outfit } from 'next/font/google';
import './globals.css';
import { Providers } from '@/components/Providers';
import { Navbar } from '@/components/layout/Navbar';
import { CartSidebar } from '@/components/cart/CartSidebar';
import { ToastContainer } from '@/components/ui';

const playfair = Playfair_Display({
  subsets: ['latin'],
  variable: '--font-playfair',
  display: 'swap',
  weight: ['400', '600', '700'],
});

const outfit = Outfit({
  subsets: ['latin'],
  variable: '--font-outfit',
  display: 'swap',
  weight: ['300', '400', '500', '600', '700'],
});

export const metadata: Metadata = {
  title: { default: 'KAVOX — Premium Fashion & Custom T-Shirts', template: '%s | KAVOX' },
  description: 'Shop premium t-shirts, hoodies, and custom print-on-demand apparel. Design your own, wear your story.',
  keywords: ['t-shirts', 'custom tshirt', 'print on demand', 'kavox', 'premium fashion', 'hoodies'],
  authors: [{ name: 'KAVOX' }],
  creator: 'KAVOX',
  openGraph: {
    type: 'website',
    locale: 'en_IN',
    siteName: 'KAVOX',
    title: 'KAVOX — Premium Fashion & Custom T-Shirts',
    description: 'Shop premium t-shirts and design your own custom apparel.',
  },
  twitter: { card: 'summary_large_image', title: 'KAVOX', description: 'Premium Fashion & Custom T-Shirts' },
  robots: { index: true, follow: true },
  manifest: '/manifest.json',
};

export const viewport: Viewport = {
  themeColor: '#0A0A0A',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${playfair.variable} ${outfit.variable}`} suppressHydrationWarning>
      <body className="bg-kavox-cream text-kavox-charcoal font-body antialiased">
        <Providers>
          <Navbar />
          <CartSidebar />
          <ToastContainer />
          <main className="min-h-screen">{children}</main>
          <footer className="bg-kavox-charcoal text-white">
            <FooterContent />
          </footer>
        </Providers>
      </body>
    </html>
  );
}

function FooterContent() {
  const cols = [
    { title: 'Shop', links: [['T-Shirts', '/shop?category=T-Shirts'], ['Hoodies', '/shop?category=Hoodies'], ['Custom Design', '/design-studio'], ['New Arrivals', '/shop?sort=-createdAt'], ['Sale', '/shop?sort=-discountPercent']] },
    { title: 'Help', links: [['Size Guide', '/size-guide'], ['Shipping Info', '/shipping'], ['Returns', '/returns'], ['Track Order', '/track'], ['FAQ', '/faq']] },
    { title: 'Company', links: [['About Us', '/about'], ['Sustainability', '/sustainability'], ['Careers', '/careers'], ['Contact', '/contact']] },
  ];

  return (
    <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-10 py-16">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-12 mb-12">
        {/* Brand */}
        <div className="lg:col-span-2">
          <div className="font-display text-3xl font-bold text-white mb-4">KAVOX</div>
          <p className="text-kavox-silver text-sm leading-relaxed mb-6 max-w-xs font-light">
            Premium print-on-demand fashion. Design your own story, wear it with pride.
          </p>
          <div className="flex gap-3">
            {['𝕏', 'IG', 'FB', 'YT'].map(s => (
              <div key={s} className="w-9 h-9 rounded-full border border-white/10 flex items-center justify-center text-xs text-kavox-silver hover:border-kavox-accent hover:text-kavox-accent cursor-pointer transition-colors">{s}</div>
            ))}
          </div>
        </div>
        {/* Nav cols */}
        {cols.map(col => (
          <div key={col.title}>
            <h4 className="text-xs font-bold tracking-widest uppercase text-kavox-silver mb-5">{col.title}</h4>
            <ul className="space-y-3">
              {col.links.map(([label, href]) => (
                <li key={label}>
                  <a href={href} className="text-sm text-white/50 hover:text-kavox-accent transition-colors font-light">{label}</a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-white/10 pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
        <p className="text-xs text-white/30 font-light">© 2025 KAVOX. All rights reserved. Made with ♥ in India.</p>
        <div className="flex gap-2">
          {['Visa', 'Mastercard', 'UPI', 'Razorpay', 'COD'].map(p => (
            <span key={p} className="text-xs px-2.5 py-1 bg-white/5 border border-white/10 rounded text-white/40">{p}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
