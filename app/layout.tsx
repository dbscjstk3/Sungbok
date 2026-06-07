import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sungbok",
  description: "sungbok",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
