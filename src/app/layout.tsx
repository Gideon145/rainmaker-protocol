import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RAINMAKER PROTOCOL",
  description: "Autonomous B2B client acquisition agent — powered by Locus",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="star-grid scanlines min-h-screen">{children}</body>
    </html>
  );
}
