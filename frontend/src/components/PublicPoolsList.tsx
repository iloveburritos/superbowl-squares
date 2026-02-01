'use client';

import { useMemo, useState } from 'react';
import { useReadContracts, useAccount, useChainId } from 'wagmi';
import { zeroAddress } from 'viem';
import { PoolCard } from './PoolCard';
import { SquaresPoolABI } from '@/lib/abis/SquaresPool';
import { findToken, ETH_TOKEN } from '@/config/tokens';
import Link from 'next/link';

interface PublicPoolsListProps {
  pools: `0x${string}`[];
  isLoading: boolean;
}

type SortOption = 'newest' | 'price-low' | 'price-high' | 'most-available' | 'almost-full';
type TokenFilter = 'all' | 'ETH' | 'USDC';

export function PublicPoolsList({ pools, isLoading }: PublicPoolsListProps) {
  const { address: userAddress } = useAccount();
  const chainId = useChainId();

  // Filter and sort state
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [tokenFilter, setTokenFilter] = useState<TokenFilter>('all');
  const [showMyPoolsOnly, setShowMyPoolsOnly] = useState(false);

  // Fetch isPrivate status for all pools
  const { data: privacyResults, isLoading: isPrivacyLoading } = useReadContracts({
    contracts: pools.map((address) => ({
      address,
      abi: SquaresPoolABI,
      functionName: 'isPrivate',
    })),
  });

  // Fetch pool info for all pools (for filtering/sorting)
  const { data: poolInfoResults, isLoading: isPoolInfoLoading } = useReadContracts({
    contracts: pools.map((address) => ({
      address,
      abi: SquaresPoolABI,
      functionName: 'getPoolInfo',
    })),
  });

  // Fetch user's square count for each pool
  const { data: userSquareResults, isLoading: isUserSquaresLoading } = useReadContracts({
    contracts: pools.map((address) => ({
      address,
      abi: SquaresPoolABI,
      functionName: 'userSquareCount',
      args: userAddress ? [userAddress] : undefined,
    })),
    query: {
      enabled: !!userAddress,
    },
  });

  // Process and filter pools
  const processedPools = useMemo(() => {
    if (!privacyResults || !poolInfoResults) return [];

    return pools
      .map((address, index) => {
        const privacyResult = privacyResults[index];
        const poolInfoResult = poolInfoResults[index];
        const userSquaresResult = userSquareResults?.[index];

        const isPrivate = privacyResult?.status === 'success' && privacyResult.result === true;
        const poolInfo = poolInfoResult?.status === 'success'
          ? (poolInfoResult.result as readonly [string, number, bigint, `0x${string}`, bigint, bigint, string, string])
          : null;
        const userSquares = userSquaresResult?.status === 'success'
          ? Number(userSquaresResult.result)
          : 0;

        if (!poolInfo) return null;

        // Get token info
        const paymentToken = poolInfo[3] as `0x${string}`;
        const token = findToken(chainId, paymentToken) || ETH_TOKEN;
        const isETH = paymentToken === zeroAddress;

        return {
          address,
          isPrivate,
          name: poolInfo[0] as string,
          squarePrice: poolInfo[2] as bigint,
          paymentToken,
          tokenSymbol: token.symbol,
          isETH,
          squaresSold: Number(poolInfo[5]),
          userSquares,
          isUserIn: userSquares > 0,
        };
      })
      .filter((pool): pool is NonNullable<typeof pool> => pool !== null && !pool.isPrivate);
  }, [pools, privacyResults, poolInfoResults, userSquareResults, chainId]);

  // Apply filters and sorting
  const filteredAndSortedPools = useMemo(() => {
    let result = [...processedPools];

    // Filter by token
    if (tokenFilter === 'ETH') {
      result = result.filter(p => p.isETH);
    } else if (tokenFilter === 'USDC') {
      result = result.filter(p => p.tokenSymbol === 'USDC');
    }

    // Filter by user's pools
    if (showMyPoolsOnly) {
      result = result.filter(p => p.isUserIn);
    }

    // Sort
    switch (sortBy) {
      case 'price-low':
        result.sort((a, b) => {
          // Normalize prices (ETH has 18 decimals, USDC has 6)
          const aPrice = a.isETH ? a.squarePrice : a.squarePrice * BigInt(1e12);
          const bPrice = b.isETH ? b.squarePrice : b.squarePrice * BigInt(1e12);
          return aPrice < bPrice ? -1 : aPrice > bPrice ? 1 : 0;
        });
        break;
      case 'price-high':
        result.sort((a, b) => {
          const aPrice = a.isETH ? a.squarePrice : a.squarePrice * BigInt(1e12);
          const bPrice = b.isETH ? b.squarePrice : b.squarePrice * BigInt(1e12);
          return aPrice > bPrice ? -1 : aPrice < bPrice ? 1 : 0;
        });
        break;
      case 'most-available':
        result.sort((a, b) => (100 - a.squaresSold) - (100 - b.squaresSold) > 0 ? -1 : 1);
        break;
      case 'almost-full':
        result.sort((a, b) => b.squaresSold - a.squaresSold);
        break;
      case 'newest':
      default:
        // Assume pools array is already in creation order (newest first or last)
        result.reverse();
        break;
    }

    return result;
  }, [processedPools, tokenFilter, showMyPoolsOnly, sortBy]);

  const stillLoading = isLoading || isPrivacyLoading || isPoolInfoLoading;
  const userPoolsCount = processedPools.filter(p => p.isUserIn).length;

  if (stillLoading) {
    return (
      <>
        <div className="mb-8">
          <div className="h-12 w-full rounded-xl shimmer" />
        </div>
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

  if (processedPools.length === 0) {
    return (
      <>
        <PoolCountHeader count={0} />
        <div className="card p-12 text-center relative overflow-hidden">
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
      {/* Filters and Sort Controls */}
      <div className="mb-8 p-4 rounded-xl bg-[var(--steel)]/10 border border-[var(--steel)]/20">
        <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
          {/* Left side - Filters */}
          <div className="flex flex-wrap gap-3 items-center">
            {/* Token Filter */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-[var(--smoke)] uppercase tracking-wide">Token:</span>
              <div className="flex rounded-lg overflow-hidden border border-[var(--steel)]/30">
                {(['all', 'ETH', 'USDC'] as TokenFilter[]).map((token) => (
                  <button
                    key={token}
                    onClick={() => setTokenFilter(token)}
                    className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                      tokenFilter === token
                        ? 'bg-[var(--turf-green)] text-white'
                        : 'bg-[var(--midnight)] text-[var(--smoke)] hover:text-[var(--chrome)]'
                    }`}
                  >
                    {token === 'all' ? 'All' : token}
                  </button>
                ))}
              </div>
            </div>

            {/* My Pools Toggle */}
            {userAddress && userPoolsCount > 0 && (
              <button
                onClick={() => setShowMyPoolsOnly(!showMyPoolsOnly)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
                  showMyPoolsOnly
                    ? 'bg-[var(--turf-green)]/20 border-[var(--turf-green)]/50 text-[var(--turf-green)]'
                    : 'bg-[var(--midnight)] border-[var(--steel)]/30 text-[var(--smoke)] hover:text-[var(--chrome)]'
                }`}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
                My Pools ({userPoolsCount})
              </button>
            )}
          </div>

          {/* Right side - Sort */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-[var(--smoke)] uppercase tracking-wide">Sort:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="bg-[var(--midnight)] border border-[var(--steel)]/30 rounded-lg px-3 py-1.5 text-sm text-[var(--chrome)] focus:outline-none focus:border-[var(--turf-green)]/50"
            >
              <option value="newest">Newest First</option>
              <option value="price-low">Price: Low to High</option>
              <option value="price-high">Price: High to Low</option>
              <option value="most-available">Most Available</option>
              <option value="almost-full">Almost Full</option>
            </select>
          </div>
        </div>
      </div>

      {/* Pool Count */}
      <PoolCountHeader
        count={filteredAndSortedPools.length}
        totalCount={processedPools.length}
        filtered={tokenFilter !== 'all' || showMyPoolsOnly}
      />

      {/* No results after filtering */}
      {filteredAndSortedPools.length === 0 ? (
        <div className="card p-8 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[var(--steel)]/20 flex items-center justify-center">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" className="text-[var(--smoke)]">
              <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2" />
              <path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
          <p className="text-[var(--smoke)]">No pools match your filters</p>
          <button
            onClick={() => {
              setTokenFilter('all');
              setShowMyPoolsOnly(false);
            }}
            className="mt-4 text-[var(--turf-green)] hover:underline text-sm"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredAndSortedPools.map((pool, index) => (
            <div
              key={pool.address}
              className="animate-fade-up opacity-0"
              style={{ animationDelay: `${index * 50}ms`, animationFillMode: 'forwards' }}
            >
              <PoolCard
                address={pool.address}
                squareCount={pool.userSquares}
              />
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function PoolCountHeader({
  count,
  totalCount,
  loading,
  filtered
}: {
  count: number | undefined;
  totalCount?: number;
  loading?: boolean;
  filtered?: boolean;
}) {
  return (
    <div className="mb-6 flex items-center justify-between">
      <p className="text-[var(--smoke)]">
        {loading
          ? 'Loading public pools...'
          : filtered && totalCount !== undefined
          ? `Showing ${count} of ${totalCount} pools`
          : `${count} public pool${count === 1 ? '' : 's'} available`}
      </p>
    </div>
  );
}
