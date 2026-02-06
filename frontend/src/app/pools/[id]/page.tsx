'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { useAccount, useChainId, useSwitchChain } from 'wagmi';
import { formatEther, zeroAddress } from 'viem';
import { ConnectButton } from '@rainbow-me/rainbowkit';

import { SquaresGrid } from '@/components/SquaresGrid';
import { ScoreDisplay } from '@/components/ScoreDisplay';
import { PayoutBreakdown } from '@/components/PayoutBreakdown';
import { AddressDisplay } from '@/components/AddressDisplay';
import { ChatPanel } from '@/components/ChatPanel';
import { findToken, ETH_TOKEN, isNativeToken, formatTokenAmount } from '@/config/tokens';

import {
  usePoolInfo,
  usePoolGrid,
  usePoolNumbers,
  usePoolDeadlines,
  useUserSquareCount,
  useMaxSquaresPerUser,
  usePayoutPercentages,
  usePoolScore,
  usePoolWinner,
  usePoolOperator,
  useIsPrivate,
} from '@/hooks/usePool';
import { useBuySquares } from '@/hooks/useBuySquares';
import { useFinalDistributionShare, useUnclaimedInfo } from '@/hooks/useClaimPayout';
import { useVRFStatus, formatTimeRemaining } from '@/hooks/useVRFStatus';

import { PoolState, POOL_STATE_LABELS, Quarter, QUARTER_LABELS, getFactoryAddress } from '@/lib/contracts';

export default function PoolPage() {
  const params = useParams();
  const poolAddress = params.id as `0x${string}`;
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain, isPending: isSwitching } = useSwitchChain();

  const factoryAddress = getFactoryAddress(chainId);
  const isWrongNetwork = !factoryAddress || factoryAddress === '0x0000000000000000000000000000000000000000';

  // Pool data
  const { poolInfo, isLoading: infoLoading, refetch: refetchInfo } = usePoolInfo(poolAddress);
  const { grid, isLoading: gridLoading, refetch: refetchGrid } = usePoolGrid(poolAddress);
  const { rowNumbers, colNumbers, refetch: refetchNumbers } = usePoolNumbers(poolAddress);
  const { purchaseDeadline, vrfTriggerTime } = usePoolDeadlines(poolAddress);
  const { squareCount, refetch: refetchSquareCount } = useUserSquareCount(poolAddress, address);
  const { maxSquares } = useMaxSquaresPerUser(poolAddress);
  const { percentages } = usePayoutPercentages(poolAddress);
  const { operator } = usePoolOperator(poolAddress);
  const { isPrivate } = useIsPrivate(poolAddress);

  // VRF Automation status
  const { vrfStatus, timeUntilTrigger, automationStatus, refetch: refetchVRFStatus } = useVRFStatus(poolAddress);

  // Scores
  const { score: q1Score } = usePoolScore(poolAddress, Quarter.Q1);
  const { score: q2Score } = usePoolScore(poolAddress, Quarter.Q2);
  const { score: q3Score } = usePoolScore(poolAddress, Quarter.Q3);
  const { score: finalScore } = usePoolScore(poolAddress, Quarter.FINAL);

  // Winners (base payouts from contract view function)
  const { winner: q1Winner, payout: q1BasePayout } = usePoolWinner(poolAddress, Quarter.Q1);
  const { winner: q2Winner, payout: q2BasePayout } = usePoolWinner(poolAddress, Quarter.Q2);
  const { winner: q3Winner, payout: q3BasePayout } = usePoolWinner(poolAddress, Quarter.Q3);
  const { winner: finalWinner, payout: finalBasePayout } = usePoolWinner(poolAddress, Quarter.FINAL);

  // Helper to check if address is a real winner (not zero address)
  const isRealWinner = (addr: `0x${string}` | undefined) =>
    addr && addr !== '0x0000000000000000000000000000000000000000';

  // Calculate actual payouts with roll-forward logic
  // If a quarter has no winner, its payout rolls to the next quarter's winner
  const calculatePayouts = () => {
    const zero = BigInt(0);
    let accumulated = zero;

    // Q1
    const q1HasWinner = isRealWinner(q1Winner);
    let q1Actual = q1BasePayout ?? zero;
    if (q1HasWinner) {
      q1Actual = (q1BasePayout ?? zero) + accumulated;
      accumulated = zero;
    } else if (q1Score?.settled) {
      accumulated += q1BasePayout ?? zero;
    }

    // Q2 (Halftime)
    const q2HasWinner = isRealWinner(q2Winner);
    let q2Actual = q2BasePayout ?? zero;
    if (q2HasWinner) {
      q2Actual = (q2BasePayout ?? zero) + accumulated;
      accumulated = zero;
    } else if (q2Score?.settled) {
      accumulated += q2BasePayout ?? zero;
    }

    // Q3
    const q3HasWinner = isRealWinner(q3Winner);
    let q3Actual = q3BasePayout ?? zero;
    if (q3HasWinner) {
      q3Actual = (q3BasePayout ?? zero) + accumulated;
      accumulated = zero;
    } else if (q3Score?.settled) {
      accumulated += q3BasePayout ?? zero;
    }

    // Final
    const finalHasWinner = isRealWinner(finalWinner);
    let finalActual = finalBasePayout ?? zero;
    if (finalHasWinner) {
      finalActual = (finalBasePayout ?? zero) + accumulated;
    } else if (finalScore?.settled) {
      // No winner at Final - distributed to all square holders
      finalActual = (finalBasePayout ?? zero) + accumulated;
    }

    return { q1Actual, q2Actual, q3Actual, finalActual };
  };

  const { q1Actual: q1Payout, q2Actual: q2Payout, q3Actual: q3Payout, finalActual: finalPayout } = calculatePayouts();

  // State
  const [selectedSquares, setSelectedSquares] = useState<number[]>([]);
  const [poolPassword, setPoolPassword] = useState('');
  const [randomCount, setRandomCount] = useState('');
  const [showPoolPassword, setShowPoolPassword] = useState(false);

  // Success modal state
  const [showPurchaseSuccess, setShowPurchaseSuccess] = useState(false);
  const [purchasedCount, setPurchasedCount] = useState(0);
  const [purchasedCost, setPurchasedCost] = useState<bigint>(BigInt(0));

  // Share state
  const [linkCopied, setLinkCopied] = useState(false);

  // FAQ modal state
  const [showFAQ, setShowFAQ] = useState(false);


  // Countdown state
  const [countdown, setCountdown] = useState<{ days: number; hours: number; minutes: number; seconds: number } | null>(null);

  // Countdown timer effect
  useEffect(() => {
    if (!vrfTriggerTime) return;

    const updateCountdown = () => {
      const now = Math.floor(Date.now() / 1000);
      const diff = Number(vrfTriggerTime) - now;

      if (diff <= 0) {
        setCountdown(null);
        return;
      }

      const days = Math.floor(diff / (24 * 60 * 60));
      const hours = Math.floor((diff % (24 * 60 * 60)) / (60 * 60));
      const minutes = Math.floor((diff % (60 * 60)) / 60);
      const seconds = diff % 60;

      setCountdown({ days, hours, minutes, seconds });
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);

    return () => clearInterval(interval);
  }, [vrfTriggerTime]);

  // Get token info for the pool's payment token
  const paymentToken = useMemo(() => {
    if (!poolInfo?.paymentToken || !chainId) return ETH_TOKEN;
    const found = findToken(chainId, poolInfo.paymentToken);
    if (found) return found;
    // If token not found in our list, create a basic entry
    if (poolInfo.paymentToken !== zeroAddress) {
      return {
        symbol: 'TOKEN',
        name: 'Unknown Token',
        decimals: 18,
        address: poolInfo.paymentToken,
      };
    }
    return ETH_TOKEN;
  }, [poolInfo?.paymentToken, chainId]);

  const isNativePayment = isNativeToken(paymentToken);

  // Transactions
  const {
    buySquares,
    continueBuyAfterApproval,
    needsApproval,
    step: buyStep,
    isPending: isBuying,
    isConfirming: isConfirmingBuy,
    isSuccess: purchaseSuccess,
    isApproveSuccess,
    error: buyError,
    hash: purchaseHash,
    reset: resetPurchase,
  } = useBuySquares(poolAddress, poolInfo?.paymentToken);

  // Final distribution hooks (auto-distributed when Final has no winner)
  const { share: distributionShare, claimed: distributionClaimed, refetch: refetchDistributionShare } = useFinalDistributionShare(poolAddress, address);
  const { rolledAmount, distributionPool, distributionReady, refetch: refetchUnclaimedInfo } = useUnclaimedInfo(poolAddress);

  // Reset purchase state on mount to clear any stale wagmi transaction cache
  useEffect(() => {
    resetPurchase();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Show success modal when purchase completes
  useEffect(() => {
    if (purchaseSuccess) {
      // purchasedCount and purchasedCost are already set in handleBuy before transaction
      setShowPurchaseSuccess(true);
      setSelectedSquares([]); // Clear selected squares after successful purchase
      // Refetch all relevant data
      refetchGrid();
      refetchInfo();
      refetchSquareCount();
    }
  }, [purchaseSuccess, refetchGrid, refetchInfo, refetchSquareCount]);

  // After approval succeeds, continue with purchase
  // Only trigger when step is 'approving' to prevent stale state from auto-triggering
  useEffect(() => {
    if (isApproveSuccess && buyStep === 'approving' && selectedSquares.length > 0 && poolInfo?.squarePrice) {
      continueBuyAfterApproval(selectedSquares, poolInfo.squarePrice, poolPassword);
    }
  }, [isApproveSuccess, buyStep, selectedSquares, poolInfo?.squarePrice, continueBuyAfterApproval, poolPassword]);

  // Format token amount for display
  const formatAmount = (amount: bigint) => {
    if (isNativePayment) {
      return formatEther(amount);
    }
    return formatTokenAmount(amount, paymentToken.decimals);
  };

  // Computed values
  const isOperator = address?.toLowerCase() === operator?.toLowerCase();
  const canBuy = poolInfo?.state === PoolState.OPEN && isConnected;
  const remainingSquares = maxSquares && squareCount !== undefined
    ? maxSquares - squareCount
    : undefined;

  // Get available (unsold) squares
  const availableSquares = useMemo(() => {
    if (!grid) return [];
    const available: number[] = [];
    for (let i = 0; i < grid.length; i++) {
      if (!grid[i] || grid[i] === '0x0000000000000000000000000000000000000000') {
        available.push(i);
      }
    }
    return available;
  }, [grid]);

  // Calculate max squares user can select (limited by remaining allowance and available squares)
  const maxSelectableSquares = useMemo(() => {
    const availableCount = availableSquares.length;
    if (remainingSquares !== undefined && maxSquares !== undefined && maxSquares > 0) {
      return Math.min(remainingSquares, availableCount);
    }
    return availableCount;
  }, [availableSquares.length, remainingSquares, maxSquares]);

  // Handle random square selection
  const handleRandomSelect = () => {
    const count = parseInt(randomCount);
    if (isNaN(count) || count <= 0) return;

    // Limit to what user can actually select (respecting max squares per user)
    const maxToSelect = remainingSquares !== undefined && maxSquares !== undefined && maxSquares > 0
      ? Math.min(count, remainingSquares, availableSquares.length)
      : Math.min(count, availableSquares.length);

    if (maxToSelect <= 0) return;

    // Fisher-Yates shuffle and take first N
    const shuffled = [...availableSquares];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    const randomPicks = shuffled.slice(0, maxToSelect);
    // Replace selection entirely instead of adding to it
    setSelectedSquares(randomPicks);
    setRandomCount('');
  };

  const totalCost = poolInfo
    ? poolInfo.squarePrice * BigInt(selectedSquares.length)
    : BigInt(0);

  // Calculate user's numbers based on their squares and assigned row/col numbers
  const userNumbers = useMemo(() => {
    if (!grid || !rowNumbers || !colNumbers || !address) return [];

    const numbers: { row: number; col: number; position: number }[] = [];
    for (let i = 0; i < grid.length; i++) {
      if (grid[i]?.toLowerCase() === address.toLowerCase()) {
        const row = Math.floor(i / 10);
        const col = i % 10;
        numbers.push({
          row: rowNumbers[row],
          col: colNumbers[col],
          position: i,
        });
      }
    }
    return numbers;
  }, [grid, rowNumbers, colNumbers, address]);

  // Handle square selection
  const handleSquareSelect = (position: number) => {
    setSelectedSquares((prev) => {
      if (prev.includes(position)) {
        return prev.filter((p) => p !== position);
      }
      // Check max squares limit
      if (remainingSquares !== undefined && prev.length >= remainingSquares) {
        return prev;
      }
      return [...prev, position];
    });
  };

  // Handle purchase
  const handleBuy = async () => {
    if (selectedSquares.length === 0 || !poolInfo) return;

    // Save purchase info BEFORE transaction starts (for success modal)
    setPurchasedCount(selectedSquares.length);
    setPurchasedCost(poolInfo.squarePrice * BigInt(selectedSquares.length));

    // If we just completed approval and user clicks again, continue with buy
    if (isApproveSuccess && buyStep === 'approving') {
      await continueBuyAfterApproval(selectedSquares, poolInfo.squarePrice, poolPassword);
      return;
    }

    await buySquares(selectedSquares, poolInfo.squarePrice, poolPassword);
    // Don't clear squares here - they need to stay selected for ERC20 approve->buy flow
    // Squares are cleared when purchaseSuccess fires
  };

  // Format date
  const formatDeadline = (timestamp: bigint | undefined) => {
    if (!timestamp) return 'N/A';
    const date = new Date(Number(timestamp) * 1000);
    return date.toLocaleString();
  };

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

  // Loading state
  if (infoLoading || gridLoading) {
    return (
      <div className="min-h-screen">
        <div className="relative py-16 overflow-hidden">
          <div className="absolute inset-0">
            <div className="absolute top-0 left-1/4 w-96 h-96 bg-[var(--turf-green)]/10 rounded-full blur-[128px]" />
          </div>
          <div className="container mx-auto px-6 relative">
            <div className="animate-pulse">
              <div className="h-10 w-64 rounded-lg shimmer mb-4" />
              <div className="h-6 w-48 rounded shimmer" />
            </div>
          </div>
        </div>
        <div className="container mx-auto px-6 pb-16">
          <div className="grid lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2">
              <div className="card p-6">
                <div className="animate-pulse">
                  <div className="aspect-square rounded-xl shimmer" />
                </div>
              </div>
            </div>
            <div className="space-y-6">
              {[1, 2, 3].map((i) => (
                <div key={i} className="card p-6">
                  <div className="animate-pulse">
                    <div className="h-6 w-32 rounded shimmer mb-4" />
                    <div className="space-y-3">
                      {[1, 2, 3].map((j) => (
                        <div key={j} className="h-4 w-full rounded shimmer" />
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (isWrongNetwork) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="card p-12 text-center max-w-md">
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
            Super Bowl Squares is deployed on Base and Arbitrum. Please switch networks to view this pool.
          </p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => switchChain({ chainId: 8453 })}
              disabled={isSwitching}
              className="btn-primary"
            >
              {isSwitching ? 'Switching...' : 'Switch to Base'}
            </button>
            <button
              onClick={() => switchChain({ chainId: 42161 })}
              disabled={isSwitching}
              className="btn-secondary"
            >
              {isSwitching ? 'Switching...' : 'Switch to Arbitrum'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!poolInfo || !grid) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="card p-12 text-center max-w-md">
          <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-[var(--danger)]/10 flex items-center justify-center">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" className="text-[var(--danger)]">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
              <path d="M12 8v4M12 16h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-[var(--chrome)] mb-2" style={{ fontFamily: 'var(--font-display)' }}>
            POOL NOT FOUND
          </h2>
          <p className="text-[var(--smoke)]">
            This pool doesn't exist or failed to load.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Countdown Banner */}
      {countdown && poolInfo.state === PoolState.OPEN && (
        <div className="relative py-4 overflow-hidden bg-gradient-to-r from-[var(--midnight)] via-[var(--turf-green)]/10 to-[var(--midnight)] border-b border-[var(--turf-green)]/20">
          <div className="container mx-auto px-6 relative text-center">
            <p className="text-xs text-[var(--smoke)] mb-2 tracking-widest" style={{ fontFamily: 'var(--font-display)' }}>
              NUMBERS REVEALED IN
            </p>
            <div className="flex items-center justify-center gap-2 md:gap-4">
              <div className="text-center">
                <div className="text-2xl md:text-3xl font-bold text-[var(--chrome)] tabular-nums" style={{ fontFamily: 'var(--font-display)' }}>
                  {countdown.days.toString().padStart(2, '0')}
                </div>
                <div className="text-[10px] text-[var(--smoke)] tracking-wider">DAYS</div>
              </div>
              <div className="text-xl md:text-2xl font-bold text-[var(--turf-green)]">:</div>
              <div className="text-center">
                <div className="text-2xl md:text-3xl font-bold text-[var(--chrome)] tabular-nums" style={{ fontFamily: 'var(--font-display)' }}>
                  {countdown.hours.toString().padStart(2, '0')}
                </div>
                <div className="text-[10px] text-[var(--smoke)] tracking-wider">HRS</div>
              </div>
              <div className="text-xl md:text-2xl font-bold text-[var(--turf-green)]">:</div>
              <div className="text-center">
                <div className="text-2xl md:text-3xl font-bold text-[var(--chrome)] tabular-nums" style={{ fontFamily: 'var(--font-display)' }}>
                  {countdown.minutes.toString().padStart(2, '0')}
                </div>
                <div className="text-[10px] text-[var(--smoke)] tracking-wider">MIN</div>
              </div>
              <div className="text-xl md:text-2xl font-bold text-[var(--turf-green)]">:</div>
              <div className="text-center">
                <div className="text-2xl md:text-3xl font-bold text-[var(--championship-gold)] tabular-nums" style={{ fontFamily: 'var(--font-display)' }}>
                  {countdown.seconds.toString().padStart(2, '0')}
                </div>
                <div className="text-[10px] text-[var(--smoke)] tracking-wider">SEC</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Header section */}
      <div className="relative py-12 overflow-hidden">
        {/* Background effects */}
        <div className="absolute inset-0">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-[var(--turf-green)]/10 rounded-full blur-[128px]" />
          <div className="absolute bottom-0 right-1/4 w-64 h-64 bg-[var(--championship-gold)]/5 rounded-full blur-[96px]" />
        </div>

        <div className="container mx-auto px-6 relative">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                {getStateBadge(poolInfo.state)}
                {isPrivate && (
                  <span className="badge bg-[var(--championship-gold)]/20 text-[var(--championship-gold)] border-[var(--championship-gold)]/30 flex items-center gap-1">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                      <rect x="3" y="11" width="18" height="11" rx="2" stroke="currentColor" strokeWidth="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                    Private
                  </span>
                )}
                {isOperator && (
                  <span className="badge bg-purple-500/20 text-purple-300 border-purple-500/30">
                    Operator
                  </span>
                )}
              </div>
              <h1
                className="text-3xl md:text-4xl font-bold text-[var(--chrome)] mb-2"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                {poolInfo.name.toUpperCase()}
              </h1>
              <p className="text-lg">
                <span className="font-bold text-[var(--championship-gold)]">{poolInfo.teamAName}</span>
                <span className="text-[var(--smoke)] mx-3">vs</span>
                <span className="font-bold text-[var(--championship-gold)]">{poolInfo.teamBName}</span>
              </p>
              {operator && (
                <p className="text-sm text-[var(--smoke)] mt-2">
                  Created by{' '}
                  <span className="text-[var(--chrome)]">
                    <AddressDisplay address={operator} />
                  </span>
                </p>
              )}
            </div>

            {/* Quick stats */}
            <div className="flex items-center gap-4 md:gap-6">
              <div className="text-center">
                <p className="text-xs text-[var(--smoke)] mb-1" style={{ fontFamily: 'var(--font-display)', letterSpacing: '0.1em' }}>
                  TOTAL POT
                </p>
                <p className="text-2xl font-bold text-[var(--turf-green)]" style={{ fontFamily: 'var(--font-display)' }}>
                  {formatAmount(poolInfo.totalPot)} {paymentToken.symbol}
                </p>
              </div>
              <div className="w-px h-12 bg-[var(--steel)]/30" />
              <div className="text-center">
                <p className="text-xs text-[var(--smoke)] mb-1" style={{ fontFamily: 'var(--font-display)', letterSpacing: '0.1em' }}>
                  SQUARES SOLD
                </p>
                <p className="text-2xl font-bold text-[var(--chrome)]" style={{ fontFamily: 'var(--font-display)' }}>
                  {poolInfo.squaresSold.toString()}/100
                </p>
              </div>
              <div className="w-px h-12 bg-[var(--steel)]/30 hidden md:block" />
              <button
                onClick={() => setShowFAQ(true)}
                className="hidden md:flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--steel)]/20 border border-[var(--steel)]/30 hover:bg-[var(--steel)]/30 transition-colors text-sm text-[var(--smoke)] hover:text-[var(--chrome)]"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
                  <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3M12 17h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                How It Works
              </button>
            </div>
          </div>
          {/* Mobile FAQ button */}
          <button
            onClick={() => setShowFAQ(true)}
            className="md:hidden flex items-center justify-center gap-2 mt-4 px-4 py-2 rounded-lg bg-[var(--steel)]/20 border border-[var(--steel)]/30 text-sm text-[var(--smoke)]"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
              <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3M12 17h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            How It Works
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-6 pb-16">
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Main Grid */}
          <div className="lg:col-span-2 space-y-6">
            <div className="card p-6">
              <SquaresGrid
                grid={grid}
                rowNumbers={rowNumbers}
                colNumbers={colNumbers}
                teamAName={poolInfo.teamAName}
                teamBName={poolInfo.teamBName}
                squarePrice={poolInfo.squarePrice}
                state={poolInfo.state}
                selectedSquares={selectedSquares}
                onSquareSelect={handleSquareSelect}
                isInteractive={canBuy}
                token={paymentToken}
              />
            </div>

            {/* Purchase Panel */}
            {poolInfo.state === PoolState.OPEN && (
              <div className="card p-6 relative overflow-hidden">
                {/* Background */}
                <div className="absolute inset-0 bg-gradient-to-r from-[var(--turf-green)]/5 to-transparent" />

                <div className="relative">
                  {!isConnected ? (
                    <div className="text-center py-4">
                      <p className="text-[var(--smoke)] mb-4">
                        Connect your wallet to buy squares
                      </p>
                      <ConnectButton />
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {/* Password input for private pools */}
                      {isPrivate && (
                        <div className="flex items-center gap-4 p-4 rounded-xl bg-[var(--championship-gold)]/10 border border-[var(--championship-gold)]/30">
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-[var(--championship-gold)] shrink-0">
                            <rect x="3" y="11" width="18" height="11" rx="2" stroke="currentColor" strokeWidth="2" />
                            <path d="M7 11V7a5 5 0 0 1 10 0v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                          </svg>
                          <div className="flex-1">
                            <label className="block text-sm font-medium text-[var(--championship-gold)] mb-1">
                              Pool Password Required
                            </label>
                            <div className="relative">
                              <input
                                type={showPoolPassword ? 'text' : 'password'}
                                value={poolPassword}
                                onChange={(e) => setPoolPassword(e.target.value)}
                                placeholder="Enter pool password"
                                className="w-full px-3 py-2 pr-10 rounded-lg bg-[var(--midnight)] border border-[var(--steel)]/50 text-[var(--chrome)] placeholder-[var(--smoke)] focus:outline-none focus:border-[var(--championship-gold)]/50"
                              />
                              <button
                                type="button"
                                onClick={() => setShowPoolPassword(!showPoolPassword)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--smoke)] hover:text-[var(--chrome)] transition-colors"
                              >
                                {showPoolPassword ? (
                                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                                    <line x1="1" y1="1" x2="23" y2="23" />
                                  </svg>
                                ) : (
                                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                    <circle cx="12" cy="12" r="3" />
                                  </svg>
                                )}
                              </button>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Quick Pick Section */}
                      <div className="mb-6 p-4 rounded-xl bg-[var(--steel)]/10 border border-[var(--steel)]/30">
                        <div className="flex items-center gap-3 mb-3">
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="text-[var(--championship-gold)]">
                            <path d="M19.5 12c0 4.14-3.36 7.5-7.5 7.5S4.5 16.14 4.5 12 7.86 4.5 12 4.5s7.5 3.36 7.5 7.5z" stroke="currentColor" strokeWidth="2"/>
                            <path d="M12 8v4l2 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                            <path d="M3 3l3 3M21 3l-3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                          </svg>
                          <span className="text-sm font-medium text-[var(--chrome)]">Quick Pick</span>
                          <span className="text-xs text-[var(--smoke)]">({availableSquares.length} available)</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <input
                            type="number"
                            min="1"
                            max={maxSelectableSquares - selectedSquares.length}
                            value={randomCount}
                            onChange={(e) => setRandomCount(e.target.value)}
                            placeholder="# of squares"
                            className="flex-1 px-4 py-2 rounded-lg bg-[var(--midnight)] border border-[var(--steel)]/50 text-[var(--chrome)] placeholder:text-[var(--steel)] focus:outline-none focus:border-[var(--turf-green)] text-center"
                          />
                          <button
                            type="button"
                            onClick={handleRandomSelect}
                            disabled={!randomCount || parseInt(randomCount) <= 0 || availableSquares.length === 0}
                            className="px-4 py-2 rounded-lg bg-[var(--championship-gold)]/20 border border-[var(--championship-gold)]/40 text-[var(--championship-gold)] font-medium text-sm hover:bg-[var(--championship-gold)]/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                          >
                            Random Select
                          </button>
                          {selectedSquares.length > 0 && (
                            <button
                              type="button"
                              onClick={() => setSelectedSquares([])}
                              className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm hover:bg-red-500/20 transition-colors"
                            >
                              Clear
                            </button>
                          )}
                        </div>
                        {maxSquares !== undefined && maxSquares > 0 && (
                          <p className="text-xs text-[var(--smoke)] mt-2">
                            Max {maxSelectableSquares - selectedSquares.length} more squares
                          </p>
                        )}
                      </div>

                      <div className="flex flex-col md:flex-row justify-between items-center gap-6">
                        <div className="flex items-center gap-6">
                          <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-[var(--turf-green)]/20 to-[var(--turf-green)]/5 border border-[var(--turf-green)]/30 flex items-center justify-center">
                            <span className="text-2xl font-bold text-[var(--turf-green)]" style={{ fontFamily: 'var(--font-display)' }}>
                              {selectedSquares.length}
                            </span>
                          </div>
                          <div>
                            <p className="text-lg font-medium text-[var(--chrome)]">
                              Squares Selected
                            </p>
                            <p className="text-[var(--turf-green)] font-bold text-xl">
                              {formatAmount(totalCost)} {paymentToken.symbol}
                            </p>
                            {remainingSquares !== undefined && maxSquares !== undefined && maxSquares > 0 && (
                              remainingSquares === 0 ? (
                                <p className="text-sm text-[var(--championship-gold)] font-medium">
                                  You've reached the max ({maxSquares} squares)
                                </p>
                              ) : (
                                <p className="text-sm text-[var(--smoke)]">
                                  You can buy {remainingSquares} more (max {maxSquares})
                                </p>
                              )
                            )}
                          </div>
                        </div>
                      <button
                        onClick={handleBuy}
                        disabled={selectedSquares.length === 0 || isBuying || isConfirmingBuy || (isPrivate && !poolPassword)}
                        className="btn-primary px-8 py-4 text-lg disabled:opacity-40"
                      >
                        {buyStep === 'approving' && isBuying ? (
                          <span className="flex items-center gap-3">
                            <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                            Approve {paymentToken.symbol}...
                          </span>
                        ) : buyStep === 'approving' && isConfirmingBuy ? (
                          <span className="flex items-center gap-3">
                            <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                            Approving...
                          </span>
                        ) : buyStep === 'approving' && isApproveSuccess ? (
                          <span className="flex items-center gap-2">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                              <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
                            </svg>
                            Buy {selectedSquares.length} Squares
                          </span>
                        ) : isBuying ? (
                          <span className="flex items-center gap-3">
                            <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                            Confirm in Wallet...
                          </span>
                        ) : isConfirmingBuy ? (
                          <span className="flex items-center gap-3">
                            <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                            Buying...
                          </span>
                        ) : !isNativePayment && needsApproval(totalCost) && selectedSquares.length > 0 ? (
                          <span className="flex items-center gap-2">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                              <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
                            </svg>
                            Approve & Buy {selectedSquares.length} Squares
                          </span>
                        ) : (
                          <span className="flex items-center gap-2">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                              <path d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                              <circle cx="8" cy="21" r="1" stroke="currentColor" strokeWidth="2" />
                              <circle cx="16" cy="21" r="1" stroke="currentColor" strokeWidth="2" />
                            </svg>
                            Buy {selectedSquares.length} Squares
                          </span>
                        )}
                      </button>
                      </div>
                    </div>
                  )}
                  {buyError && (
                    <p className="text-[var(--danger)] mt-4 text-sm p-3 rounded-lg bg-[var(--danger)]/10 border border-[var(--danger)]/30">
                      {buyError.message}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Your Numbers Display */}
            {poolInfo.state >= PoolState.NUMBERS_ASSIGNED && userNumbers.length > 0 && (
              <div className="card p-6 relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-[var(--championship-gold)]/5 to-transparent" />
                <div className="relative">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-lg bg-[var(--championship-gold)]/20 border border-[var(--championship-gold)]/30 flex items-center justify-center">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-[var(--championship-gold)]">
                        <path d="M4 4h4v4H4zM4 10h4v4H4zM4 16h4v4H4zM10 4h4v4h-4zM10 10h4v4h-4zM10 16h4v4h-4zM16 4h4v4h-4zM16 10h4v4h-4zM16 16h4v4h-4z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-[var(--chrome)]" style={{ fontFamily: 'var(--font-display)' }}>
                        YOUR NUMBERS
                      </h2>
                      <p className="text-sm text-[var(--smoke)]">
                        You win if the last digit of each score matches
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {userNumbers.map(({ row, col, position }) => (
                      <div
                        key={position}
                        className="px-4 py-3 rounded-xl bg-gradient-to-r from-[var(--championship-gold)]/20 to-[var(--championship-gold)]/10 border border-[var(--championship-gold)]/30"
                      >
                        <div className="flex items-center gap-3">
                          <div className="text-center">
                            <p className="text-xs text-[var(--smoke)] mb-1">{poolInfo.teamAName}</p>
                            <p className="text-2xl font-bold text-white" style={{ fontFamily: 'var(--font-display)' }}>
                              {row}
                            </p>
                          </div>
                          <span className="text-[var(--smoke)] text-lg">-</span>
                          <div className="text-center">
                            <p className="text-xs text-[var(--smoke)] mb-1">{poolInfo.teamBName}</p>
                            <p className="text-2xl font-bold text-white" style={{ fontFamily: 'var(--font-display)' }}>
                              {col}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Scores Display */}
            {poolInfo.state >= PoolState.NUMBERS_ASSIGNED && (
              <ScoreDisplay
                teamAName={poolInfo.teamAName}
                teamBName={poolInfo.teamBName}
                scores={{
                  [Quarter.Q1]: q1Score,
                  [Quarter.Q2]: q2Score,
                  [Quarter.Q3]: q3Score,
                  [Quarter.FINAL]: finalScore,
                }}
                winners={{
                  [Quarter.Q1]: q1Winner && q1Payout ? { address: q1Winner, payout: q1Payout } : undefined,
                  [Quarter.Q2]: q2Winner && q2Payout ? { address: q2Winner, payout: q2Payout } : undefined,
                  [Quarter.Q3]: q3Winner && q3Payout ? { address: q3Winner, payout: q3Payout } : undefined,
                  [Quarter.FINAL]: finalWinner && finalPayout ? { address: finalWinner, payout: finalPayout } : undefined,
                }}
                token={paymentToken}
                currentUserAddress={address}
              />
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Numbers Assigned Status */}
            {poolInfo.state >= PoolState.NUMBERS_ASSIGNED && (
              <div className="card p-6 border-[var(--turf-green)]/30 bg-gradient-to-br from-[var(--turf-green)]/5 to-transparent">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-[var(--turf-green)]/20 border border-[var(--turf-green)]/30 flex items-center justify-center">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-[var(--turf-green)]">
                      <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-[var(--turf-green)]" style={{ fontFamily: 'var(--font-display)' }}>
                      NUMBERS ASSIGNED
                    </h2>
                    <p className="text-xs text-[var(--smoke)]">Pool is ready for the game!</p>
                  </div>
                </div>
              </div>
            )}

            {/* Pool Info */}
            <div className="card p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-lg bg-[var(--turf-green)]/20 border border-[var(--turf-green)]/30 flex items-center justify-center">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-[var(--turf-green)]">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
                    <path d="M12 6v6l4 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </div>
                <h2 className="text-xl font-bold text-[var(--chrome)]" style={{ fontFamily: 'var(--font-display)' }}>
                  POOL DETAILS
                </h2>
              </div>

              <dl className="space-y-4">
                <div className="flex justify-between items-center py-2 border-b border-[var(--steel)]/20">
                  <dt className="text-[var(--smoke)]">Payment Token</dt>
                  <dd className="font-bold text-[var(--chrome)]">
                    {paymentToken.symbol}
                  </dd>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-[var(--steel)]/20">
                  <dt className="text-[var(--smoke)]">Square Price</dt>
                  <dd className="font-bold text-[var(--chrome)]">
                    {formatAmount(poolInfo.squarePrice)} {paymentToken.symbol}
                  </dd>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-[var(--steel)]/20">
                  <dt className="text-[var(--smoke)]">Total Pot</dt>
                  <dd className="font-bold text-[var(--turf-green)]">
                    {formatAmount(poolInfo.totalPot)} {paymentToken.symbol}
                  </dd>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-[var(--steel)]/20">
                  <dt className="text-[var(--smoke)]">Squares Sold</dt>
                  <dd className="font-bold text-[var(--chrome)]">
                    {poolInfo.squaresSold.toString()}/100
                  </dd>
                </div>
                {squareCount !== undefined && (
                  <div className="flex justify-between items-center py-2 border-b border-[var(--steel)]/20">
                    <dt className="text-[var(--smoke)]">Your Squares</dt>
                    <dd className="font-bold text-[var(--championship-gold)]">{squareCount}</dd>
                  </div>
                )}
                <div className="flex justify-between items-center py-2">
                  <dt className="text-[var(--smoke)]">Max Per User</dt>
                  <dd className="font-bold text-[var(--chrome)]">
                    {maxSquares === 0 ? 'Unlimited' : maxSquares}
                  </dd>
                </div>
              </dl>
            </div>

            {/* Deadlines */}
            <div className="card p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-lg bg-[var(--championship-gold)]/20 border border-[var(--championship-gold)]/30 flex items-center justify-center">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-[var(--championship-gold)]">
                    <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2" />
                    <path d="M16 2v4M8 2v4M3 10h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </div>
                <h2 className="text-xl font-bold text-[var(--chrome)]" style={{ fontFamily: 'var(--font-display)' }}>
                  DEADLINES
                </h2>
              </div>

              <dl className="space-y-4">
                <div className="p-4 rounded-xl bg-[var(--steel)]/10 border border-[var(--steel)]/20">
                  <dt className="text-xs text-[var(--smoke)] mb-1" style={{ fontFamily: 'var(--font-display)', letterSpacing: '0.1em' }}>
                    PURCHASE DEADLINE
                  </dt>
                  <dd className="font-medium text-[var(--chrome)]">{formatDeadline(purchaseDeadline)}</dd>
                </div>
                {purchaseDeadline !== vrfTriggerTime && (
                  <div className="p-4 rounded-xl bg-[var(--steel)]/10 border border-[var(--steel)]/20">
                    <dt className="text-xs text-[var(--smoke)] mb-1" style={{ fontFamily: 'var(--font-display)', letterSpacing: '0.1em' }}>
                      NUMBERS ASSIGNED AT
                    </dt>
                    <dd className="font-medium text-[var(--chrome)]">{formatDeadline(vrfTriggerTime)}</dd>
                  </div>
                )}
              </dl>
            </div>

            {/* Payout Breakdown */}
            {percentages && (
              <PayoutBreakdown
                percentages={percentages}
                totalPot={poolInfo.totalPot}
                token={paymentToken}
              />
            )}


            {/* Payout Status */}
            {poolInfo.state >= PoolState.Q1_SCORED && (
              <div className="card p-6">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-lg bg-[var(--championship-gold)]/20 border border-[var(--championship-gold)]/30 flex items-center justify-center">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-[var(--championship-gold)]">
                      <path d="M12 2v20M17 5H9.5a3.5 3.5 0 1 0 0 7h5a3.5 3.5 0 1 1 0 7H6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <h2 className="text-xl font-bold text-[var(--chrome)]" style={{ fontFamily: 'var(--font-display)' }}>
                    PAYOUTS
                  </h2>
                </div>

                <div className="space-y-3">
                  {[
                    { quarter: Quarter.Q1, winner: q1Winner, payout: q1Payout, minState: PoolState.Q1_SCORED, color: 'var(--turf-green)' },
                    { quarter: Quarter.Q2, winner: q2Winner, payout: q2Payout, minState: PoolState.Q2_SCORED, color: 'var(--grass-light)' },
                    { quarter: Quarter.Q3, winner: q3Winner, payout: q3Payout, minState: PoolState.Q3_SCORED, color: 'var(--electric-lime)' },
                    { quarter: Quarter.FINAL, winner: finalWinner, payout: finalPayout, minState: PoolState.FINAL_SCORED, color: 'var(--championship-gold)' },
                  ].map(({ quarter, winner, payout, minState, color }) => {
                    const isScored = poolInfo.state >= minState;
                    const hasWinner = winner && winner !== '0x0000000000000000000000000000000000000000';
                    const isYou = winner?.toLowerCase() === address?.toLowerCase();

                    if (!isScored) return null;

                    return (
                      <div
                        key={quarter}
                        className="w-full py-3 px-4 rounded-xl bg-[var(--steel)]/20 border border-[var(--steel)]/30"
                      >
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-2">
                            <span
                              className="w-8 h-6 rounded-md flex items-center justify-center text-[10px] font-bold"
                              style={{ backgroundColor: `${color}20`, color }}
                            >
                              {QUARTER_LABELS[quarter]}
                            </span>
                            {hasWinner ? (
                              <span className="text-sm">
                                <span className="text-[var(--smoke)]">Paid to </span>
                                <AddressDisplay
                                  address={winner as `0x${string}`}
                                  isMine={isYou}
                                  className={isYou ? 'text-[var(--turf-green)] font-medium' : 'text-[var(--championship-gold)] font-medium'}
                                />
                              </span>
                            ) : (
                              <span className="text-sm text-[var(--smoke)]">No winner (rolled forward)</span>
                            )}
                          </span>
                          {hasWinner && payout && (
                            <span className="text-sm font-medium text-white">
                              {formatAmount(payout)} {paymentToken.symbol}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {/* Final Distribution - shown when Final had no winner and funds were auto-distributed */}
                  {distributionReady && distributionShare && distributionShare > BigInt(0) && distributionClaimed && (
                    <div className="mt-4 pt-4 border-t border-[var(--steel)]/20">
                      <div className="p-4 rounded-xl bg-gradient-to-r from-purple-500/10 to-purple-500/5 border border-purple-500/30">
                        <div className="flex items-center gap-2 mb-2">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-purple-400">
                            <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                          <span className="text-sm font-medium text-purple-300">Pool Distribution Complete</span>
                        </div>
                        <p className="text-xs text-[var(--smoke)] mb-2">
                          No winner for Final quarter. All funds were automatically distributed equally per square.
                        </p>
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-[var(--smoke)]">Your Share (Received)</span>
                          <span className="text-lg font-bold text-purple-400">
                            {formatAmount(distributionShare)} {paymentToken.symbol}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Show rolled amount info if any quarters have no winner */}
                  {rolledAmount && rolledAmount > BigInt(0) && poolInfo.state < PoolState.FINAL_SCORED && (
                    <div className="mt-4 pt-4 border-t border-[var(--steel)]/20">
                      <div className="p-3 rounded-lg bg-[var(--championship-gold)]/10 border border-[var(--championship-gold)]/30">
                        <div className="flex items-center gap-2 text-sm text-[var(--championship-gold)]">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                            <path d="M12 2v20M17 5H9.5a3.5 3.5 0 1 0 0 7h5a3.5 3.5 0 1 1 0 7H6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                          <span className="font-medium">
                            {formatAmount(rolledAmount)} {paymentToken.symbol} rolling to next quarter
                          </span>
                        </div>
                        <p className="text-xs text-[var(--smoke)] mt-1">
                          Unclaimed winnings roll forward to the next winner
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Share Pool */}
            <div className="card p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-lg bg-[var(--electric-lime)]/20 border border-[var(--electric-lime)]/30 flex items-center justify-center">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-[var(--electric-lime)]">
                    <circle cx="18" cy="5" r="3" stroke="currentColor" strokeWidth="2" />
                    <circle cx="6" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
                    <circle cx="18" cy="19" r="3" stroke="currentColor" strokeWidth="2" />
                    <path d="M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98" stroke="currentColor" strokeWidth="2" />
                  </svg>
                </div>
                <h2 className="text-xl font-bold text-[var(--chrome)]" style={{ fontFamily: 'var(--font-display)' }}>
                  SHARE POOL
                </h2>
              </div>

              <p className="text-sm text-[var(--smoke)] mb-4">
                Invite friends to join and fill more squares!
              </p>

              <div className="space-y-3">
                <button
                  onClick={async () => {
                    const url = typeof window !== 'undefined' ? window.location.href : '';
                    await navigator.clipboard.writeText(url);
                    setLinkCopied(true);
                    setTimeout(() => setLinkCopied(false), 2000);
                  }}
                  className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-[var(--steel)]/30 border border-[var(--steel)]/50 hover:bg-[var(--steel)]/50 transition-colors text-sm"
                >
                  {linkCopied ? (
                    <>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      <span className="text-[var(--turf-green)]">Link Copied!</span>
                    </>
                  ) : (
                    <>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                      </svg>
                      <span>Copy Pool Link</span>
                    </>
                  )}
                </button>
                <button
                  onClick={() => {
                    const url = typeof window !== 'undefined' ? window.location.href : '';
                    // Replace dots with " dot " to avoid Twitter algorithm deboosting links
                    const obfuscatedUrl = url.replace(/\./g, ' dot ');
                    const text = `Join my Super Bowl Squares pool "${poolInfo?.name || 'Pool'}" 🏈🏆\n\n${obfuscatedUrl}`;
                    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
                    window.open(twitterUrl, '_blank', 'width=600,height=400');
                  }}
                  className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-[#1DA1F2]/20 border border-[#1DA1F2]/50 hover:bg-[#1DA1F2]/30 transition-colors text-sm text-[#1DA1F2]"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                  </svg>
                  <span>Share on X</span>
                </button>
                <button
                  onClick={() => {
                    const url = typeof window !== 'undefined' ? window.location.href : '';
                    const text = `Join my Super Bowl Squares pool "${poolInfo?.name || 'Pool'}" 🏈🏆\n\n${url}`;
                    const farcasterUrl = `https://warpcast.com/~/compose?text=${encodeURIComponent(text)}`;
                    window.open(farcasterUrl, '_blank', 'width=600,height=700');
                  }}
                  className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-[#8465CB]/20 border border-[#8465CB]/50 hover:bg-[#8465CB]/30 transition-colors text-sm text-[#8465CB]"
                >
                  <svg width="16" height="16" viewBox="0 0 1000 1000" fill="currentColor">
                    <path d="M257.778 155.556H742.222V844.444H671.111V528.889H670.414C662.554 441.677 589.258 373.333 500 373.333C410.742 373.333 337.446 441.677 329.586 528.889H328.889V844.444H257.778V155.556Z" />
                    <path d="M128.889 253.333L157.778 351.111H182.222V746.667C169.949 746.667 160 756.616 160 768.889V795.556H155.556C143.283 795.556 133.333 805.505 133.333 817.778V844.444H382.222V817.778C382.222 805.505 372.273 795.556 360 795.556H355.556V768.889C355.556 756.616 345.606 746.667 333.333 746.667H306.667V253.333H128.889Z" />
                    <path d="M675.556 746.667C663.283 746.667 653.333 756.616 653.333 768.889V795.556H648.889C636.616 795.556 626.667 805.505 626.667 817.778V844.444H875.556V817.778C875.556 805.505 865.606 795.556 853.333 795.556H848.889V768.889C848.889 756.616 838.94 746.667 826.667 746.667V351.111H851.111L880 253.333H702.222V746.667H675.556Z" />
                  </svg>
                  <span>Share on Farcaster</span>
                </button>
              </div>
            </div>

            {/* Pool Chat */}
            <ChatPanel
              poolAddress={poolAddress}
              grid={grid}
              isPrivate={isPrivate}
            />
          </div>
        </div>
      </div>

      {/* Success Toast */}
      {showPurchaseSuccess && (
        <div className="fixed bottom-6 right-6 z-50 animate-slide-up">
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[var(--turf-green)] to-[var(--grass-dark)] p-[1px] shadow-[0_0_30px_rgba(34,197,94,0.4)]">
            <div className="relative bg-[var(--midnight)]/95 backdrop-blur-xl rounded-2xl p-5 pr-12">
              {/* Close button */}
              <button
                onClick={() => {
                  setShowPurchaseSuccess(false);
                  resetPurchase();
                }}
                className="absolute top-3 right-3 p-1.5 rounded-full hover:bg-white/10 transition-colors text-[var(--smoke)] hover:text-white"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>

              <div className="flex items-center gap-4">
                {/* Success icon */}
                <div className="w-12 h-12 rounded-xl bg-[var(--turf-green)]/20 border border-[var(--turf-green)]/40 flex items-center justify-center shrink-0">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-[var(--turf-green)]">
                    <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>

                <div>
                  <h4 className="text-lg font-bold text-white mb-1" style={{ fontFamily: 'var(--font-display)' }}>
                    SQUARES PURCHASED!
                  </h4>
                  <p className="text-sm text-gray-300">
                    Your squares have been added to the grid
                  </p>
                  {purchaseHash && (
                    <a
                      href={`https://sepolia.etherscan.io/tx/${purchaseHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-white hover:underline mt-1 inline-block font-medium"
                    >
                      View on Etherscan →
                    </a>
                  )}
                </div>
              </div>

              {/* Progress bar */}
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-[var(--steel)]/30">
                <div
                  className="h-full bg-[var(--turf-green)]"
                  style={{
                    animation: 'shrink 5s linear forwards',
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* FAQ Modal */}
      {showFAQ && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            onClick={() => setShowFAQ(false)}
          />

          {/* Modal */}
          <div className="relative w-full max-w-2xl max-h-[85vh] overflow-y-auto">
            <div className="card p-6 md:p-8 border border-[var(--steel)]/30">
              {/* Close button */}
              <button
                onClick={() => setShowFAQ(false)}
                className="absolute top-4 right-4 p-2 rounded-lg hover:bg-[var(--steel)]/20 transition-colors text-[var(--smoke)] hover:text-[var(--chrome)]"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>

              {/* Header */}
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 rounded-xl bg-[var(--turf-green)]/20 border border-[var(--turf-green)]/30 flex items-center justify-center">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-[var(--turf-green)]">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
                    <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3M12 17h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-[var(--chrome)]" style={{ fontFamily: 'var(--font-display)' }}>
                    HOW IT WORKS
                  </h2>
                  <p className="text-sm text-[var(--smoke)]">Everything you need to know</p>
                </div>
              </div>

              {/* FAQ Items */}
              <div className="space-y-6">
                {/* Basic Gameplay */}
                <div className="p-4 rounded-xl bg-[var(--steel)]/10 border border-[var(--steel)]/20">
                  <h3 className="text-lg font-bold text-[var(--championship-gold)] mb-3" style={{ fontFamily: 'var(--font-display)' }}>
                    What is Super Bowl Squares?
                  </h3>
                  <p className="text-sm text-[var(--smoke)] leading-relaxed">
                    Super Bowl Squares is a classic football betting game. A 10x10 grid creates 100 squares, each representing a unique combination of the last digit of each team's score. Buy squares before the game, and if your square matches the score at the end of any quarter, you win!
                  </p>
                </div>

                {/* How to Play */}
                <div className="p-4 rounded-xl bg-[var(--steel)]/10 border border-[var(--steel)]/20">
                  <h3 className="text-lg font-bold text-[var(--championship-gold)] mb-3" style={{ fontFamily: 'var(--font-display)' }}>
                    How do I play?
                  </h3>
                  <ol className="text-sm text-[var(--smoke)] space-y-2 list-decimal list-inside">
                    <li>Connect your wallet and buy one or more squares</li>
                    <li>Wait for the purchase deadline - numbers are then randomly assigned</li>
                    <li>Watch the game! Check if your numbers match the score at each quarter</li>
                    <li>If you win, claim your payout directly to your wallet</li>
                  </ol>
                </div>

                {/* Random Numbers */}
                <div className="p-4 rounded-xl bg-[var(--steel)]/10 border border-[var(--steel)]/20">
                  <h3 className="text-lg font-bold text-[var(--championship-gold)] mb-3" style={{ fontFamily: 'var(--font-display)' }}>
                    How are numbers assigned?
                  </h3>
                  <p className="text-sm text-[var(--smoke)] leading-relaxed">
                    Numbers (0-9) are randomly assigned to rows and columns after the purchase deadline. This uses <span className="text-blue-400 font-medium">Chainlink VRF</span> (Verifiable Random Function) - a cryptographically secure randomness source that's provably fair and tamper-proof. No one, including the pool creator, can predict or manipulate which numbers go where.
                  </p>
                </div>

                {/* Winning */}
                <div className="p-4 rounded-xl bg-[var(--steel)]/10 border border-[var(--steel)]/20">
                  <h3 className="text-lg font-bold text-[var(--championship-gold)] mb-3" style={{ fontFamily: 'var(--font-display)' }}>
                    How do I win?
                  </h3>
                  <p className="text-sm text-[var(--smoke)] leading-relaxed mb-3">
                    You win if your square's numbers match the last digit of each team's score at the end of a quarter. For example, if the score is Patriots 17, Seahawks 14, the winning square is where row "7" meets column "4".
                  </p>
                  <p className="text-sm text-[var(--smoke)] leading-relaxed">
                    Payouts happen at Q1, Halftime, Q3, and Final - each with its own prize pool percentage.
                  </p>
                </div>

                {/* Automation */}
                <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20">
                  <h3 className="text-lg font-bold text-blue-400 mb-3" style={{ fontFamily: 'var(--font-display)' }}>
                    How is this automated?
                  </h3>
                  <p className="text-sm text-[var(--smoke)] leading-relaxed mb-3">
                    This pool runs entirely on smart contracts with Chainlink oracles:
                  </p>
                  <ul className="text-sm text-[var(--smoke)] space-y-2">
                    <li className="flex items-start gap-2">
                      <span className="text-blue-400 font-bold">•</span>
                      <span><span className="text-blue-400 font-medium">Chainlink VRF</span> provides verifiable randomness for fair number assignment</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-blue-400 font-bold">•</span>
                      <span><span className="text-blue-400 font-medium">Smart contracts</span> automatically distribute winnings based on scores</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-blue-400 font-bold">•</span>
                      <span><span className="text-blue-400 font-medium">Aave V3</span> generates yield on pool funds until payouts</span>
                    </li>
                  </ul>
                </div>

                {/* Security */}
                <div className="p-4 rounded-xl bg-[var(--turf-green)]/10 border border-[var(--turf-green)]/20">
                  <h3 className="text-lg font-bold text-[var(--turf-green)] mb-3" style={{ fontFamily: 'var(--font-display)' }}>
                    Is my money safe?
                  </h3>
                  <p className="text-sm text-[var(--smoke)] leading-relaxed">
                    All funds are held in the smart contract - not by any person or company. The contract code is open source and verifiable. Winners can claim their payouts directly from the contract at any time after scores are settled. No one can withdraw funds except the rightful winners.
                  </p>
                </div>

                {/* Private Pools */}
                {isPrivate && (
                  <div className="p-4 rounded-xl bg-[var(--championship-gold)]/10 border border-[var(--championship-gold)]/20">
                    <h3 className="text-lg font-bold text-[var(--championship-gold)] mb-3" style={{ fontFamily: 'var(--font-display)' }}>
                      What is a private pool?
                    </h3>
                    <p className="text-sm text-[var(--smoke)] leading-relaxed">
                      This is a private pool - you need the password to buy squares. The password is hashed on-chain, so only people with the correct password can participate. Great for playing with friends, family, or coworkers!
                    </p>
                  </div>
                )}
              </div>

              {/* Close button */}
              <button
                onClick={() => setShowFAQ(false)}
                className="w-full mt-6 py-3 px-4 rounded-xl bg-[var(--steel)]/20 border border-[var(--steel)]/30 text-[var(--chrome)] hover:bg-[var(--steel)]/30 transition-colors font-medium"
              >
                Got it!
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Purchase Success Modal */}
      {showPurchaseSuccess && (
        <PurchaseSuccessModal
          squareCount={purchasedCount}
          totalCost={purchasedCost}
          tokenSymbol={paymentToken.symbol}
          poolName={poolInfo?.name || 'Super Bowl Squares'}
          poolAddress={poolAddress}
          onClose={() => {
            setShowPurchaseSuccess(false);
            resetPurchase();
            window.location.reload();
          }}
        />
      )}

      <style jsx>{`
        @keyframes slide-up {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes shrink {
          from {
            width: 100%;
          }
          to {
            width: 0%;
          }
        }
        .animate-slide-up {
          animation: slide-up 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}

// Confetti component for celebrations
function Confetti() {
  const colors = ['#22c55e', '#fbbf24', '#c60c30', '#69be28', '#8b5cf6', '#ec4899', '#06b6d4', '#ffffff'];
  const particles = Array.from({ length: 150 }, (_, i) => ({
    id: i,
    color: colors[Math.floor(Math.random() * colors.length)],
    left: `${Math.random() * 100}%`,
    delay: `${Math.random() * 3}s`,
    duration: `${3 + Math.random() * 2}s`,
    size: `${6 + Math.random() * 8}px`,
    rotation: `${Math.random() * 360}deg`,
  }));

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-50">
      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute animate-confetti"
          style={{
            left: p.left,
            top: '-20px',
            width: p.size,
            height: p.size,
            backgroundColor: p.color,
            animationDelay: p.delay,
            animationDuration: p.duration,
            transform: `rotate(${p.rotation})`,
            borderRadius: Math.random() > 0.5 ? '50%' : '2px',
          }}
        />
      ))}
      <style jsx global>{`
        @keyframes confetti {
          0% {
            transform: translateY(0) rotate(0deg);
            opacity: 1;
          }
          100% {
            transform: translateY(100vh) rotate(720deg);
            opacity: 0;
          }
        }
        .animate-confetti {
          animation: confetti linear forwards;
        }
        @keyframes modal-bounce {
          0% {
            opacity: 0;
            transform: scale(0.3) translateY(50px);
          }
          50% {
            transform: scale(1.05) translateY(0);
          }
          70% {
            transform: scale(0.95);
          }
          100% {
            opacity: 1;
            transform: scale(1);
          }
        }
        .animate-modal-bounce {
          animation: modal-bounce 0.5s ease-out forwards;
        }
        @keyframes pulse-glow {
          0%, 100% {
            box-shadow: 0 0 20px rgba(34, 197, 94, 0.4);
          }
          50% {
            box-shadow: 0 0 40px rgba(34, 197, 94, 0.6);
          }
        }
        .animate-pulse-glow {
          animation: pulse-glow 2s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}

// Purchase Success Modal
function PurchaseSuccessModal({
  squareCount,
  totalCost,
  tokenSymbol,
  poolName,
  poolAddress,
  onClose,
}: {
  squareCount: number;
  totalCost: bigint;
  tokenSymbol: string;
  poolName: string;
  poolAddress: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const poolUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/pools/${poolAddress}`
    : '';

  const formatCost = () => {
    if (tokenSymbol === 'USDC' || tokenSymbol === 'USDT') {
      return (Number(totalCost) / 1e6).toFixed(2);
    }
    return (Number(totalCost) / 1e18).toFixed(4);
  };

  const handleCopyLink = async () => {
    await navigator.clipboard.writeText(poolUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const shareText = `Just grabbed ${squareCount} square${squareCount > 1 ? 's' : ''} in "${poolName}"! Who's ready for Super Bowl LX? 🏈🏆`;

  const handleShareTwitter = () => {
    // Replace dots with " dot " to avoid Twitter algorithm deboosting links
    const obfuscatedUrl = poolUrl.replace(/\./g, ' dot ');
    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText + '\n\n' + obfuscatedUrl)}`;
    window.open(twitterUrl, '_blank', 'width=600,height=400');
  };

  const handleShareFarcaster = () => {
    const farcasterUrl = `https://warpcast.com/~/compose?text=${encodeURIComponent(shareText + '\n\n' + poolUrl)}`;
    window.open(farcasterUrl, '_blank', 'width=600,height=700');
  };

  // Fun messages based on square count
  const getMessage = () => {
    if (squareCount >= 10) return "You're going ALL IN! 🔥";
    if (squareCount >= 5) return "Nice moves, big player! 💪";
    if (squareCount >= 3) return "Smart picks! 🎯";
    return "You're in the game! 🎉";
  };

  return (
    <>
      <Confetti />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop */}
        <div
          className="absolute inset-0 bg-black/80 backdrop-blur-sm"
          onClick={onClose}
        />

        {/* Modal */}
        <div className="relative w-full max-w-md animate-modal-bounce">
          <div className="card p-8 text-center border-2 border-[var(--turf-green)]/50 animate-pulse-glow">
            {/* Close button */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 text-[var(--smoke)] hover:text-white transition-colors"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>

            {/* Football icon */}
            <div className="mx-auto w-20 h-20 mb-6 relative">
              <div className="absolute inset-0 bg-gradient-to-br from-[var(--turf-green)] to-[var(--grass-dark)] rounded-full animate-pulse" />
              <div className="absolute inset-2 bg-[var(--midnight)] rounded-full flex items-center justify-center">
                <span className="text-4xl">🏈</span>
              </div>
            </div>

            {/* Title */}
            <h2
              className="text-3xl font-bold mb-2 bg-gradient-to-r from-[var(--turf-green)] via-[var(--electric-lime)] to-[var(--turf-green)] bg-clip-text text-transparent"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              YOU'RE IN!
            </h2>

            {/* Fun message */}
            <p className="text-xl text-[var(--chrome)] mb-4">{getMessage()}</p>

            {/* Square count display */}
            <div className="p-6 rounded-2xl bg-gradient-to-br from-[var(--turf-green)]/20 to-[var(--grass-dark)]/20 border border-[var(--turf-green)]/30 mb-6">
              <div className="text-6xl font-bold text-[var(--turf-green)] mb-2" style={{ fontFamily: 'var(--font-display)' }}>
                {squareCount}
              </div>
              <div className="text-lg text-[var(--chrome)]">
                Square{squareCount > 1 ? 's' : ''} Purchased
              </div>
              <div className="text-sm text-[var(--smoke)] mt-2">
                {formatCost()} {tokenSymbol}
              </div>
            </div>

            {/* Good luck message */}
            <div className="p-4 rounded-xl bg-[var(--championship-gold)]/10 border border-[var(--championship-gold)]/30 mb-6">
              <p className="text-[var(--championship-gold)] font-bold text-lg flex items-center justify-center gap-2">
                <span>🍀</span> Good Luck! <span>🍀</span>
              </p>
              <p className="text-sm text-[var(--smoke)] mt-1">
                May the numbers be ever in your favor
              </p>
            </div>

            {/* Share section */}
            <div className="pt-4 border-t border-[var(--steel)]/30">
              <p className="text-sm text-[var(--smoke)] mb-3">Share with friends</p>
              <div className="flex gap-3 justify-center">
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--steel)]/30 border border-[var(--steel)]/50 hover:bg-[var(--steel)]/50 transition-colors text-sm"
                >
                  {copied ? (
                    <>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      <span className="text-[var(--turf-green)]">Copied!</span>
                    </>
                  ) : (
                    <>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                      </svg>
                      <span>Copy Link</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={handleShareTwitter}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#1DA1F2]/20 border border-[#1DA1F2]/50 hover:bg-[#1DA1F2]/30 transition-colors text-sm text-[#1DA1F2]"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                  </svg>
                  <span>X</span>
                </button>
                <button
                  type="button"
                  onClick={handleShareFarcaster}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#8465CB]/20 border border-[#8465CB]/50 hover:bg-[#8465CB]/30 transition-colors text-sm text-[#8465CB]"
                >
                  <svg width="16" height="16" viewBox="0 0 1000 1000" fill="currentColor">
                    <path d="M257.778 155.556H742.222V844.444H671.111V528.889H670.414C662.554 441.677 589.258 373.333 500 373.333C410.742 373.333 337.446 441.677 329.586 528.889H328.889V844.444H257.778V155.556Z" />
                    <path d="M128.889 253.333L157.778 351.111H182.222V746.667C169.949 746.667 160 756.616 160 768.889V795.556H155.556C143.283 795.556 133.333 805.505 133.333 817.778V844.444H382.222V817.778C382.222 805.505 372.273 795.556 360 795.556H355.556V768.889C355.556 756.616 345.606 746.667 333.333 746.667H306.667V253.333H128.889Z" />
                    <path d="M675.556 746.667C663.283 746.667 653.333 756.616 653.333 768.889V795.556H648.889C636.616 795.556 626.667 805.505 626.667 817.778V844.444H875.556V817.778C875.556 805.505 865.606 795.556 853.333 795.556H848.889V768.889C848.889 756.616 838.94 746.667 826.667 746.667V351.111H851.111L880 253.333H702.222V746.667H675.556Z" />
                  </svg>
                  <span>Farcaster</span>
                </button>
              </div>
            </div>

            {/* Continue button */}
            <button
              onClick={onClose}
              className="mt-6 w-full btn-primary py-3 text-lg"
            >
              Continue
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
