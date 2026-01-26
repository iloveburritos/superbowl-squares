'use client';

import { useState } from 'react';
import { useFetchScore } from '@/hooks/useFetchScore';
import { Quarter, QUARTER_LABELS, PoolState, SCORE_SOURCES } from '@/lib/contracts';
import { PatriotsLogo, SeahawksLogo } from './Logos';

interface ScoreFetcherProps {
  poolAddress: `0x${string}`;
  poolState: PoolState;
  currentScores: {
    [key in Quarter]?: {
      teamAScore: number;
      teamBScore: number;
      settled: boolean;
    };
  };
}

export function ScoreFetcher({ poolAddress, poolState, currentScores }: ScoreFetcherProps) {
  const [selectedQuarter, setSelectedQuarter] = useState<Quarter | null>(null);
  const { fetchScore, isPending, isConfirming, isFetching, verificationResult, error } = useFetchScore(poolAddress);

  // Determine which quarter can be fetched based on state
  const getNextQuarter = (): Quarter | null => {
    if (poolState === PoolState.NUMBERS_ASSIGNED) return Quarter.Q1;
    if (poolState === PoolState.Q1_SCORED) return Quarter.Q2;
    if (poolState === PoolState.Q2_SCORED) return Quarter.Q3;
    if (poolState === PoolState.Q3_SCORED) return Quarter.FINAL;
    return null;
  };

  const nextQuarter = getNextQuarter();
  const canFetch = nextQuarter !== null && poolState >= PoolState.NUMBERS_ASSIGNED && poolState < PoolState.FINAL_SCORED;

  const handleFetch = () => {
    if (nextQuarter !== null) {
      setSelectedQuarter(nextQuarter);
      fetchScore(nextQuarter);
    }
  };

  return (
    <div className="card p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-lg bg-purple-500/20 border border-purple-500/30 flex items-center justify-center">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-purple-400">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
            <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2" />
            <path d="M12 2v4M12 18v4M2 12h4M18 12h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </div>
        <div>
          <h3 className="text-lg font-bold text-[var(--chrome)]" style={{ fontFamily: 'var(--font-display)' }}>
            LIVE SCORE VERIFICATION
          </h3>
          <p className="text-sm text-[var(--smoke)]">Scores verified from multiple sources</p>
        </div>
      </div>

      {/* Source badges */}
      <div className="flex flex-wrap gap-2 mb-6">
        {SCORE_SOURCES.map((source) => (
          <div
            key={source}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--steel)]/30 border border-[var(--steel)]/50"
          >
            <div className="w-2 h-2 rounded-full bg-[var(--turf-green)]" />
            <span className="text-xs font-medium text-[var(--smoke)]">{source}</span>
          </div>
        ))}
      </div>

      {/* Current scores display */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {[Quarter.Q1, Quarter.Q2, Quarter.Q3, Quarter.FINAL].map((q) => {
          const score = currentScores[q];
          const isSettled = score?.settled;
          const isCurrent = q === nextQuarter;

          return (
            <div
              key={q}
              className={`p-4 rounded-xl border text-center transition-all ${
                isSettled
                  ? 'bg-[var(--turf-green)]/10 border-[var(--turf-green)]/30'
                  : isCurrent
                  ? 'bg-purple-500/10 border-purple-500/30 ring-2 ring-purple-500/20'
                  : 'bg-[var(--steel)]/10 border-[var(--steel)]/30 opacity-50'
              }`}
            >
              <div
                className={`text-xs font-bold mb-2 ${
                  isSettled ? 'text-[var(--turf-green)]' : isCurrent ? 'text-purple-400' : 'text-[var(--smoke)]'
                }`}
                style={{ fontFamily: 'var(--font-display)', letterSpacing: '0.1em' }}
              >
                {QUARTER_LABELS[q]}
              </div>
              {isSettled ? (
                <div className="flex items-center justify-center gap-2">
                  <span className="text-lg font-bold text-[#c60c30]">{score.teamAScore}</span>
                  <span className="text-[var(--smoke)]">-</span>
                  <span className="text-lg font-bold text-[#69be28]">{score.teamBScore}</span>
                </div>
              ) : isCurrent ? (
                <div className="text-sm text-purple-400">Next</div>
              ) : (
                <div className="text-sm text-[var(--smoke)]">--</div>
              )}
            </div>
          );
        })}
      </div>

      {/* Verification result */}
      {verificationResult && (
        <div
          className={`p-4 rounded-xl mb-6 ${
            verificationResult.verified
              ? 'bg-[var(--turf-green)]/10 border border-[var(--turf-green)]/30'
              : 'bg-[var(--danger)]/10 border border-[var(--danger)]/30'
          }`}
        >
          <div className="flex items-center gap-3">
            {verificationResult.verified ? (
              <>
                <div className="w-8 h-8 rounded-full bg-[var(--turf-green)]/20 flex items-center justify-center">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-[var(--turf-green)]">
                    <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <div>
                  <div className="font-bold text-[var(--turf-green)]">Score Verified!</div>
                  <div className="text-sm text-[var(--smoke)]">
                    {QUARTER_LABELS[verificationResult.quarter]}: Patriots {verificationResult.patriotsScore} - Seahawks {verificationResult.seahawksScore}
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="w-8 h-8 rounded-full bg-[var(--danger)]/20 flex items-center justify-center">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-[var(--danger)]">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
                    <path d="M12 8v4M12 16h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </div>
                <div>
                  <div className="font-bold text-[var(--danger)]">Verification Failed</div>
                  <div className="text-sm text-[var(--smoke)]">Sources did not reach consensus. Try again in a few minutes.</div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Error display */}
      {error && (
        <div className="p-4 rounded-xl bg-[var(--danger)]/10 border border-[var(--danger)]/30 mb-6">
          <p className="text-[var(--danger)] text-sm">{error.message}</p>
        </div>
      )}

      {/* Fetch button */}
      {canFetch && (
        <button
          onClick={handleFetch}
          disabled={isPending || isConfirming || isFetching}
          className="w-full btn-primary py-4 text-lg"
        >
          {isPending ? (
            <span className="flex items-center justify-center gap-3">
              <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
              Confirm in Wallet...
            </span>
          ) : isConfirming ? (
            <span className="flex items-center justify-center gap-3">
              <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
              Sending Request...
            </span>
          ) : isFetching ? (
            <span className="flex items-center justify-center gap-3">
              <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
              Fetching from ESPN, Yahoo, CBS...
            </span>
          ) : (
            <span className="flex items-center justify-center gap-2">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M21 12a9 9 0 11-9-9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                <path d="M21 3v6h-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Fetch {QUARTER_LABELS[nextQuarter!]} Score
            </span>
          )}
        </button>
      )}

      {/* Info text */}
      <div className="mt-4 p-4 rounded-lg bg-[var(--steel)]/10 border border-[var(--steel)]/20">
        <div className="flex items-start gap-3">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-[var(--smoke)] mt-0.5 shrink-0">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
            <path d="M12 16v-4M12 8h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <p className="text-xs text-[var(--smoke)] leading-relaxed">
            Scores are fetched from ESPN, Yahoo Sports, and CBS Sports via Chainlink Functions.
            At least 2 out of 3 sources must agree for the score to be verified.
            Anyone can trigger a score fetch after each quarter ends.
          </p>
        </div>
      </div>
    </div>
  );
}
