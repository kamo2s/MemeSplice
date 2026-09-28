import type { Metadata } from "next";
import "./globals.css";
import {SpliceWalletProvider} from '@/components/memesplice/wallet-provider';

export const metadata: Metadata = {
  title: "Splice — The Memecoin Genetics Lab",
  description: "Two parents. One offspring. A new meme. Explore the Splice genetics lab with interactive offspring creation and family trees.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon-dna.png",
    shortcut: "/favicon-dna.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased"><SpliceWalletProvider network={process.env.SOLANA_NETWORK==='mainnet-beta'?'mainnet-beta':'devnet'}>{children}</SpliceWalletProvider></body>
    </html>
  );
}
