import type { Metadata } from "next";
import { Geist, Geist_Mono, Instrument_Serif, JetBrains_Mono } from "next/font/google";
import "./globals.css";

import { Navbar1 } from "@/components/ui/navbar-1";
import { WalletProvider } from "@/components/wallet/provider";
import { deployedConfig } from "@/lib/stellar/contracts";
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
    "Kaido — permissionless distribution markets for any number. Trade beliefs; settle on-chain. Built on Stellar.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const networkId = activeNetworkId();
  const net = activeNetwork();
  let usdcSacId: string | null = null;
  try {
    usdcSacId =
      deployedConfig().external.usdcSacId ?? process.env.NEXT_PUBLIC_KAIDO_USDC_SAC ?? null;
  } catch {
    usdcSacId = process.env.NEXT_PUBLIC_KAIDO_USDC_SAC ?? null;
  }
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${instrumentSerif.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-[#0b0b0c] text-[#ece9e2]">
        <WalletProvider
          network={networkId}
          networkPassphrase={net.networkPassphrase}
          rpcUrl={net.rpcUrl}
          usdcSacId={usdcSacId}
        >
          <div className="absolute inset-x-0 top-0 z-30">
            <Navbar1 />
          </div>
          {children}
        </WalletProvider>
      </body>
    </html>
  );
}
