import type { Metadata, Viewport } from "next"; // Am adăugat Viewport pentru culorile bării de sus
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://ronelashes.vercel.app";
const businessName = "RoneLashes - Holonec Ronela";
const businessDescription =
  "Extensii gene si servicii beauty in Arad, Str. Scoalei Nr. 33A. Programari rapide online, reminder WhatsApp si rezultate premium.";

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
  metadataBase: new URL(siteUrl),
  title: {
    default: businessName,
    template: "%s | RoneLashes Arad",
  },
  description: businessDescription,
  applicationName: "RoneLashes",
  keywords: [
    "extensii gene Arad",
    "gene Arad",
    "programare extensii gene Arad",
    "laminare gene Arad",
    "RoneLashes",
    "Holonec Ronela",
  ],
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "ro_RO",
    url: siteUrl,
    siteName: "RoneLashes",
    title: businessName,
    description: businessDescription,
  },
  twitter: {
    card: "summary",
    title: businessName,
    description: businessDescription,
  },
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
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@graph": [
                {
                  "@type": "BeautySalon",
                  "@id": `${siteUrl}/#business`,
                  name: "RoneLashes",
                  description: businessDescription,
                  url: siteUrl,
                  telephone: "+40743584475",
                  priceRange: "$$",
                  address: {
                    "@type": "PostalAddress",
                    streetAddress: "Str. Scoalei Nr. 33A",
                    addressLocality: "Arad",
                    addressCountry: "RO",
                  },
                  areaServed: "Arad",
                  sameAs: [
                    "https://instagram.com/lashes.by.rone",
                    "https://facebook.com/lashes.by.rone",
                  ],
                },
                {
                  "@type": "WebSite",
                  "@id": `${siteUrl}/#website`,
                  url: siteUrl,
                  name: "RoneLashes Arad",
                  inLanguage: "ro-RO",
                },
                {
                  "@type": "FAQPage",
                  "@id": `${siteUrl}/#faq`,
                  mainEntity: [
                    {
                      "@type": "Question",
                      name: "Cum ma programez la extensii gene in Arad?",
                      acceptedAnswer: {
                        "@type": "Answer",
                        text: "Te programezi direct din portalul online RoneLashes, selectezi serviciul, data si ora disponibile, apoi confirmi programarea.",
                      },
                    },
                    {
                      "@type": "Question",
                      name: "Unde este salonul RoneLashes in Arad?",
                      acceptedAnswer: {
                        "@type": "Answer",
                        text: "Salonul este in Arad, Strada Scoalei Nr. 33A.",
                      },
                    },
                    {
                      "@type": "Question",
                      name: "Primesc confirmare si remindere pentru programare?",
                      acceptedAnswer: {
                        "@type": "Answer",
                        text: "Da, dupa confirmare poti trimite mesajul de confirmare pe WhatsApp si primesti comunicari legate de programare.",
                      },
                    },
                  ],
                },
              ],
            }),
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}