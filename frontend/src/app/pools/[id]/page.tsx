'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { useAccount, useChainId } from 'wagmi';
import { formatEther, zeroAddress } from 'viem';
import { ConnectButton } from '@rainbow-me/rainbowkit';

import { SquaresGrid } from '@/components/SquaresGrid';
import { ScoreDisplay } from '@/components/ScoreDisplay';
import { PayoutBreakdown } from '@/components/PayoutBreakdown';
import { ScoreFetcher } from '@/components/ScoreFetcher';
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
} from '@/hooks/usePool';
import { useBuySquares } from '@/hooks/useBuySquares';
import { useClaimPayout } from '@/hooks/useClaimPayout';

import { PoolState, POOL_STATE_LABELS, Quarter, QUARTER_LABELS } from '@/lib/contracts';

export default function PoolPage() {
  const params = useParams();
  const poolAddress = params.id as `0x${string}`;
  const { address, isConnected } = useAccount();
  const chainId = useChainId();

  // Pool data
  const { poolInfo, isLoading: infoLoading, refetch: refetchInfo } = usePoolInfo(poolAddress);
  const { grid, isLoading: gridLoading, refetch: refetchGrid } = usePoolGrid(poolAddress);
  const { rowNumbers, colNumbers } = usePoolNumbers(poolAddress);
  const { purchaseDeadline, vrfDeadline } = usePoolDeadlines(poolAddress);
  const { squareCount } = useUserSquareCount(poolAddress, address);
  const { maxSquares } = useMaxSquaresPerUser(poolAddress);
  const { percentages } = usePayoutPercentages(poolAddress);
  const { operator } = usePoolOperator(poolAddress);

  // Scores
  const { score: q1Score } = usePoolScore(poolAddress, Quarter.Q1);
  const { score: q2Score } = usePoolScore(poolAddress, Quarter.Q2);
  const { score: q3Score } = usePoolScore(poolAddress, Quarter.Q3);
  const { score: finalScore } = usePoolScore(poolAddress, Quarter.FINAL);

  // Winners
  const { winner: q1Winner, payout: q1Payout } = usePoolWinner(poolAddress, Quarter.Q1);
  const { winner: q2Winner, payout: q2Payout } = usePoolWinner(poolAddress, Quarter.Q2);
  const { winner: q3Winner, payout: q3Payout } = usePoolWinner(poolAddress, Quarter.Q3);
  const { winner: finalWinner, payout: finalPayout } = usePoolWinner(poolAddress, Quarter.FINAL);

  // State
  const [selectedSquares, setSelectedSquares] = useState<number[]>([]);

  // Success toast state
  const [showPurchaseSuccess, setShowPurchaseSuccess] = useState(false);

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

  const {
    claimPayout,
    isPending: isClaiming,
    isConfirming: isConfirmingClaim,
  } = useClaimPayout(poolAddress);

  // Show success toast when purchase completes
  useEffect(() => {
    if (purchaseSuccess) {
      setShowPurchaseSuccess(true);
      refetchGrid();
      refetchInfo();
      // Auto-hide after 5 seconds
      const timer = setTimeout(() => {
        setShowPurchaseSuccess(false);
        resetPurchase();
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [purchaseSuccess, refetchGrid, refetchInfo, resetPurchase]);

  // After approval succeeds, continue with purchase
  useEffect(() => {
    if (isApproveSuccess && selectedSquares.length > 0 && poolInfo?.squarePrice) {
      continueBuyAfterApproval(selectedSquares, poolInfo.squarePrice);
    }
  }, [isApproveSuccess, selectedSquares, poolInfo?.squarePrice, continueBuyAfterApproval]);

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

  const totalCost = poolInfo
    ? poolInfo.squarePrice * BigInt(selectedSquares.length)
    : BigInt(0);

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

    await buySquares(selectedSquares, poolInfo.squarePrice);
    setSelectedSquares([]);
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
            </div>

            {/* Quick stats */}
            <div className="flex items-center gap-6">
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
            </div>
          </div>
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
                            <p className="text-sm text-[var(--smoke)]">
                              You can buy {remainingSquares} more
                            </p>
                          )}
                          {!isNativePayment && needsApproval(totalCost) && selectedSquares.length > 0 && (
                            <p className="text-xs text-blue-400 mt-1">
                              Requires {paymentToken.symbol} approval
                            </p>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={handleBuy}
                        disabled={selectedSquares.length === 0 || isBuying || isConfirmingBuy}
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
                  )}
                  {buyError && (
                    <p className="text-[var(--danger)] mt-4 text-sm p-3 rounded-lg bg-[var(--danger)]/10 border border-[var(--danger)]/30">
                      {buyError.message}
                    </p>
                  )}
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
              />
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
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
                <div className="p-4 rounded-xl bg-[var(--steel)]/10 border border-[var(--steel)]/20">
                  <dt className="text-xs text-[var(--smoke)] mb-1" style={{ fontFamily: 'var(--font-display)', letterSpacing: '0.1em' }}>
                    VRF DEADLINE
                  </dt>
                  <dd className="font-medium text-[var(--chrome)]">{formatDeadline(vrfDeadline)}</dd>
                </div>
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

            {/* Score Fetcher - shows when game is in progress */}
            {poolInfo.state >= PoolState.NUMBERS_ASSIGNED && poolInfo.state < PoolState.FINAL_SCORED && (
              <ScoreFetcher
                poolAddress={poolAddress}
                poolState={poolInfo.state}
                currentScores={{
                  [Quarter.Q1]: q1Score ? {
                    teamAScore: q1Score.teamAScore,
                    teamBScore: q1Score.teamBScore,
                    settled: q1Score.settled,
                  } : undefined,
                  [Quarter.Q2]: q2Score ? {
                    teamAScore: q2Score.teamAScore,
                    teamBScore: q2Score.teamBScore,
                    settled: q2Score.settled,
                  } : undefined,
                  [Quarter.Q3]: q3Score ? {
                    teamAScore: q3Score.teamAScore,
                    teamBScore: q3Score.teamBScore,
                    settled: q3Score.settled,
                  } : undefined,
                  [Quarter.FINAL]: finalScore ? {
                    teamAScore: finalScore.teamAScore,
                    teamBScore: finalScore.teamBScore,
                    settled: finalScore.settled,
                  } : undefined,
                }}
              />
            )}

            {/* Claim Payouts */}
            {isConnected && poolInfo.state >= PoolState.Q1_SCORED && (
              <div className="card p-6">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-lg bg-[var(--championship-gold)]/20 border border-[var(--championship-gold)]/30 flex items-center justify-center">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-[var(--championship-gold)]">
                      <path d="M12 2v20M17 5H9.5a3.5 3.5 0 1 0 0 7h5a3.5 3.5 0 1 1 0 7H6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <h2 className="text-xl font-bold text-[var(--chrome)]" style={{ fontFamily: 'var(--font-display)' }}>
                    CLAIM WINNINGS
                  </h2>
                </div>

                <div className="space-y-3">
                  {[
                    { quarter: Quarter.Q1, winner: q1Winner, minState: PoolState.Q1_SCORED, color: 'var(--turf-green)' },
                    { quarter: Quarter.Q2, winner: q2Winner, minState: PoolState.Q2_SCORED, color: 'var(--grass-light)' },
                    { quarter: Quarter.Q3, winner: q3Winner, minState: PoolState.Q3_SCORED, color: 'var(--electric-lime)' },
                    { quarter: Quarter.FINAL, winner: finalWinner, minState: PoolState.FINAL_SCORED, color: 'var(--championship-gold)' },
                  ].map(({ quarter, winner, minState, color }) => {
                    const isWinner = winner?.toLowerCase() === address?.toLowerCase();
                    const canClaim = poolInfo.state >= minState && isWinner;

                    return (
                      <button
                        key={quarter}
                        onClick={() => claimPayout(quarter)}
                        disabled={!canClaim || isClaiming || isConfirmingClaim}
                        className={`w-full py-3 px-4 rounded-xl text-sm font-medium transition-all ${
                          canClaim
                            ? 'bg-gradient-to-r from-[var(--turf-green)] to-[var(--grass-dark)] text-[var(--midnight)] hover:shadow-[0_0_20px_rgba(34,197,94,0.3)]'
                            : 'bg-[var(--steel)]/30 text-[var(--smoke)] cursor-not-allowed'
                        }`}
                      >
                        <span className="flex items-center justify-between">
                          <span className="flex items-center gap-2">
                            <span
                              className="w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold"
                              style={{ backgroundColor: `${color}20`, color }}
                            >
                              {QUARTER_LABELS[quarter]}
                            </span>
                            {isWinner ? 'Claim Winnings' : 'Not Winner'}
                          </span>
                          {isWinner && (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                              <path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
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
                  <p className="text-sm text-[var(--smoke)]">
                    Your squares have been added to the grid
                  </p>
                  {purchaseHash && (
                    <a
                      href={`https://sepolia.etherscan.io/tx/${purchaseHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-[var(--turf-green)] hover:underline mt-1 inline-block"
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
