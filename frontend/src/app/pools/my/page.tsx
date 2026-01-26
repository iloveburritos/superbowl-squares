'use client';

import { useState } from 'react';
import { useAccount } from 'wagmi';
import { usePoolsByCreator } from '@/hooks/useFactory';
import { PoolCard } from '@/components/PoolCard';
import Link from 'next/link';
import { ConnectButton } from '@rainbow-me/rainbowkit';

type Tab = 'created' | 'participating';

export default function MyPoolsPage() {
  const { address, isConnected } = useAccount();
  const [activeTab, setActiveTab] = useState<Tab>('created');
  const { pools: createdPools, isLoading, error } = usePoolsByCreator(address);

  if (!isConnected) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="card p-12 text-center max-w-md relative overflow-hidden">
          {/* Background decoration */}
          <div className="absolute inset-0 opacity-5">
            <div
              className="absolute inset-0"
              style={{
                backgroundImage: `
                  linear-gradient(rgba(34, 197, 94, 0.5) 1px, transparent 1px),
                  linear-gradient(90deg, rgba(34, 197, 94, 0.5) 1px, transparent 1px)
                `,
                backgroundSize: '40px 40px',
              }}
            />
          </div>

          <div className="relative">
            <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-[var(--turf-green)]/20 to-[var(--turf-green)]/5 border border-[var(--turf-green)]/20 flex items-center justify-center">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" className="text-[var(--turf-green)]">
                <rect x="3" y="11" width="18" height="11" rx="2" stroke="currentColor" strokeWidth="2" />
                <path d="M7 11V7a5 5 0 0110 0v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </div>

            <h2 className="text-2xl font-bold text-[var(--chrome)] mb-3" style={{ fontFamily: 'var(--font-display)' }}>
              CONNECT WALLET
            </h2>
            <p className="text-[var(--smoke)] mb-6">
              Connect your wallet to view pools you've created or joined.
            </p>
            <ConnectButton />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Header section */}
      <div className="relative py-16 overflow-hidden">
        {/* Background effects */}
        <div className="absolute inset-0">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-[var(--championship-gold)]/10 rounded-full blur-[128px]" />
          <div className="absolute bottom-0 right-1/4 w-64 h-64 bg-[var(--turf-green)]/5 rounded-full blur-[96px]" />
        </div>

        <div className="container mx-auto px-6 relative">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--championship-gold)]/10 border border-[var(--championship-gold)]/20 mb-4">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" className="text-[var(--championship-gold)]">
                  <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  <circle cx="12" cy="7" r="4" stroke="currentColor" strokeWidth="2" />
                </svg>
                <span
                  className="text-xs font-medium text-[var(--championship-gold)]"
                  style={{ fontFamily: 'var(--font-display)', letterSpacing: '0.1em' }}
                >
                  YOUR POOLS
                </span>
              </div>
              <h1
                className="text-4xl md:text-5xl font-bold text-[var(--chrome)] mb-2"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                MY POOLS
              </h1>
              <p className="text-[var(--smoke)] text-lg">
                Manage your created pools and track your squares
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

      {/* Tabs */}
      <div className="container mx-auto px-6">
        <div className="flex gap-2 p-1 rounded-xl bg-[var(--steel)]/20 border border-[var(--steel)]/30 w-fit mb-8">
          <button
            onClick={() => setActiveTab('created')}
            className={`px-6 py-3 rounded-lg font-medium transition-all ${
              activeTab === 'created'
                ? 'bg-[var(--turf-green)] text-[var(--midnight)]'
                : 'text-[var(--smoke)] hover:text-[var(--chrome)]'
            }`}
            style={{ fontFamily: 'var(--font-display)', letterSpacing: '0.05em' }}
          >
            <span className="flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="opacity-80">
                <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              CREATED
              {createdPools && createdPools.length > 0 && (
                <span
                  className={`ml-1 px-2 py-0.5 text-xs rounded-full ${
                    activeTab === 'created'
                      ? 'bg-[var(--midnight)]/20 text-[var(--midnight)]'
                      : 'bg-[var(--turf-green)]/20 text-[var(--turf-green)]'
                  }`}
                >
                  {createdPools.length}
                </span>
              )}
            </span>
          </button>
          <button
            onClick={() => setActiveTab('participating')}
            className={`px-6 py-3 rounded-lg font-medium transition-all ${
              activeTab === 'participating'
                ? 'bg-[var(--turf-green)] text-[var(--midnight)]'
                : 'text-[var(--smoke)] hover:text-[var(--chrome)]'
            }`}
            style={{ fontFamily: 'var(--font-display)', letterSpacing: '0.05em' }}
          >
            <span className="flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="opacity-80">
                <rect x="3" y="3" width="7" height="7" stroke="currentColor" strokeWidth="2" />
                <rect x="14" y="3" width="7" height="7" stroke="currentColor" strokeWidth="2" />
                <rect x="3" y="14" width="7" height="7" stroke="currentColor" strokeWidth="2" />
                <rect x="14" y="14" width="7" height="7" stroke="currentColor" strokeWidth="2" />
              </svg>
              PARTICIPATING
            </span>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-6 pb-16">
        {activeTab === 'created' && (
          <>
            {isLoading ? (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="card p-6">
                    <div className="animate-pulse">
                      <div className="flex justify-between mb-4">
                        <div className="h-6 w-2/3 rounded shimmer" />
                        <div className="h-6 w-16 rounded-full shimmer" />
                      </div>
                      <div className="h-4 w-1/2 rounded shimmer mb-6" />
                      <div className="grid grid-cols-2 gap-4 mb-4">
                        {[1, 2, 3, 4].map((j) => (
                          <div key={j}>
                            <div className="h-3 w-16 rounded shimmer mb-2" />
                            <div className="h-5 w-20 rounded shimmer" />
                          </div>
                        ))}
                      </div>
                      <div className="h-2 w-full rounded-full shimmer" />
                    </div>
                  </div>
                ))}
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
              </div>
            ) : createdPools?.length === 0 ? (
              <div className="card p-12 text-center relative overflow-hidden">
                <div className="absolute inset-0 opacity-5">
                  <div
                    className="absolute inset-0"
                    style={{
                      backgroundImage: `
                        linear-gradient(rgba(34, 197, 94, 0.5) 1px, transparent 1px),
                        linear-gradient(90deg, rgba(34, 197, 94, 0.5) 1px, transparent 1px)
                      `,
                      backgroundSize: '40px 40px',
                    }}
                  />
                </div>

                <div className="relative">
                  <div className="w-24 h-24 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-[var(--championship-gold)]/20 to-[var(--championship-gold)]/5 border border-[var(--championship-gold)]/20 flex items-center justify-center">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" className="text-[var(--championship-gold)]">
                      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  </div>

                  <h2 className="text-3xl font-bold text-[var(--chrome)] mb-3" style={{ fontFamily: 'var(--font-display)' }}>
                    NO POOLS CREATED
                  </h2>
                  <p className="text-[var(--smoke)] mb-8 max-w-md mx-auto">
                    You haven't created any pools yet. Start your own Super Bowl Squares game!
                  </p>
                  <Link href="/pools/create" className="btn-primary text-lg px-8 py-4">
                    Create Your First Pool
                  </Link>
                </div>
              </div>
            ) : (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {createdPools?.map((poolAddress, index) => (
                  <div
                    key={poolAddress}
                    className="animate-fade-up opacity-0"
                    style={{ animationDelay: `${index * 50}ms`, animationFillMode: 'forwards' }}
                  >
                    <PoolCard address={poolAddress} showOperatorBadge />
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {activeTab === 'participating' && (
          <div className="card p-12 text-center relative overflow-hidden">
            <div className="absolute inset-0 opacity-5">
              <div
                className="absolute inset-0"
                style={{
                  backgroundImage: `
                    linear-gradient(rgba(139, 92, 246, 0.5) 1px, transparent 1px),
                    linear-gradient(90deg, rgba(139, 92, 246, 0.5) 1px, transparent 1px)
                  `,
                  backgroundSize: '40px 40px',
                }}
              />
            </div>

            <div className="relative">
              <div className="w-24 h-24 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-purple-500/20 to-purple-500/5 border border-purple-500/20 flex items-center justify-center">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" className="text-purple-400">
                  <rect x="3" y="3" width="7" height="7" stroke="currentColor" strokeWidth="2" />
                  <rect x="14" y="3" width="7" height="7" stroke="currentColor" strokeWidth="2" />
                  <rect x="3" y="14" width="7" height="7" stroke="currentColor" strokeWidth="2" />
                  <rect x="14" y="14" width="7" height="7" stroke="currentColor" strokeWidth="2" />
                </svg>
              </div>

              <h2 className="text-3xl font-bold text-[var(--chrome)] mb-3" style={{ fontFamily: 'var(--font-display)' }}>
                COMING SOON
              </h2>
              <p className="text-[var(--smoke)] mb-6 max-w-md mx-auto">
                Tracking pools where you own squares requires a subgraph indexer.
                This feature will be available once the subgraph is deployed.
              </p>
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-500/10 border border-purple-500/20">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-purple-400">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
                  <path d="M12 6v6l4 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
                <span className="text-sm text-purple-400">Subgraph integration in progress</span>
              </div>

              <div className="mt-8">
                <Link href="/pools" className="btn-secondary">
                  Browse All Pools
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
