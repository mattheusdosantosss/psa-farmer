import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PSA Farmer Dashboard",
  description: "Acompanhamento da operação dos farmers — PSA",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}