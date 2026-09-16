import type { Metadata } from "next";
import { Oswald } from "next/font/google";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import Sidebar from "@/components/Sidebar";
import "./globals.css";

/**
 * Oswald for display: condensed, stencil-adjacent, the voice of a tour
 * poster or a field manual cover. Used only for campaign names and headline
 * numbers -- restraint is what keeps it from looking like a games magazine.
 */
const oswald = Oswald({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-oswald",
  display: "swap",
});

export const metadata: Metadata = {
  title: "PSTATS",
  description: "Left 4 Dead 2 co-op campaign statistics",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body
        className={`${GeistSans.variable} ${GeistMono.variable} ${oswald.variable} min-h-screen antialiased`}
        style={{
          fontFamily: "var(--font-geist-sans)",
        }}
      >
        <style>{`
          :root {
            --font-display: var(--font-oswald), "Arial Narrow", sans-serif;
            --font-sans: var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif;
            --font-mono: var(--font-geist-mono), ui-monospace, monospace;
          }
        `}</style>
        <Sidebar />
        {/* The rail is fixed, so the content column is inset by its width
            from `lg` up and runs full-bleed below it, where the rail is
            off-canvas behind a menu button. */}
        <div className="lg:pl-[15.5rem]">{children}</div>
      </body>
    </html>
  );
}
