import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "OpenReview Studio",
  description: "Open-source video review and Adobe collaboration platform"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
