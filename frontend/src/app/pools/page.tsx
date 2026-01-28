'use client';

import { useState } from 'react';
import { useChainId, useSwitchChain } from 'wagmi';
import { useAllPools, usePoolCount, useFactoryAddress } from '@/hooks/useFactory';
import { PoolCard } from '@/components/PoolCard';
import Link from 'next/link';

const PAGE_SIZE = 12;

// Only Sepolia has contracts deployed
const SUPPORTED_CHAIN_ID = 11155111;
const SUPPORTED_CHAIN_NAME = 'Sepolia';

export default function PoolsPage() {
  const [page, setPage] = useState(0);
  const chainId = useChainId();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const factoryAddress = useFactoryAddress();
  const { pools, total, isLoading, error } = useAllPools(page * PAGE_SIZE, PAGE_SIZE);
  const { count: poolCount } = usePoolCount();

  const isWrongNetwork = !factoryAddress || factoryAddress === '0x0000000000000000000000000000000000000000';

  const totalPages = total ? Math.ceil(Number(total) / PAGE_SIZE) : 0;

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
                {poolCount !== undefined
                  ? `${poolCount.toString()} active pools available`
                  : 'Loading pools...'}
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
              Super Bowl Squares is currently deployed on {SUPPORTED_CHAIN_NAME}. Please switch networks to continue.
            </p>
            <button
              onClick={() => switchChain({ chainId: SUPPORTED_CHAIN_ID })}
              disabled={isSwitching}
              className="btn-primary"
            >
              {isSwitching ? 'Switching...' : `Switch to ${SUPPORTED_CHAIN_NAME}`}
            </button>
          </div>
        ) : isLoading ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(6)].map((_, i) => (
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
            <button
              onClick={() => window.location.reload()}
              className="btn-secondary"
            >
              Try Again
            </button>
          </div>
        ) : pools?.length === 0 ? (
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
                  <ellipse cx="12" cy="12" rx="10" ry="6" stroke="currentColor" strokeWidth="2" transform="rotate(45 12 12)" />
                  <path d="M8 12h8M12 8v8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </div>

              <h2 className="text-3xl font-bold text-[var(--chrome)] mb-3" style={{ fontFamily: 'var(--font-display)' }}>
                NO POOLS YET
              </h2>
              <p className="text-[var(--smoke)] mb-8 max-w-md mx-auto">
                Be the first to create a Super Bowl Squares pool and start the game!
              </p>
              <Link href="/pools/create" className="btn-primary text-lg px-8 py-4">
                Create First Pool
              </Link>
            </div>
          </div>
        ) : (
          <>
            {/* Pool grid */}
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {pools?.map((address, index) => (
                <div
                  key={address}
                  className="animate-fade-up opacity-0"
                  style={{ animationDelay: `${index * 50}ms`, animationFillMode: 'forwards' }}
                >
                  <PoolCard address={address} />
                </div>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex justify-center items-center gap-4 mt-12">
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="btn-secondary px-6 py-3 disabled:opacity-30"
                >
                  <span className="flex items-center gap-2">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <path d="M19 12H5M12 19l-7-7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Previous
                  </span>
                </button>

                <div className="flex items-center gap-2 px-4">
                  {Array.from({ length: Math.min(5, totalPages) }).map((_, i) => {
                    let pageNum = i;
                    if (totalPages > 5) {
                      if (page < 3) {
                        pageNum = i;
                      } else if (page > totalPages - 3) {
                        pageNum = totalPages - 5 + i;
                      } else {
                        pageNum = page - 2 + i;
                      }
                    }

                    return (
                      <button
                        key={pageNum}
                        onClick={() => setPage(pageNum)}
                        className={`w-10 h-10 rounded-lg font-bold text-sm transition-all ${
                          page === pageNum
                            ? 'bg-[var(--turf-green)] text-[var(--midnight)]'
                            : 'bg-[var(--steel)]/30 text-[var(--smoke)] hover:bg-[var(--steel)]/50'
                        }`}
                        style={{ fontFamily: 'var(--font-display)' }}
                      >
                        {pageNum + 1}
                      </button>
                    );
                  })}
                </div>

                <button
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="btn-secondary px-6 py-3 disabled:opacity-30"
                >
                  <span className="flex items-center gap-2">
                    Next
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
