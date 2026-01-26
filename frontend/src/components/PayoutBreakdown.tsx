'use client';

import { formatEther } from 'viem';
import { QUARTER_LABELS, Quarter } from '@/lib/contracts';

interface PayoutBreakdownProps {
  percentages: [number, number, number, number];
  totalPot: bigint;
}

export function PayoutBreakdown({ percentages, totalPot }: PayoutBreakdownProps) {
  const quarters = [Quarter.Q1, Quarter.Q2, Quarter.Q3, Quarter.FINAL];

  const calculatePayout = (percentage: number) => {
    return (totalPot * BigInt(percentage)) / BigInt(100);
  };

  const getQuarterStyle = (quarter: Quarter) => {
    switch (quarter) {
      case Quarter.Q1:
        return { color: 'var(--turf-green)', bg: 'var(--turf-green)' };
      case Quarter.Q2:
        return { color: 'var(--grass-light)', bg: 'var(--grass-light)' };
      case Quarter.Q3:
        return { color: 'var(--electric-lime)', bg: 'var(--electric-lime)' };
      case Quarter.FINAL:
        return { color: 'var(--championship-gold)', bg: 'var(--championship-gold)' };
    }
  };

  return (
    <div className="card p-6 relative overflow-hidden">
      {/* Background pattern */}
      <div className="absolute inset-0 opacity-5">
        <div className="absolute inset-0" style={{
          backgroundImage: `
            repeating-linear-gradient(
              45deg,
              transparent,
              transparent 10px,
              var(--turf-green) 10px,
              var(--turf-green) 11px
            )
          `,
        }} />
      </div>

      <div className="relative">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-[var(--turf-green)]/20 border border-[var(--turf-green)]/30 flex items-center justify-center">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-[var(--turf-green)]">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <h2 className="text-xl font-bold text-[var(--chrome)]" style={{ fontFamily: 'var(--font-display)' }}>
              PAYOUT STRUCTURE
            </h2>
            <p className="text-sm text-[var(--smoke)]">Prize distribution by quarter</p>
          </div>
        </div>

        {/* Visual bar */}
        <div className="relative h-6 rounded-full overflow-hidden bg-[var(--steel)]/30 mb-6">
          {quarters.map((quarter, index) => {
            const { bg } = getQuarterStyle(quarter);
            const prevWidth = percentages.slice(0, index).reduce((a, b) => a + b, 0);
            return (
              <div
                key={quarter}
                className="absolute top-0 bottom-0 transition-all duration-500"
                style={{
                  left: `${prevWidth}%`,
                  width: `${percentages[index]}%`,
                  backgroundColor: bg,
                }}
              />
            );
          })}
        </div>

        {/* Quarter cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {quarters.map((quarter, index) => {
            const { color, bg } = getQuarterStyle(quarter);
            const payout = calculatePayout(percentages[index]);

            return (
              <div
                key={quarter}
                className="relative rounded-xl p-4 text-center transition-all hover:scale-105"
                style={{
                  backgroundColor: `${bg}10`,
                  borderWidth: 1,
                  borderColor: `${bg}30`,
                }}
              >
                <div
                  className="absolute -top-2 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full text-[10px] font-bold"
                  style={{
                    backgroundColor: bg,
                    color: 'var(--midnight)',
                    fontFamily: 'var(--font-display)',
                    letterSpacing: '0.1em',
                  }}
                >
                  {QUARTER_LABELS[quarter]}
                </div>

                <div
                  className="text-3xl font-bold mt-2"
                  style={{ color, fontFamily: 'var(--font-display)' }}
                >
                  {percentages[index]}%
                </div>

                <div className="text-sm text-[var(--smoke)] mt-1">
                  {formatEther(payout)} ETH
                </div>
              </div>
            );
          })}
        </div>

        {/* Total pot */}
        <div className="mt-6 pt-6 border-t border-[var(--steel)]/30">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-[var(--championship-gold)]/20 flex items-center justify-center">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-[var(--championship-gold)]">
                  <path d="M12 2v20M17 5H9.5a3.5 3.5 0 1 0 0 7h5a3.5 3.5 0 1 1 0 7H6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <span className="text-[var(--smoke)]" style={{ fontFamily: 'var(--font-display)', letterSpacing: '0.05em' }}>
                TOTAL POT
              </span>
            </div>
            <div className="text-right">
              <span
                className="text-2xl font-bold text-[var(--chrome)]"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                {formatEther(totalPot)} ETH
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
