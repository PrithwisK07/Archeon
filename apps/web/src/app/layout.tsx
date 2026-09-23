import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
// @ts-ignore
import './global.css';

// Initialize the Inter font for metadata and secondary text
const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: 'Architecture Platform',
  description: 'AI-driven zero-dollar enterprise architecture generator',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <head>
        {/* 
          Placeholder for Canva Fatimi or equivalent custom font. 
          In a real production environment, you would load your custom font asset here. 
        */}
        <style dangerouslySetInnerHTML={{__html: `
          @font-face {
            font-family: 'Canva Fatimi';
            /* src: url('/fonts/CanvaFatimi.woff2') format('woff2'); */
            font-display: swap;
          }
        `}} />
      </head>
      <body className={`${inter.variable} bg-[#0A0A0A] text-white overflow-hidden antialiased`}>
        {children}
      </body>
    </html>
  );
}