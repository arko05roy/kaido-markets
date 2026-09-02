"use client";

import * as React from "react";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { Menu, X } from "lucide-react";

import { NavbarWallet } from "@/components/wallet/navbar-wallet";

const NAV_ITEMS = [
  { label: "Markets", href: "/markets" },
  { label: "Create", href: "/create" },
  { label: "Leaderboard", href: "/leaderboard" },
  { label: "Whitepaper", href: "/whitepaper" },
];

const Navbar1 = () => {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();

  const toggleMenu = () => setIsOpen(!isOpen);

  return (
    <div className="flex justify-center w-full py-6 px-4">
      <div className="relative z-10 flex w-full max-w-3xl items-center justify-between rounded-full border border-black/5 bg-[#f3efe6] px-6 py-3 shadow-[0_10px_40px_-12px_rgba(0,0,0,0.55)]">
        {/* paper inner highlight */}
        <div className="pointer-events-none absolute inset-x-6 top-px h-px bg-gradient-to-r from-transparent via-black/10 to-transparent" />

        <Link href="/" className="group flex items-baseline gap-2">
          <motion.span
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, ease: [0.22, 0.61, 0.36, 1] }}
            className="font-serif italic text-2xl leading-none tracking-tight text-[#0b0b0c]"
          >
            Kaido
          </motion.span>
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.25 }}
            className="hidden whitespace-nowrap text-[10px] tracking-[0.18em] text-[#0b0b0c]/40 sm:inline"
          >
            街道
          </motion.span>
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-7">
          {NAV_ITEMS.map((item, i) => {
            const active =
              pathname === item.href || pathname?.startsWith(item.href + "/");
            return (
              <motion.div
                key={item.href}
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: 0.1 + i * 0.05 }}
                className="relative"
              >
                <Link
                  href={item.href}
                  className={`font-mono text-[11px] uppercase tracking-[0.22em] transition-colors ${
                    active
                      ? "text-[#0b0b0c]"
                      : "text-[#0b0b0c]/50 hover:text-[#0b0b0c]"
                  }`}
                >
                  {item.label}
                </Link>
                {active && (
                  <motion.span
                    layoutId="nav-dot"
                    className="absolute -bottom-2 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-[#c89a3a]"
                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                  />
                )}
              </motion.div>
            );
          })}
        </nav>

        {/* Desktop CTA — compact wallet trigger */}
        <motion.div
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, delay: 0.25 }}
          className="hidden md:flex items-center"
        >
          <NavbarWallet />
        </motion.div>

        {/* Mobile Menu Button */}
        <motion.button
          className="md:hidden flex items-center text-[#0b0b0c]"
          onClick={toggleMenu}
          whileTap={{ scale: 0.9 }}
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </motion.button>
      </div>

      {/* Mobile Menu Overlay */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="fixed inset-0 bg-[#f3efe6] z-50 pt-24 px-6 md:hidden text-[#0b0b0c]"
            initial={{ opacity: 0, x: "100%" }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
          >
            <motion.button
              className="absolute top-6 right-6 p-2"
              onClick={toggleMenu}
              whileTap={{ scale: 0.9 }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
              aria-label="Close menu"
            >
              <X className="h-6 w-6" />
            </motion.button>

            <div className="flex flex-col space-y-7">
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.05 }}
                exit={{ opacity: 0, x: 20 }}
                className="flex items-baseline gap-3"
              >
                <Link
                  href="/"
                  className="font-serif italic text-4xl"
                  onClick={toggleMenu}
                >
                  Kaido
                </Link>
                <span className="text-sm tracking-[0.18em] text-[#0b0b0c]/40">街道</span>
              </motion.div>

              {NAV_ITEMS.map((item, i) => (
                <motion.div
                  key={item.href}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.08 + 0.15 }}
                  exit={{ opacity: 0, x: 20 }}
                >
                  <Link
                    href={item.href}
                    className="font-mono text-sm uppercase tracking-[0.22em]"
                    onClick={toggleMenu}
                  >
                    {item.label}
                  </Link>
                </motion.div>
              ))}

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                exit={{ opacity: 0, y: 20 }}
                className="pt-6"
              >
                <NavbarWallet />
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export { Navbar1 };
