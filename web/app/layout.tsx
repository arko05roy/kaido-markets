import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

import { SiteHeader } from "@/components/site-header";
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

export const metadata: Metadata = {
  title: "Kaido",
  description:
    "Permissionless distribution markets on Stellar. ChartGuessr-on-BTC is the wedge.",
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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <WalletProvider network={networkId} networkPassphrase={networkPassphrase}>
          <SiteHeader network={networkId} />
          {children}
        </WalletProvider>
      </body>
    </html>
  );
}
