import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Trackly | Delivery Tracker",
  description: "Track your delivery and view shipment details."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
