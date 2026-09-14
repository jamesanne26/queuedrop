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
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>{children}<Suspense fallback={null}><GlobalSubmitLoading /></Suspense></body>
    </html>
  );
}
