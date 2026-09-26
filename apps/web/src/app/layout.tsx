import type { Metadata } from 'next';
import { Space_Grotesk, JetBrains_Mono } from 'next/font/google';
// @ts-ignore
import './global.css';

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-space',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-jetbrains',
});

export const metadata: Metadata = {
  title: 'Nexus — Visual Schema Studio',
  description: 'Design schemas, routes and relationships on a live canvas — compiled straight into a production-ready API.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`dark ${spaceGrotesk.variable} ${jetbrainsMono.variable}`}>
      <body className="bg-[#0b0c10] text-[#e8e8ee] overflow-hidden antialiased selection:bg-[#e08a3c]/30">
        {children}
      </body>
    </html>
  );
}