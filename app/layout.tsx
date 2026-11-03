import type { Metadata, Viewport } from "next";
import { Suspense, type ReactNode } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { GlobalSubmitLoading } from "./_components/global-submit-loading";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: { default: "QueueDrop", template: "%s · QueueDrop" },
  description: "Web-based queue management for modern service businesses.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  // These are Supabase's *public* project URL and publishable/anon key only.
  // vinext can omit Vite/Next public env replacements in browser chunks even
  // when Workers has the values at runtime. React escapes the meta attributes.
  // Never expose the service-role key or other server-only secrets here.
  const browserSupabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const browserSupabaseKey = process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <head>
        <meta name="queuedrop-supabase-url" content={browserSupabaseUrl} />
        <meta name="queuedrop-supabase-publishable-key" content={browserSupabaseKey} />
      </head>
      <body>{children}<Suspense fallback={null}><GlobalSubmitLoading /></Suspense></body>
    </html>
  );
}
