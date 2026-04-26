import type { Metadata, Viewport } from "next"; // Am adăugat Viewport pentru culorile bării de sus
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Configurarea metadatelor pentru PWA
export const metadata: Metadata = {
  title: "RoneLashes Admin",
  description: "Gestiune Programări RoneLashes",
  manifest: "/manifest.json", // Legătura către fișierul creat în public
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "RoneLashes",
  },
};

// Configurarea culorii temei pentru browser/telefon
export const viewport: Viewport = {
  themeColor: "#000000",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ro" // Am schimbat în română
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/* Aceste tag-uri ajută la experiența de aplicație nativă pe iPhone */}
        <link rel="apple-touch-icon" href="/icon-192x192.png" />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}