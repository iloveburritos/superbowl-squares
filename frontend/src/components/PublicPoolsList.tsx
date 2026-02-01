'use client';

import { useMemo } from 'react';
import { useReadContracts } from 'wagmi';
import { PoolCard } from './PoolCard';
import { SquaresPoolABI } from '@/lib/abis/SquaresPool';
import Link from 'next/link';

interface PublicPoolsListProps {
  pools: `0x${string}`[];
  isLoading: boolean;
}

export function PublicPoolsList({ pools, isLoading }: PublicPoolsListProps) {
  // Fetch isPrivate status for all pools in parallel
  const { data: privacyResults, isLoading: isPrivacyLoading } = useReadContracts({
    contracts: pools.map((address) => ({
      address,
      abi: SquaresPoolABI,
      functionName: 'isPrivate',
    })),
  });

  // Filter to only public pools
  const publicPools = useMemo(() => {
    if (!privacyResults) return [];
    return pools.filter((_, index) => {
      const result = privacyResults[index];
      // If result is undefined or errored, assume public (show it)
      if (!result || result.status === 'failure') return true;
      // Only hide if explicitly private
      return result.result !== true;
    });
  }, [pools, privacyResults]);

  const publicPoolCount = publicPools.length;
  const stillLoading = isLoading || isPrivacyLoading;

  if (stillLoading) {
    return (
      <>
        <PoolCountHeader count={undefined} loading />
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
      </>
    );
  }

  if (publicPoolCount === 0) {
    return (
      <>
        <PoolCountHeader count={0} />
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
              NO PUBLIC POOLS
            </h2>
            <p className="text-[var(--smoke)] mb-8 max-w-md mx-auto">
              There are no public pools available right now. Create one and invite your friends!
            </p>
            <Link href="/pools/create" className="btn-primary text-lg px-8 py-4">
              Create a Pool
            </Link>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <PoolCountHeader count={publicPoolCount} />
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {publicPools.map((address, index) => (
          <div
            key={address}
            className="animate-fade-up opacity-0"
            style={{ animationDelay: `${index * 50}ms`, animationFillMode: 'forwards' }}
          >
            <PoolCard address={address} />
          </div>
        ))}
      </div>
    </>
  );
}

function PoolCountHeader({ count, loading }: { count: number | undefined; loading?: boolean }) {
  return (
    <div className="mb-8 text-center">
      <p className="text-[var(--smoke)] text-lg">
        {loading
          ? 'Loading public pools...'
          : `${count} public pool${count === 1 ? '' : 's'} available`}
      </p>
    </div>
  );
}
