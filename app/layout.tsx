import type { Metadata } from "next";
import { Caprasimo, Figtree } from "next/font/google";
import "@/styles/organic.css";
import "./globals.css";

const caprasimo = Caprasimo({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-caprasimo",
  display: "swap",
});

const figtree = Figtree({
  weight: ["400", "600", "700"],
  subsets: ["latin"],
  variable: "--font-figtree",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Roux",
  description:
    "Your playlist, as a cookbook. Ingredients, steps, and timestamps from YouTube cooking videos.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${caprasimo.variable} ${figtree.variable}`}>
      <body>{children}</body>
    </html>
  );
}
