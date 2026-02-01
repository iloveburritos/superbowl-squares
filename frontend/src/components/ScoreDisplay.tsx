'use client';

import { Quarter, QUARTER_LABELS, type Score } from '@/lib/contracts';
import { formatEther } from 'viem';
import { Token, formatTokenAmount, isNativeToken } from '@/config/tokens';
import { AddressDisplay } from './AddressDisplay';

interface ScoreDisplayProps {
  teamAName: string;
  teamBName: string;
  scores: {
    [Quarter.Q1]?: Score;
    [Quarter.Q2]?: Score;
    [Quarter.Q3]?: Score;
    [Quarter.FINAL]?: Score;
  };
  winners: {
    [Quarter.Q1]?: { address: `0x${string}`; payout: bigint };
    [Quarter.Q2]?: { address: `0x${string}`; payout: bigint };
    [Quarter.Q3]?: { address: `0x${string}`; payout: bigint };
    [Quarter.FINAL]?: { address: `0x${string}`; payout: bigint };
  };
  token?: Token;
  currentUserAddress?: `0x${string}`;
}

export function ScoreDisplay({ teamAName, teamBName, scores, winners, token, currentUserAddress }: ScoreDisplayProps) {
  const quarters = [Quarter.Q1, Quarter.Q2, Quarter.Q3, Quarter.FINAL];

  const tokenSymbol = token?.symbol || 'ETH';
  const formatAmount = (amount: bigint) => {
    if (!token || isNativeToken(token)) {
      return formatEther(amount);
    }
    return formatTokenAmount(amount, token.decimals);
  };

  const isCurrentUser = (addr: string) => {
    return currentUserAddress && addr.toLowerCase() === currentUserAddress.toLowerCase();
  };

  const getQuarterColor = (quarter: Quarter) => {
    switch (quarter) {
      case Quarter.Q1: return 'var(--turf-green)';
      case Quarter.Q2: return 'var(--grass-light)';
      case Quarter.Q3: return 'var(--electric-lime)';
      case Quarter.FINAL: return 'var(--championship-gold)';
    }
  };

  return (
    <div className="card p-6 relative overflow-hidden">
      {/* Background effect */}
      <div className="absolute inset-0 bg-gradient-to-br from-[var(--turf-green)]/5 to-transparent" />

      <div className="relative">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-[var(--championship-gold)]/20 border border-[var(--championship-gold)]/30 flex items-center justify-center">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-[var(--championship-gold)]">
              <path d="M12 15l-2 5l9-14h-7l2-5l-9 14h7z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <h2 className="text-xl font-bold text-[var(--chrome)]" style={{ fontFamily: 'var(--font-display)' }}>
              SCORES & WINNERS
            </h2>
            <p className="text-sm text-[var(--smoke)]">Live game results</p>
          </div>
        </div>

        {/* Team names header */}
        <div className="flex justify-center gap-8 mb-6">
          <div className="text-center">
            <span
              className="text-lg font-bold text-[var(--championship-gold)]"
              style={{ fontFamily: 'var(--font-display)', letterSpacing: '0.05em' }}
            >
              {teamAName.toUpperCase()}
            </span>
          </div>
          <div className="text-[var(--smoke)]">vs</div>
          <div className="text-center">
            <span
              className="text-lg font-bold text-[var(--championship-gold)]"
              style={{ fontFamily: 'var(--font-display)', letterSpacing: '0.05em' }}
            >
              {teamBName.toUpperCase()}
            </span>
          </div>
        </div>

        {/* Score rows */}
        <div className="space-y-3">
          {quarters.map((quarter) => {
            const score = scores[quarter];
            const winner = winners[quarter];
            const isSettled = score?.settled;
            const color = getQuarterColor(quarter);

            return (
              <div
                key={quarter}
                className={`rounded-xl p-4 transition-all ${
                  isSettled
                    ? 'bg-gradient-to-r from-[var(--steel)]/40 to-[var(--steel)]/20 border border-[var(--steel)]/30'
                    : 'bg-[var(--steel)]/20 border border-[var(--steel)]/20'
                }`}
              >
                <div className="flex items-center justify-between">
                  {/* Quarter label */}
                  <div className="flex items-center gap-3">
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: `${color}20` }}
                    >
                      <span
                        className="text-xs font-bold"
                        style={{ color: color, fontFamily: 'var(--font-display)' }}
                      >
                        {QUARTER_LABELS[quarter]}
                      </span>
                    </div>
                  </div>

                  {/* Scores */}
                  <div className="flex items-center gap-4">
                    <div className={`text-center min-w-[60px] ${isSettled ? '' : 'opacity-40'}`}>
                      <span
                        className={`text-2xl font-bold ${isSettled ? 'text-[var(--chrome)]' : 'text-[var(--smoke)]'}`}
                        style={{ fontFamily: 'var(--font-display)' }}
                      >
                        {score?.submitted ? score.teamAScore : '-'}
                      </span>
                    </div>
                    <div className="text-[var(--smoke)] text-sm">-</div>
                    <div className={`text-center min-w-[60px] ${isSettled ? '' : 'opacity-40'}`}>
                      <span
                        className={`text-2xl font-bold ${isSettled ? 'text-[var(--chrome)]' : 'text-[var(--smoke)]'}`}
                        style={{ fontFamily: 'var(--font-display)' }}
                      >
                        {score?.submitted ? score.teamBScore : '-'}
                      </span>
                    </div>
                  </div>

                  {/* Winner/Status */}
                  <div className="text-right min-w-[140px]">
                    {winner?.address && winner.address !== '0x0000000000000000000000000000000000000000' ? (
                      <div>
                        <p className={`text-sm font-medium ${isCurrentUser(winner.address) ? 'text-[var(--turf-green)]' : 'text-[var(--championship-gold)]'}`}>
                          <AddressDisplay
                            address={winner.address}
                            isMine={isCurrentUser(winner.address)}
                          />
                        </p>
                        <p className="text-xs text-[var(--smoke)]">
                          Won {formatAmount(winner.payout)} {tokenSymbol}
                        </p>
                      </div>
                    ) : score?.submitted && isSettled ? (
                      <div>
                        <p className="text-sm text-[var(--championship-gold)] font-medium">
                          No winner
                        </p>
                        <p className="text-xs text-[var(--smoke)]">
                          {quarter === Quarter.FINAL
                            ? 'Distributed to all'
                            : `${winner?.payout ? formatAmount(winner.payout) : 'Funds'} ${winner?.payout ? tokenSymbol + ' ' : ''}rolled forward`
                          }
                        </p>
                      </div>
                    ) : score?.submitted && !isSettled ? (
                      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-yellow-500/10 border border-yellow-500/30">
                        <div className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
                        <span className="text-xs text-yellow-400 font-medium">Pending</span>
                      </div>
                    ) : (
                      <span className="text-sm text-[var(--smoke)] opacity-50">Awaiting score</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

      </div>
    </div>
  );
}
