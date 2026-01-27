'use client';

import { useState } from 'react';
import { useAccount } from 'wagmi';
import { formatEther } from 'viem';
import { PoolState } from '@/lib/contracts';
import { PatriotsLogo, SeahawksLogo } from './Logos';
import { Token, formatTokenAmount, isNativeToken } from '@/config/tokens';

interface SquaresGridProps {
  grid: `0x${string}`[];
  rowNumbers?: number[];
  colNumbers?: number[];
  teamAName: string;
  teamBName: string;
  squarePrice: bigint;
  state: PoolState;
  selectedSquares?: number[];
  onSquareSelect?: (position: number) => void;
  winningPosition?: number;
  isInteractive?: boolean;
  token?: Token;
}

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

// Check if teams are Patriots vs Seahawks for special branding
const isPatriotsVsSeahawks = (teamA: string, teamB: string) => {
  const a = teamA.toLowerCase();
  const b = teamB.toLowerCase();
  return (a.includes('patriot') || b.includes('patriot')) &&
         (a.includes('seahawk') || b.includes('seahawk'));
};

export function SquaresGrid({
  grid,
  rowNumbers,
  colNumbers,
  teamAName,
  teamBName,
  squarePrice,
  state,
  selectedSquares = [],
  onSquareSelect,
  winningPosition,
  isInteractive = true,
  token,
}: SquaresGridProps) {
  const { address } = useAccount();
  const [hoveredSquare, setHoveredSquare] = useState<number | null>(null);

  const tokenSymbol = token?.symbol || 'ETH';
  const formatAmount = (amount: bigint) => {
    if (!token || isNativeToken(token)) {
      return formatEther(amount);
    }
    return formatTokenAmount(amount, token.decimals);
  };

  const numbersAssigned = rowNumbers && colNumbers && rowNumbers.some((n) => n !== 0);
  const showTeamLogos = isPatriotsVsSeahawks(teamAName, teamBName);
  const isPatriotsRow = teamAName.toLowerCase().includes('patriot');
  const isSeahawksRow = teamAName.toLowerCase().includes('seahawk');

  const getSquareClass = (position: number) => {
    const owner = grid[position];
    const isOwned = owner !== ZERO_ADDRESS;
    const isMine = address && owner?.toLowerCase() === address.toLowerCase();
    const isWinner = position === winningPosition;
    const isSelected = selectedSquares.includes(position);

    let className = 'square ';

    if (isWinner) {
      className += 'square-winner ';
    } else if (isMine) {
      className += 'square-mine ';
    } else if (isOwned) {
      className += 'square-owned ';
    } else {
      className += 'square-empty ';
    }

    if (isSelected) {
      className += 'square-selected ';
    }

    return className;
  };

  const handleSquareClick = (position: number) => {
    if (!isInteractive) return;
    if (state !== PoolState.OPEN) return;
    if (grid[position] !== ZERO_ADDRESS) return;

    onSquareSelect?.(position);
  };

  const truncateAddress = (addr: string) => {
    if (addr === ZERO_ADDRESS) return '';
    return `${addr.slice(0, 4)}..${addr.slice(-2)}`;
  };

  return (
    <div className="w-full max-w-3xl mx-auto">
      {/* Grid container */}
      <div className="relative">
        {/* Glow effect behind grid */}
        <div className="absolute inset-0 bg-[var(--turf-green)]/5 blur-3xl rounded-3xl" />

        <div className="relative">
          {/* Team B label (top) - Column headers */}
          <div className="flex items-end mb-3 ml-[72px]">
            <div className="flex-1 text-center">
              <div className="flex items-center justify-center gap-2">
                {showTeamLogos && (isPatriotsRow ? <SeahawksLogo size={28} /> : <PatriotsLogo size={28} />)}
                <span
                  className="text-lg font-bold tracking-wider"
                  style={{
                    fontFamily: 'var(--font-display)',
                    color: showTeamLogos ? (isPatriotsRow ? '#69be28' : '#c60c30') : 'var(--championship-gold)'
                  }}
                >
                  {teamBName.toUpperCase()}
                </span>
              </div>
              <div
                className="h-0.5 w-full mt-2"
                style={{
                  background: showTeamLogos
                    ? `linear-gradient(to right, transparent, ${isPatriotsRow ? '#69be28' : '#c60c30'}50, transparent)`
                    : 'linear-gradient(to right, transparent, var(--championship-gold)50, transparent)'
                }}
              />
            </div>
          </div>

          <div className="flex">
            {/* Team A label (left, rotated) - Row headers */}
            <div className="flex flex-col items-center justify-center w-12 mr-3">
              <div className="flex flex-col items-center justify-center h-full">
                {showTeamLogos && (
                  <div className="mb-3">
                    {isPatriotsRow ? <PatriotsLogo size={20} /> : <SeahawksLogo size={20} />}
                  </div>
                )}
                <span
                  className="text-xs font-bold tracking-wider -rotate-90 whitespace-nowrap origin-center"
                  style={{
                    fontFamily: 'var(--font-display)',
                    color: showTeamLogos ? (isPatriotsRow ? '#c60c30' : '#69be28') : 'var(--championship-gold)'
                  }}
                >
                  {teamAName.toUpperCase()}
                </span>
              </div>
            </div>

            <div className="flex-1">
              {/* Column numbers header - offset to align with grid squares */}
              <div className="flex gap-1 mb-1">
                {/* Spacer to align with row numbers column */}
                <div className="w-7 shrink-0" />
                {/* Column number cells */}
                <div className="flex-1 grid grid-cols-10 gap-1">
                  {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => (
                    <div
                      key={`col-${i}`}
                      className="flex items-center justify-center h-7 rounded-md bg-[var(--steel)]/20"
                    >
                      <span className="grid-number text-xs font-bold">
                        {numbersAssigned ? colNumbers![i] : '?'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Main grid with row numbers */}
              <div className="flex gap-1">
                {/* Row numbers column */}
                <div className="flex flex-col gap-1">
                  {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => (
                    <div
                      key={`row-${i}`}
                      className="flex items-center justify-center w-7 aspect-square rounded-md bg-[var(--steel)]/20"
                    >
                      <span className="grid-number text-xs font-bold">
                        {numbersAssigned ? rowNumbers![i] : '?'}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Grid squares */}
                <div className="flex-1 grid grid-cols-10 gap-1">
                  {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((row) =>
                    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((col) => {
                      const position = row * 10 + col;
                      const owner = grid[position];
                      const isOwned = owner !== ZERO_ADDRESS;
                      const isMine = address && owner?.toLowerCase() === address.toLowerCase();
                      const canSelect = isInteractive && state === PoolState.OPEN && !isOwned;
                      const isHovered = hoveredSquare === position;

                      return (
                        <button
                          key={`square-${position}`}
                          className={getSquareClass(position)}
                          onClick={() => handleSquareClick(position)}
                          onMouseEnter={() => setHoveredSquare(position)}
                          onMouseLeave={() => setHoveredSquare(null)}
                          disabled={!canSelect}
                          title={
                            isOwned
                              ? `Owned by ${truncateAddress(owner)}`
                              : `Square ${position} - ${formatAmount(squarePrice)} ${tokenSymbol}`
                          }
                        >
                          {isOwned && (
                            <span className="text-[9px] font-medium truncate px-0.5 opacity-80">
                              {isMine ? 'YOU' : truncateAddress(owner)}
                            </span>
                          )}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap justify-center gap-4 md:gap-8 mt-8 text-sm">
        <LegendItem color="empty" label="Available" />
        <LegendItem color="mine" label="Your Squares" />
        <LegendItem color="owned" label="Taken" />
        {selectedSquares.length > 0 && (
          <LegendItem color="selected" label="Selected" />
        )}
        {winningPosition !== undefined && (
          <LegendItem color="winner" label="Winner" />
        )}
      </div>

      {/* Hovered square info */}
      {hoveredSquare !== null && state === PoolState.OPEN && grid[hoveredSquare] === ZERO_ADDRESS && (
        <div className="mt-4 text-center">
          <p className="text-sm text-[var(--smoke)]">
            Click to select <span className="text-[var(--turf-green)] font-bold">Square #{hoveredSquare}</span>
          </p>
        </div>
      )}
    </div>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  const colorClasses: Record<string, string> = {
    empty: 'bg-[var(--grass-dark)]/30 border-[var(--turf-green)]/20',
    mine: 'bg-gradient-to-br from-[var(--turf-green)] to-[var(--grass-dark)] border-[var(--grass-light)]/60',
    owned: 'bg-[var(--steel)]/50 border-[var(--smoke)]/40',
    selected: 'bg-[var(--turf-green)]/50 ring-2 ring-white',
    winner: 'bg-gradient-to-br from-[var(--championship-gold)] to-[var(--trophy-gold)] border-[var(--floodlight)]/80',
  };

  return (
    <div className="flex items-center gap-2">
      <div className={`w-4 h-4 rounded-sm border ${colorClasses[color]}`} />
      <span className="text-[var(--smoke)] text-xs font-medium">{label}</span>
    </div>
  );
}
