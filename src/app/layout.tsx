import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Quorum",
  description: "Consensus-driven knowledge promotion for AI agent collectives",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-gray-950 text-gray-100 min-h-screen antialiased">
        <header className="border-b border-gray-800 px-6 py-4">
          <a href="/" className="text-xl font-bold text-white">
            Quorum
          </a>
        </header>
        <main className="max-w-3xl mx-auto px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
