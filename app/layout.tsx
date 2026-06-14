import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MAKEAWESOME RACE",
  description: "Eternal automatic daily ASCII race between generated names.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "MAKEAWESOME RACE",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#000000",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
