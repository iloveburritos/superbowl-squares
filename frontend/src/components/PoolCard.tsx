'use client';

import Link from 'next/link';
import { formatEther } from 'viem';
import { usePoolInfo } from '@/hooks/usePool';
import { PoolState, POOL_STATE_LABELS } from '@/lib/contracts';
import { PatriotsLogo, SeahawksLogo } from './Logos';

interface PoolCardProps {
  address: `0x${string}`;
  showOperatorBadge?: boolean;
}

export function PoolCard({ address, showOperatorBadge }: PoolCardProps) {
  const { poolInfo, isLoading, error } = usePoolInfo(address);

  if (isLoading) {
    return (
      <div className="card p-6">
        <div className="animate-pulse">
          <div className="flex justify-between mb-4">
            <div className="h-6 w-2/3 rounded shimmer" />
            <div className="h-6 w-16 rounded-full shimmer" />
          </div>
          <div className="h-4 w-1/2 rounded shimmer mb-6" />
          <div className="grid grid-cols-2 gap-4 mb-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i}>
                <div className="h-3 w-16 rounded shimmer mb-2" />
                <div className="h-5 w-20 rounded shimmer" />
              </div>
            ))}
          </div>
          <div className="h-2 w-full rounded-full shimmer" />
        </div>
      </div>
    );
  }

  if (error || !poolInfo) {
    return (
      <div className="card p-6 border-[var(--danger)]/30">
        <div className="flex items-center gap-3 text-[var(--danger)]">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
            <path d="M12 8v4M12 16h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <span className="font-medium">Failed to load pool</span>
        </div>
        <p className="text-xs text-[var(--smoke)] mt-2 font-mono truncate">{address}</p>
      </div>
    );
  }

  const getStateBadge = (state: PoolState) => {
    const badgeClasses: Record<PoolState, string> = {
      [PoolState.OPEN]: 'badge-open',
      [PoolState.CLOSED]: 'badge-closed',
      [PoolState.NUMBERS_ASSIGNED]: 'badge-active',
      [PoolState.Q1_SCORED]: 'badge-active',
      [PoolState.Q2_SCORED]: 'badge-active',
      [PoolState.Q3_SCORED]: 'badge-active',
      [PoolState.FINAL_SCORED]: 'badge-complete',
    };

    return (
      <span className={`badge ${badgeClasses[state]}`}>
        {POOL_STATE_LABELS[state]}
      </span>
    );
  };

  const percentSold = Number(poolInfo.squaresSold);

  return (
    <Link
      href={`/pools/${address}`}
      className="card p-6 group hover:border-[var(--turf-green)]/40 transition-all duration-300 block relative overflow-hidden"
    >
      {/* Hover glow effect */}
      <div className="absolute inset-0 bg-gradient-to-br from-[var(--turf-green)]/0 to-[var(--turf-green)]/0 group-hover:from-[var(--turf-green)]/5 group-hover:to-transparent transition-all duration-300" />

      <div className="relative">
        {/* Header */}
        <div className="flex justify-between items-start mb-3">
          <div className="flex-1 min-w-0 pr-4">
            <div className="flex items-center gap-2 mb-1">
              {showOperatorBadge && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-[var(--championship-gold)]/20 text-[var(--championship-gold)] border border-[var(--championship-gold)]/30">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill="currentColor" />
                  </svg>
                  OPERATOR
                </span>
              )}
            </div>
            <h3
              className="text-xl font-bold text-[var(--chrome)] group-hover:text-[var(--turf-green)] transition-colors truncate"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {poolInfo.name}
            </h3>
          </div>
          {getStateBadge(poolInfo.state)}
        </div>

        {/* Teams */}
        <div className="flex items-center gap-2 mb-6 text-sm">
          {poolInfo.teamAName.toLowerCase().includes('patriot') && <PatriotsLogo size={20} />}
          {poolInfo.teamAName.toLowerCase().includes('seahawk') && <SeahawksLogo size={20} />}
          <span
            className="font-semibold"
            style={{
              color: poolInfo.teamAName.toLowerCase().includes('patriot') ? '#c60c30'
                : poolInfo.teamAName.toLowerCase().includes('seahawk') ? '#69be28'
                : 'var(--championship-gold)'
            }}
          >
            {poolInfo.teamAName}
          </span>
          <span className="text-[var(--smoke)]">vs</span>
          <span
            className="font-semibold"
            style={{
              color: poolInfo.teamBName.toLowerCase().includes('patriot') ? '#c60c30'
                : poolInfo.teamBName.toLowerCase().includes('seahawk') ? '#69be28'
                : 'var(--championship-gold)'
            }}
          >
            {poolInfo.teamBName}
          </span>
          {poolInfo.teamBName.toLowerCase().includes('patriot') && <PatriotsLogo size={20} />}
          {poolInfo.teamBName.toLowerCase().includes('seahawk') && <SeahawksLogo size={20} />}
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <StatItem label="Square Price" value={`${formatEther(poolInfo.squarePrice)} ETH`} />
          <StatItem label="Total Pot" value={`${formatEther(poolInfo.totalPot)} ETH`} highlight />
          <StatItem label="Squares Sold" value={`${poolInfo.squaresSold}/100`} />
          <StatItem
            label="Available"
            value={`${100 - Number(poolInfo.squaresSold)}`}
            highlight={poolInfo.state === PoolState.OPEN}
          />
        </div>

        {/* Progress bar */}
        <div className="progress-bar">
          <div
            className="progress-bar-fill"
            style={{ width: `${percentSold}%` }}
          />
        </div>

        {/* Hover indicator */}
        <div className="mt-4 flex items-center justify-end gap-2 text-sm text-[var(--smoke)] group-hover:text-[var(--turf-green)] transition-colors">
          <span>View Pool</span>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            className="transform group-hover:translate-x-1 transition-transform"
          >
            <path
              d="M5 12h14M12 5l7 7-7 7"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </div>
    </Link>
  );
}

function StatItem({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div>
      <p
        className="text-xs text-[var(--smoke)] mb-1"
        style={{ fontFamily: 'var(--font-display)', letterSpacing: '0.05em' }}
      >
        {label.toUpperCase()}
      </p>
      <p className={`font-semibold ${highlight ? 'text-[var(--turf-green)]' : 'text-[var(--chrome)]'}`}>
        {value}
      </p>
    </div>
  );
}
