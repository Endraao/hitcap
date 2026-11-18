import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { WalletProvider } from "@/components/WalletProvider";
import { Header } from "@/components/Header";
import { SITE_URL } from "@/lib/config";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "HitCap · memecoin prediction markets",
  description:
    "Bet YES or NO on where a memecoin's market cap lands. Markets open and resolve on their own, priced by the pm-AMM on Solana.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <WalletProvider>
          <Header />
          <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-16 pt-6">{children}</main>
          <footer className="border-t border-line px-4 py-6 text-center text-xs text-muted">
            Devnet demo · test money only · markets priced by the{" "}
            <a className="underline hover:text-text" href="https://predict-pm-amm.dev" target="_blank">
              pm-AMM
            </a>{" "}
            · prices from GeckoTerminal
          </footer>
        </WalletProvider>
      </body>
    </html>
  );
}
