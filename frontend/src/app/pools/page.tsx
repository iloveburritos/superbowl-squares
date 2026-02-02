'use client';

import { useChainId, useSwitchChain } from 'wagmi';
import { useAllPools, useFactoryAddress } from '@/hooks/useFactory';
import { PublicPoolsList } from '@/components/PublicPoolsList';
import Link from 'next/link';
import { SUPPORTED_CHAINS } from '@/config/wagmi';

// Default to Base if user needs to switch
const DEFAULT_CHAIN_ID = 8453;
const DEFAULT_CHAIN_NAME = 'Base';

export default function PoolsPage() {
  const chainId = useChainId();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const factoryAddress = useFactoryAddress();
  // Fetch all pools (up to 100) to filter by privacy
  const { pools, isLoading, error } = useAllPools(0, 100);

  const isWrongNetwork = !factoryAddress || factoryAddress === '0x0000000000000000000000000000000000000000';

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
          <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--turf-green)]/10 border border-[var(--turf-green)]/20 mb-4">
                <div className="w-1.5 h-1.5 rounded-full bg-[var(--turf-green)] animate-pulse" />
                <span className="text-xs font-medium text-[var(--turf-green)]" style={{ fontFamily: 'var(--font-display)', letterSpacing: '0.1em' }}>
                  LIVE POOLS
                </span>
              </div>
              <h1
                className="text-4xl md:text-5xl font-bold text-[var(--chrome)] mb-2"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                BROWSE POOLS
              </h1>
              <p className="text-[var(--smoke)] text-lg">
                Find and join public Super Bowl Squares pools
              </p>
            </div>

            <Link href="/pools/create" className="btn-primary">
              <span className="flex items-center gap-2">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
                Create Pool
              </span>
            </Link>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-6 pb-16">
        {isWrongNetwork ? (
          <div className="card p-12 text-center">
            <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-[var(--championship-gold)]/10 flex items-center justify-center">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" className="text-[var(--championship-gold)]">
                <path d="M12 9v4M12 17h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="currentColor" strokeWidth="2" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-[var(--chrome)] mb-2" style={{ fontFamily: 'var(--font-display)' }}>
              WRONG NETWORK
            </h2>
            <p className="text-[var(--smoke)] mb-6">
              Super Bowl Squares is deployed on Base and Arbitrum. Please switch networks to continue.
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => switchChain({ chainId: 8453 })}
                disabled={isSwitching}
                className="btn-primary"
              >
                {isSwitching ? 'Switching...' : 'Switch to Base'}
              </button>
              <button
                onClick={() => switchChain({ chainId: 42161 })}
                disabled={isSwitching}
                className="btn-secondary"
              >
                {isSwitching ? 'Switching...' : 'Switch to Arbitrum'}
              </button>
            </div>
          </div>
        ) : error ? (
          <div className="card p-12 text-center">
            <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-[var(--danger)]/10 flex items-center justify-center">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" className="text-[var(--danger)]">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
                <path d="M12 8v4M12 16h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-[var(--chrome)] mb-2" style={{ fontFamily: 'var(--font-display)' }}>
              FAILED TO LOAD
            </h2>
            <p className="text-[var(--smoke)] mb-4">{error.message}</p>
            <button
              onClick={() => window.location.reload()}
              className="btn-secondary"
            >
              Try Again
            </button>
          </div>
        ) : (
          <PublicPoolsList pools={pools || []} isLoading={isLoading} />
        )}
      </div>
    </div>
  );
}
