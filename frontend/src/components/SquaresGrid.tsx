'use client';

import { useState } from 'react';
import { useAccount, useEnsName } from 'wagmi';
import { formatEther } from 'viem';
import { mainnet } from 'wagmi/chains';
import { PoolState } from '@/lib/contracts';
import { PatriotsLogo, SeahawksLogo } from './Logos';
import { Token, formatTokenAmount, isNativeToken } from '@/config/tokens';

// Component to display ENS name or truncated address
function AddressDisplay({ address, isMine }: { address: `0x${string}`; isMine: boolean }) {
  const { data: ensName } = useEnsName({
    address,
    chainId: mainnet.id, // ENS is on mainnet
  });

  if (isMine) return <>YOU</>;

  if (ensName) {
    return <>{ensName}</>;
  }

  // Fallback to more of the address
  return <>{`${address.slice(0, 6)}...${address.slice(-4)}`}</>;
}

// Square button with ENS-aware tooltip
function SquareButton({
  position,
  owner,
  isOwned,
  isMine,
  canSelect,
  squarePrice,
  tokenSymbol,
  formatAmount,
  getSquareClass,
  handleSquareClick,
  setHoveredSquare,
}: {
  position: number;
  owner: `0x${string}`;
  isOwned: boolean;
  isMine: boolean;
  canSelect: boolean;
  squarePrice: bigint;
  tokenSymbol: string;
  formatAmount: (amount: bigint) => string;
  getSquareClass: (position: number) => string;
  handleSquareClick: (position: number) => void;
  setHoveredSquare: (position: number | null) => void;
}) {
  const { data: ensName } = useEnsName({
    address: isOwned ? owner : undefined,
    chainId: mainnet.id,
    query: {
      enabled: isOwned,
    },
  });

  const getTooltip = () => {
    if (!isOwned) {
      return `Square ${position} - ${formatAmount(squarePrice)} ${tokenSymbol}`;
    }
    if (ensName) {
      return `Owned by ${ensName} (${owner.slice(0, 6)}...${owner.slice(-4)})`;
    }
    return `Owned by ${owner}`;
  };

  return (
    <button
      className={getSquareClass(position)}
      onClick={() => handleSquareClick(position)}
      onMouseEnter={() => setHoveredSquare(position)}
      onMouseLeave={() => setHoveredSquare(null)}
      disabled={!canSelect}
      title={getTooltip()}
    >
      {isOwned && (
        <span className="text-[8px] font-medium px-0.5 opacity-80 leading-tight text-center overflow-hidden max-h-full break-all line-clamp-3">
          <AddressDisplay address={owner} isMine={isMine} />
        </span>
      )}
    </button>
  );
}

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
    const isMine = !!(address && owner?.toLowerCase() === address.toLowerCase());
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

  return (
    <div className="w-full max-w-3xl mx-auto">
      {/* Grid container */}
      <div className="relative">
        {/* Glow effect behind grid */}
        <div className="absolute inset-0 bg-[var(--turf-green)]/5 blur-3xl rounded-3xl" />

        <div className="relative">
          {/* Team B label (top) - Column headers */}
          <div className="flex items-end mb-3 ml-[76px]">
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
            <div className="flex items-center justify-center w-10 mr-2">
              <div className="flex items-center gap-2 -rotate-90 whitespace-nowrap">
                {showTeamLogos && (isPatriotsRow ? <PatriotsLogo size={20} /> : <SeahawksLogo size={20} />)}
                <span
                  className="text-xs font-bold tracking-wider"
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
                <div className="grid grid-rows-[repeat(10,1fr)] gap-1 w-7">
                  {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => (
                    <div
                      key={`row-${i}`}
                      className="flex items-center justify-center rounded-md bg-[var(--steel)]/20"
                    >
                      <span className="grid-number text-xs font-bold">
                        {numbersAssigned ? rowNumbers![i] : '?'}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Grid squares */}
                <div className="flex-1 grid grid-cols-10 gap-1 aspect-square">
                  {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((row) =>
                    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((col) => {
                      const position = row * 10 + col;
                      const owner = grid[position];
                      const isOwned = owner !== ZERO_ADDRESS;
                      const isMine = !!(address && owner?.toLowerCase() === address.toLowerCase());
                      const canSelect = isInteractive && state === PoolState.OPEN && !isOwned;
                      const isHovered = hoveredSquare === position;

                      return (
                        <SquareButton
                          key={`square-${position}`}
                          position={position}
                          owner={owner}
                          isOwned={isOwned}
                          isMine={isMine}
                          canSelect={canSelect}
                          squarePrice={squarePrice}
                          tokenSymbol={tokenSymbol}
                          formatAmount={formatAmount}
                          getSquareClass={getSquareClass}
                          handleSquareClick={handleSquareClick}
                          setHoveredSquare={setHoveredSquare}
                        />
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
