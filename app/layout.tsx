import type { Metadata } from "next";
import "@/styles/organic.css";
import "./globals.css";

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
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
