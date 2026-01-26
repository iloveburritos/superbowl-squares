'use client';

import { useAccount } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { CreatePoolForm } from '@/components/CreatePoolForm';

export default function CreatePoolPage() {
  const { isConnected } = useAccount();

  return (
    <div className="min-h-screen">
      {/* Header section */}
      <div className="relative py-16 overflow-hidden">
        {/* Background effects */}
        <div className="absolute inset-0">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-[var(--turf-green)]/10 rounded-full blur-[128px]" />
          <div className="absolute bottom-0 right-1/4 w-64 h-64 bg-[var(--championship-gold)]/5 rounded-full blur-[96px]" />
        </div>

        <div className="container mx-auto px-6 relative">
          <div className="max-w-3xl mx-auto">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--turf-green)]/10 border border-[var(--turf-green)]/20 mb-4">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-[var(--turf-green)]">
                <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <span className="text-xs font-medium text-[var(--turf-green)]" style={{ fontFamily: 'var(--font-display)', letterSpacing: '0.1em' }}>
                NEW POOL
              </span>
            </div>
            <h1
              className="text-4xl md:text-5xl font-bold text-[var(--chrome)] mb-3"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              CREATE YOUR POOL
            </h1>
            <p className="text-[var(--smoke)] text-lg max-w-xl">
              Set up a new Super Bowl Squares pool. You'll be the operator with full control over the game.
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-6 pb-16 max-w-3xl">
        {!isConnected ? (
          <div className="card p-12 text-center relative overflow-hidden">
            {/* Background decoration */}
            <div className="absolute inset-0 opacity-5">
              <div className="absolute inset-0" style={{
                backgroundImage: `
                  linear-gradient(rgba(34, 197, 94, 0.5) 1px, transparent 1px),
                  linear-gradient(90deg, rgba(34, 197, 94, 0.5) 1px, transparent 1px)
                `,
                backgroundSize: '40px 40px',
              }} />
            </div>

            <div className="relative">
              <div className="w-24 h-24 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-[var(--turf-green)]/20 to-[var(--turf-green)]/5 border border-[var(--turf-green)]/20 flex items-center justify-center">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" className="text-[var(--turf-green)]">
                  <rect x="3" y="11" width="18" height="11" rx="2" stroke="currentColor" strokeWidth="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </div>

              <h2 className="text-3xl font-bold text-[var(--chrome)] mb-3" style={{ fontFamily: 'var(--font-display)' }}>
                CONNECT YOUR WALLET
              </h2>
              <p className="text-[var(--smoke)] mb-8 max-w-md mx-auto">
                You need to connect your wallet to create a pool. Your wallet address will be the pool operator.
              </p>
              <div className="flex justify-center">
                <ConnectButton.Custom>
                  {({ openConnectModal }) => (
                    <button onClick={openConnectModal} className="btn-primary text-lg px-8 py-4">
                      <span className="flex items-center gap-3">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                          <rect x="2" y="6" width="20" height="12" rx="2" stroke="currentColor" strokeWidth="2" />
                          <circle cx="16" cy="12" r="2" stroke="currentColor" strokeWidth="2" />
                        </svg>
                        Connect Wallet
                      </span>
                    </button>
                  )}
                </ConnectButton.Custom>
              </div>
            </div>
          </div>
        ) : (
          <CreatePoolForm />
        )}
      </div>
    </div>
  );
}
