import type { Metadata } from "next";
import { Geist, Geist_Mono, Instrument_Serif, JetBrains_Mono } from "next/font/google";
import "./globals.css";

import { Navbar1 } from "@/components/ui/navbar-1";
import { WalletProvider } from "@/components/wallet/provider";
import { activeNetwork, activeNetworkId } from "@/lib/stellar/networks";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: ["400"],
  style: ["normal", "italic"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Kaido",
  description:
    "Kaido — a market for every number. Draw what you think happens; settle on-chain. Built on Stellar.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const networkId = activeNetworkId();
  const { networkPassphrase } = activeNetwork();
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${instrumentSerif.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-[#0b0b0c] text-[#ece9e2]">
        <WalletProvider network={networkId} networkPassphrase={networkPassphrase}>
          <div className="absolute inset-x-0 top-0 z-30">
            <Navbar1 />
          </div>
          {children}
        </WalletProvider>
      </body>
    </html>
  );
}
