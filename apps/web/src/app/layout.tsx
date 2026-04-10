import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Providers } from "./providers";
import "@/styles/globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: {
    default: "AutoLinked — AI LinkedIn Ghostwriter",
    template: "%s | AutoLinked",
  },
  description:
    "Your AI LinkedIn ghostwriter that sounds like you. Generate, review, and schedule LinkedIn posts with AI. Build your personal brand on autopilot.",
  keywords: [
    "LinkedIn",
    "AI",
    "ghostwriter",
    "content",
    "automation",
    "personal brand",
    "LinkedIn posts",
    "AI writing",
  ],
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
  },
  openGraph: {
    type: "website",
    siteName: "AutoLinked",
    title: "AutoLinked — AI LinkedIn Ghostwriter",
    description:
      "Your AI LinkedIn ghostwriter that sounds like you. Generate, review, and schedule LinkedIn posts with AI.",
    /* OG image placeholder — replace with an actual generated image at /og-image.png
       Recommended size: 1200x630px
       Content: AutoLinked logo on the left, tagline on the right,
       gradient background from brand-primary (#1570EF) to brand-secondary (#7C3AED) */
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "AutoLinked — Your AI LinkedIn ghostwriter that sounds like you",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "AutoLinked — AI LinkedIn Ghostwriter",
    description:
      "Your AI LinkedIn ghostwriter that sounds like you. Generate, review, and schedule LinkedIn posts with AI.",
    images: ["/og-image.png"],
  },
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? "https://autolinked.app",
  ),
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#1570EF" },
    { media: "(prefers-color-scheme: dark)", color: "#0B1120" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
