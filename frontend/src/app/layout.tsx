'use client';

import './globals.css';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider } from 'wagmi';
import { RainbowKitProvider, darkTheme } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import { config } from '@/config/wagmi';
import { useState, useEffect } from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import Link from 'next/link';
import { PatriotsLogo, SeahawksLogo, SuperBowlLXLogo } from '@/components/Logos';
import { useAccount } from 'wagmi';
import { SCORE_ADMIN_ADDRESS } from '@/hooks/useAdminScoreSubmit';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [queryClient] = useState(() => new QueryClient());

  // Suppress errors from wallet browser extensions
  useEffect(() => {
    const originalError = console.error;
    console.error = (...args) => {
      // Suppress chrome.runtime.sendMessage errors from wallet extensions
      if (args[0]?.toString?.().includes('runtime.sendMessage')) {
        return;
      }
      // Suppress extension ID errors
      if (args[0]?.toString?.().includes('Extension ID')) {
        return;
      }
      originalError.apply(console, args);
    };

    // Global error handler for uncaught extension errors
    const handleError = (event: ErrorEvent) => {
      if (
        event.message?.includes('runtime.sendMessage') ||
        event.message?.includes('Extension ID')
      ) {
        event.preventDefault();
        return true;
      }
    };

    window.addEventListener('error', handleError);

    return () => {
      console.error = originalError;
      window.removeEventListener('error', handleError);
    };
  }, []);

  return (
    <html lang="en">
      <head>
        <title>Super Bowl Squares | Decentralized Betting Pools</title>
        <meta name="description" content="Create or join decentralized Super Bowl Squares betting pools. Powered by blockchain for transparent, trustless, and automatic payouts." />
        <link rel="icon" href="/logos/super-bowl-lx.svg" type="image/svg+xml" />
        {/* Suppress wallet extension errors */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                if (typeof window !== 'undefined') {
                  window.addEventListener('error', function(e) {
                    if (e.message && (
                      e.message.includes('runtime.sendMessage') ||
                      e.message.includes('Extension ID') ||
                      e.message.includes('chrome.runtime')
                    )) {
                      e.stopImmediatePropagation();
                      e.preventDefault();
                      return true;
                    }
                  }, true);

                  window.addEventListener('unhandledrejection', function(e) {
                    if (e.reason && e.reason.message && (
                      e.reason.message.includes('runtime.sendMessage') ||
                      e.reason.message.includes('Extension ID')
                    )) {
                      e.stopImmediatePropagation();
                      e.preventDefault();
                      return true;
                    }
                  }, true);
                }
              })();
            `,
          }}
        />
      </head>
      <body>
        <WagmiProvider config={config}>
          <QueryClientProvider client={queryClient}>
            <RainbowKitProvider
              theme={darkTheme({
                accentColor: '#22c55e',
                accentColorForeground: '#0a0e1a',
                borderRadius: 'medium',
                fontStack: 'system',
                overlayBlur: 'small',
              })}
            >
              <div className="min-h-screen flex flex-col">
                <Header />
                <main className="flex-1 relative">{children}</main>
                <Footer />
              </div>
            </RainbowKitProvider>
          </QueryClientProvider>
        </WagmiProvider>
      </body>
    </html>
  );
}

function Header() {
  const { address } = useAccount();
  const isAdmin = address?.toLowerCase() === SCORE_ADMIN_ADDRESS.toLowerCase();

  return (
    <header className="sticky top-0 z-50 border-b border-[var(--steel)]/30 bg-[var(--midnight)]/80 backdrop-blur-xl">
      <div className="container mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <Link href="/" className="group flex items-center gap-3">
            <div className="relative flex items-center gap-2">
              {/* Team logos */}
              <PatriotsLogo size={32} className="hidden sm:block" />
              {/* Super Bowl LX Trophy */}
              <SuperBowlLXLogo size={50} className="group-hover:drop-shadow-[0_0_10px_rgba(251,191,36,0.4)] transition-all duration-300" />
              <SeahawksLogo size={32} className="hidden sm:block" />
            </div>
            <div className="flex flex-col">
              <span className="text-lg font-bold tracking-wide text-[var(--chrome)] group-hover:text-[var(--championship-gold)] transition-colors" style={{ fontFamily: 'var(--font-display)' }}>
                SUPER BOWL LX
              </span>
              <span className="text-xs tracking-[0.2em] text-[var(--smoke)] -mt-1" style={{ fontFamily: 'var(--font-display)' }}>
                SQUARES
              </span>
            </div>
          </Link>

          {/* Navigation */}
          <nav className="hidden md:flex items-center gap-8">
            <NavLink href="/pools">Browse Pools</NavLink>
            <NavLink href="/pools/my">My Pools</NavLink>
            <NavLink href="/pools/create">Create Pool</NavLink>
            {isAdmin && <NavLink href="/admin">Admin</NavLink>}
          </nav>

          {/* Wallet */}
          <div className="flex items-center gap-4">
            <ConnectButton.Custom>
              {({
                account,
                chain,
                openAccountModal,
                openChainModal,
                openConnectModal,
                mounted,
              }) => {
                const ready = mounted;
                const connected = ready && account && chain;

                return (
                  <div
                    {...(!ready && {
                      'aria-hidden': true,
                      style: {
                        opacity: 0,
                        pointerEvents: 'none',
                        userSelect: 'none',
                      },
                    })}
                  >
                    {(() => {
                      if (!connected) {
                        return (
                          <button
                            onClick={openConnectModal}
                            className="btn-primary text-sm"
                          >
                            Connect Wallet
                          </button>
                        );
                      }

                      if (chain.unsupported) {
                        return (
                          <button
                            onClick={openChainModal}
                            className="btn-secondary text-sm border-red-500 text-red-500"
                          >
                            Wrong Network
                          </button>
                        );
                      }

                      return (
                        <div className="flex items-center gap-3">
                          <button
                            onClick={openChainModal}
                            className="hidden sm:flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--steel)]/30 hover:bg-[var(--steel)]/50 transition-colors text-sm"
                          >
                            {chain.hasIcon && (
                              <div className="w-5 h-5 rounded-full overflow-hidden">
                                {chain.iconUrl && (
                                  <img
                                    alt={chain.name ?? 'Chain icon'}
                                    src={chain.iconUrl}
                                    className="w-5 h-5"
                                  />
                                )}
                              </div>
                            )}
                            <span className="text-[var(--chrome)]">{chain.name}</span>
                          </button>

                          <button
                            onClick={openAccountModal}
                            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-[var(--turf-green)]/20 to-[var(--electric-lime)]/10 border border-[var(--turf-green)]/30 hover:border-[var(--turf-green)]/50 transition-all"
                          >
                            <div className="w-2 h-2 rounded-full bg-[var(--turf-green)] animate-pulse" />
                            <span className="text-sm font-medium text-[var(--chrome)]">
                              {account.displayName}
                            </span>
                          </button>
                        </div>
                      );
                    })()}
                  </div>
                );
              }}
            </ConnectButton.Custom>
          </div>
        </div>
      </div>
    </header>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="relative text-sm font-semibold tracking-wide text-[var(--smoke)] hover:text-[var(--chrome)] transition-colors group"
      style={{ fontFamily: 'var(--font-display)', textTransform: 'uppercase', letterSpacing: '0.05em' }}
    >
      {children}
      <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-[var(--turf-green)] group-hover:w-full transition-all duration-300" />
    </Link>
  );
}

function Footer() {
  return (
    <footer className="relative mt-auto border-t border-[var(--steel)]/30">
      {/* Gradient glow */}
      <div className="absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-[var(--championship-gold)]/30 to-transparent" />

      <div className="container mx-auto px-6 py-12">
        <div className="grid md:grid-cols-3 gap-8 mb-8">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-3 mb-4">
              <PatriotsLogo size={28} />
              <SuperBowlLXLogo size={40} />
              <SeahawksLogo size={28} />
            </div>
            <span className="font-bold text-[var(--chrome)] block mb-2" style={{ fontFamily: 'var(--font-display)' }}>
              SUPER BOWL LX SQUARES
            </span>
            <p className="text-sm text-[var(--smoke)] leading-relaxed">
              Patriots vs Seahawks • February 8, 2026 • Levi's Stadium, Santa Clara
            </p>
            <p className="text-sm text-[var(--smoke)] leading-relaxed mt-2">
              Decentralized betting pools for the big game. Transparent, trustless, and automatic payouts.
            </p>
          </div>

          {/* Links */}
          <div>
            <h4 className="text-sm font-bold text-[var(--chrome)] mb-4" style={{ fontFamily: 'var(--font-display)' }}>
              QUICK LINKS
            </h4>
            <div className="space-y-2">
              <FooterLink href="/pools">Browse Pools</FooterLink>
              <FooterLink href="/pools/my">My Pools</FooterLink>
              <FooterLink href="/pools/create">Create Pool</FooterLink>
            </div>
          </div>

          {/* Tech */}
          <div>
            <h4 className="text-sm font-bold text-[var(--chrome)] mb-4" style={{ fontFamily: 'var(--font-display)' }}>
              POWERED BY
            </h4>
            <div className="flex flex-wrap gap-2">
              <TechBadge>Chainlink</TechBadge>
              <TechBadge>Ethereum</TechBadge>
            </div>
          </div>
        </div>

        {/* Bottom */}
        <div className="pt-8 border-t border-[var(--steel)]/30 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-xs text-[var(--smoke)]">
            &copy; {new Date().getFullYear()} Super Bowl Squares. All rights reserved.
          </p>
          <div className="flex items-center gap-6">
            <span className="text-xs text-[var(--smoke)]">
              Built for the decentralized future
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="block text-sm text-[var(--smoke)] hover:text-[var(--turf-green)] transition-colors"
    >
      {children}
    </Link>
  );
}

function TechBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="px-3 py-1 text-xs font-medium rounded-full bg-[var(--steel)]/30 text-[var(--smoke)] border border-[var(--steel)]/50">
      {children}
    </span>
  );
}
