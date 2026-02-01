'use client';

import { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { useAllPools } from '@/hooks/useFactory';
import { useAdminScoreSubmit, useAdminTriggerVRF, SCORE_ADMIN_ADDRESS } from '@/hooks/useAdminScoreSubmit';
import { usePoolCreationPaused, useSetPoolCreationPaused } from '@/hooks/useAdminPoolPause';
import { usePoolYieldInfo, useWithdrawYield, usePoolState } from '@/hooks/useAdminYield';
import { useReadContract } from 'wagmi';
import { SquaresPoolABI } from '@/lib/abis/SquaresPool';
import { formatEther } from 'viem';

const QUARTER_NAMES = ['Q1', 'Halftime', 'Q3', 'Final'];

// Pool state enum from contract
const PoolState = {
  OPEN: 0,
  CLOSED: 1,
  NUMBERS_ASSIGNED: 2,
  Q1_SCORED: 3,
  Q2_SCORED: 4,
  Q3_SCORED: 5,
  FINAL_SCORED: 6,
} as const;

const stateToString = (state: number): string => {
  switch (state) {
    case PoolState.OPEN:
      return 'Open';
    case PoolState.CLOSED:
      return 'Closed';
    case PoolState.NUMBERS_ASSIGNED:
      return 'Ready for Q1';
    case PoolState.Q1_SCORED:
      return 'Ready for Halftime';
    case PoolState.Q2_SCORED:
      return 'Ready for Q3';
    case PoolState.Q3_SCORED:
      return 'Ready for Final';
    case PoolState.FINAL_SCORED:
      return 'Complete';
    default:
      return 'Unknown';
  }
};

const getNextQuarter = (state: number): number | null => {
  switch (state) {
    case PoolState.NUMBERS_ASSIGNED:
      return 0; // Q1
    case PoolState.Q1_SCORED:
      return 1; // Halftime
    case PoolState.Q2_SCORED:
      return 2; // Q3
    case PoolState.Q3_SCORED:
      return 3; // Final
    default:
      return null;
  }
};

export default function AdminPage() {
  const { address, isConnected } = useAccount();
  const isAdmin = address?.toLowerCase() === SCORE_ADMIN_ADDRESS.toLowerCase();

  // Score submission form state
  const [selectedQuarter, setSelectedQuarter] = useState<number>(0);
  const [teamAScore, setTeamAScore] = useState<string>('');
  const [teamBScore, setTeamBScore] = useState<string>('');

  const { pools, total, isLoading: isLoadingPools, refetch } = useAllPools(0, 100);
  const {
    submitScoreToAllPools,
    isPending,
    isConfirming,
    isSuccess,
    error,
    reset,
  } = useAdminScoreSubmit();

  const {
    triggerVRF,
    isPending: isVRFPending,
    isConfirming: isVRFConfirming,
    isSuccess: isVRFSuccess,
    error: vrfError,
    reset: resetVRF,
  } = useAdminTriggerVRF();

  const {
    isPaused: poolCreationIsPaused,
    isLoading: isPauseLoading,
    refetch: refetchPauseStatus,
  } = usePoolCreationPaused();

  const {
    setPoolCreationPaused,
    isPending: isPausePending,
    isConfirming: isPauseConfirming,
    isSuccess: isPauseSuccess,
    error: pauseError,
    reset: resetPause,
  } = useSetPoolCreationPaused();

  // Refresh pools on score success
  if (isSuccess) {
    setTimeout(() => {
      refetch();
      reset();
      setTeamAScore('');
      setTeamBScore('');
    }, 2000);
  }

  // Refresh pools on VRF success
  if (isVRFSuccess) {
    setTimeout(() => {
      refetch();
      resetVRF();
    }, 2000);
  }

  // Refresh pause status on pause toggle success
  if (isPauseSuccess) {
    setTimeout(() => {
      refetchPauseStatus();
      resetPause();
    }, 2000);
  }

  // Access denied for non-admin
  if (!isConnected) {
    return (
      <div className="container mx-auto px-6 py-12">
        <div className="max-w-2xl mx-auto text-center">
          <h1 className="text-3xl font-bold text-[var(--chrome)] mb-4" style={{ fontFamily: 'var(--font-display)' }}>
            ADMIN ACCESS REQUIRED
          </h1>
          <p className="text-[var(--smoke)] mb-8">
            Please connect your wallet to access the admin panel.
          </p>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="container mx-auto px-6 py-12">
        <div className="max-w-2xl mx-auto text-center">
          <h1 className="text-3xl font-bold text-red-500 mb-4" style={{ fontFamily: 'var(--font-display)' }}>
            ACCESS DENIED
          </h1>
          <p className="text-[var(--smoke)] mb-4">
            You are not authorized to access the admin panel.
          </p>
          <p className="text-sm text-[var(--smoke)]">
            Connected wallet: <code className="text-[var(--chrome)]">{address}</code>
          </p>
          <p className="text-sm text-[var(--smoke)] mt-2">
            Required wallet: <code className="text-[var(--turf-green)]">{SCORE_ADMIN_ADDRESS}</code>
          </p>
        </div>
      </div>
    );
  }

  const handleSubmitScore = () => {
    const teamA = parseInt(teamAScore);
    const teamB = parseInt(teamBScore);

    if (isNaN(teamA) || isNaN(teamB)) {
      alert('Please enter valid scores');
      return;
    }

    if (teamA < 0 || teamA > 99 || teamB < 0 || teamB > 99) {
      alert('Scores must be between 0 and 99');
      return;
    }

    submitScoreToAllPools(selectedQuarter, teamA, teamB);
  };

  return (
    <div className="container mx-auto px-6 py-12">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-[var(--chrome)] mb-2" style={{ fontFamily: 'var(--font-display)' }}>
          SCORE ADMIN PANEL
        </h1>
        <p className="text-[var(--smoke)] mb-8">
          Manage VRF triggers and submit scores for all active pools.
        </p>

        {/* Pool Creation Pause Section */}
        <div className="card p-6 mb-8">
          <h2 className="text-xl font-bold text-[var(--chrome)] mb-4" style={{ fontFamily: 'var(--font-display)' }}>
            Pool Creation Control
          </h2>
          <p className="text-[var(--smoke)] mb-4 text-sm">
            Pause pool creation before the game starts. When paused, no new pools can be created.
          </p>

          <div className="flex items-center justify-between p-4 rounded-xl bg-[var(--steel)]/10 border border-[var(--steel)]/30">
            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                poolCreationIsPaused
                  ? 'bg-red-500/20 border border-red-500/30'
                  : 'bg-[var(--turf-green)]/20 border border-[var(--turf-green)]/30'
              }`}>
                {poolCreationIsPaused ? (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-red-400">
                    <rect x="6" y="4" width="4" height="16" rx="1" fill="currentColor" />
                    <rect x="14" y="4" width="4" height="16" rx="1" fill="currentColor" />
                  </svg>
                ) : (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-[var(--turf-green)]">
                    <path d="M5 3l14 9-14 9V3z" fill="currentColor" />
                  </svg>
                )}
              </div>
              <div>
                <p className="font-medium text-[var(--chrome)]">
                  Pool Creation Status
                </p>
                <p className={`text-sm font-bold ${
                  poolCreationIsPaused ? 'text-red-400' : 'text-[var(--turf-green)]'
                }`}>
                  {isPauseLoading ? 'Loading...' : poolCreationIsPaused ? 'PAUSED' : 'ACTIVE'}
                </p>
              </div>
            </div>

            <button
              onClick={() => setPoolCreationPaused(!poolCreationIsPaused)}
              disabled={isPausePending || isPauseConfirming || isPauseLoading}
              className={`px-6 py-3 rounded-xl font-bold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                poolCreationIsPaused
                  ? 'bg-[var(--turf-green)] text-[var(--midnight)] hover:shadow-[0_0_20px_rgba(34,197,94,0.3)]'
                  : 'bg-red-500 text-white hover:shadow-[0_0_20px_rgba(239,68,68,0.3)]'
              }`}
            >
              {isPausePending ? 'Confirm in Wallet...' : isPauseConfirming ? 'Processing...' : poolCreationIsPaused ? 'Resume Pool Creation' : 'Pause Pool Creation'}
            </button>
          </div>

          {isPauseSuccess && (
            <div className="mt-4 p-3 rounded-lg bg-[var(--turf-green)]/20 border border-[var(--turf-green)]/30">
              <span className="text-[var(--turf-green)]">Pool creation status updated successfully!</span>
            </div>
          )}

          {pauseError && (
            <div className="mt-4 p-3 rounded-lg bg-red-500/20 border border-red-500/30">
              <span className="text-red-400 text-sm">Error: {pauseError.message}</span>
            </div>
          )}
        </div>

        {/* Yield Withdrawal Section */}
        {pools && pools.length > 0 && (
          <YieldWithdrawalSection pools={pools} onRefresh={refetch} />
        )}

        {/* VRF Trigger Section */}
        <div className="card p-6 mb-8">
          <h2 className="text-xl font-bold text-[var(--chrome)] mb-4" style={{ fontFamily: 'var(--font-display)' }}>
            Trigger VRF for All Pools
          </h2>
          <p className="text-[var(--smoke)] mb-4 text-sm">
            Triggers VRF random number generation for all pools that have sales and are in OPEN state.
            This will assign random row/column numbers to each pool.
          </p>

          <div className="flex items-center gap-4">
            <button
              onClick={triggerVRF}
              disabled={isVRFPending || isVRFConfirming}
              className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isVRFPending ? 'Confirm in Wallet...' : isVRFConfirming ? 'Triggering VRF...' : 'Trigger VRF for All Pools'}
            </button>

            {isVRFSuccess && (
              <span className="text-[var(--turf-green)]">VRF triggered successfully!</span>
            )}

            {vrfError && (
              <span className="text-red-400 text-sm">Error: {vrfError.message}</span>
            )}
          </div>
        </div>

        {/* Current Scores Display */}
        {pools && pools.length > 0 && (
          <CurrentScoresDisplay poolAddress={pools[0]} onRefresh={refetch} />
        )}

        {/* Score Submission Form */}
        <div className="card p-6 mb-8">
          <h2 className="text-xl font-bold text-[var(--chrome)] mb-6" style={{ fontFamily: 'var(--font-display)' }}>
            Submit Score to All Pools
          </h2>

          {/* Quarter Selection - Visual Buttons */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-[var(--smoke)] mb-3">
              Select Quarter
            </label>
            <div className="grid grid-cols-4 gap-2">
              {QUARTER_NAMES.map((name, index) => (
                <button
                  key={index}
                  onClick={() => setSelectedQuarter(index)}
                  className={`py-3 px-4 rounded-xl font-bold text-sm transition-all ${
                    selectedQuarter === index
                      ? 'bg-[var(--turf-green)] text-[var(--midnight)] shadow-[0_0_20px_rgba(34,197,94,0.3)]'
                      : 'bg-[var(--steel)]/20 text-[var(--smoke)] hover:bg-[var(--steel)]/40 border border-[var(--steel)]/30'
                  }`}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>

          {/* Score Input - Side by Side with VS */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-[var(--smoke)] mb-3">
              Enter {QUARTER_NAMES[selectedQuarter]} Score
            </label>
            <div className="flex items-center gap-4">
              {/* Team A */}
              <div className="flex-1">
                <div className="p-4 rounded-xl bg-gradient-to-br from-[#002244]/30 to-[#002244]/10 border border-[#002244]/50">
                  <div className="text-center mb-2">
                    <span className="text-sm font-medium text-[var(--chrome)]">Patriots</span>
                  </div>
                  <input
                    type="number"
                    min="0"
                    max="99"
                    value={teamAScore}
                    onChange={(e) => setTeamAScore(e.target.value)}
                    placeholder="0"
                    className="w-full text-center text-4xl font-bold py-4 rounded-lg bg-[var(--midnight)]/50 border-2 border-[var(--steel)]/30 text-[var(--chrome)] focus:outline-none focus:border-[var(--turf-green)] placeholder:text-[var(--steel)]"
                  />
                </div>
              </div>

              {/* VS Divider */}
              <div className="flex-shrink-0">
                <div className="w-12 h-12 rounded-full bg-[var(--championship-gold)]/20 border border-[var(--championship-gold)]/30 flex items-center justify-center">
                  <span className="text-sm font-bold text-[var(--championship-gold)]">VS</span>
                </div>
              </div>

              {/* Team B */}
              <div className="flex-1">
                <div className="p-4 rounded-xl bg-gradient-to-br from-[#69BE28]/20 to-[#002244]/10 border border-[#69BE28]/30">
                  <div className="text-center mb-2">
                    <span className="text-sm font-medium text-[var(--chrome)]">Seahawks</span>
                  </div>
                  <input
                    type="number"
                    min="0"
                    max="99"
                    value={teamBScore}
                    onChange={(e) => setTeamBScore(e.target.value)}
                    placeholder="0"
                    className="w-full text-center text-4xl font-bold py-4 rounded-lg bg-[var(--midnight)]/50 border-2 border-[var(--steel)]/30 text-[var(--chrome)] focus:outline-none focus:border-[var(--turf-green)] placeholder:text-[var(--steel)]"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Preview & Submit */}
          <div className="p-4 rounded-xl bg-[var(--steel)]/10 border border-[var(--steel)]/30 mb-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-[var(--smoke)]">
                  {teamAScore && teamBScore ? (
                    <>
                      Submitting <span className="font-bold text-[var(--chrome)]">{QUARTER_NAMES[selectedQuarter]}</span> score:{' '}
                      <span className="font-bold text-[var(--chrome)]">Patriots {teamAScore}</span>
                      {' - '}
                      <span className="font-bold text-[var(--chrome)]">Seahawks {teamBScore}</span>
                    </>
                  ) : (
                    'Enter scores above to submit'
                  )}
                </div>
                <div className="text-xs text-[var(--smoke)] mt-1">
                  Winners will be automatically paid when score is submitted
                </div>
              </div>
              <button
                onClick={handleSubmitScore}
                disabled={isPending || isConfirming || !teamAScore || !teamBScore}
                className={`px-8 py-3 rounded-xl font-bold text-sm transition-all ${
                  isPending || isConfirming || !teamAScore || !teamBScore
                    ? 'bg-[var(--steel)]/30 text-[var(--smoke)] cursor-not-allowed'
                    : 'bg-gradient-to-r from-[var(--turf-green)] to-[var(--grass-dark)] text-[var(--midnight)] hover:shadow-[0_0_20px_rgba(34,197,94,0.3)]'
                }`}
              >
                {isPending ? (
                  <span className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    Confirm in Wallet
                  </span>
                ) : isConfirming ? (
                  <span className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    Submitting...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    Submit {QUARTER_NAMES[selectedQuarter]} Score
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Status Messages */}
          {isSuccess && (
            <div className="p-4 rounded-xl bg-[var(--turf-green)]/20 border border-[var(--turf-green)]/50">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-[var(--turf-green)]/30 flex items-center justify-center">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-[var(--turf-green)]">
                    <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <div>
                  <div className="font-medium text-[var(--turf-green)]">Score submitted successfully!</div>
                  <div className="text-sm text-[var(--turf-green)]/80">Winners have been automatically paid out.</div>
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="p-4 rounded-xl bg-red-500/20 border border-red-500/50">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-red-500/30 flex items-center justify-center">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-red-400">
                    <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <div>
                  <div className="font-medium text-red-400">Submission failed</div>
                  <div className="text-sm text-red-400/80">{error.message}</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Pool List */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-[var(--chrome)]" style={{ fontFamily: 'var(--font-display)' }}>
              All Pools ({total?.toString() || 0})
            </h2>
            <button
              onClick={() => refetch()}
              className="text-sm text-[var(--turf-green)] hover:underline"
            >
              Refresh
            </button>
          </div>

          {isLoadingPools ? (
            <div className="text-center py-8 text-[var(--smoke)]">Loading pools...</div>
          ) : pools && pools.length > 0 ? (
            <div className="space-y-3">
              {pools.map((poolAddress) => (
                <PoolRow key={poolAddress} address={poolAddress} />
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-[var(--smoke)]">No pools found</div>
          )}
        </div>
      </div>
    </div>
  );
}

function PoolRow({ address }: { address: `0x${string}` }) {
  const { data: poolInfo, isLoading } = useReadContract({
    address,
    abi: SquaresPoolABI,
    functionName: 'getPoolInfo',
  });

  if (isLoading) {
    return (
      <div className="p-4 rounded-lg bg-[var(--steel)]/10 border border-[var(--steel)]/30 animate-pulse">
        <div className="h-5 bg-[var(--steel)]/20 rounded w-1/3"></div>
      </div>
    );
  }

  if (!poolInfo) {
    return null;
  }

  const [name, state, , , totalPot, squaresSold] = poolInfo as [string, number, bigint, string, bigint, bigint, string, string];
  const nextQuarter = getNextQuarter(state);

  return (
    <div className="p-4 rounded-lg bg-[var(--steel)]/10 border border-[var(--steel)]/30 hover:border-[var(--steel)]/50 transition-colors">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-bold text-[var(--chrome)]">{name}</div>
          <div className="text-sm text-[var(--smoke)]">
            <code className="text-xs">{address.slice(0, 10)}...{address.slice(-8)}</code>
          </div>
        </div>
        <div className="text-right">
          <div className={`text-sm font-medium ${
            state >= PoolState.NUMBERS_ASSIGNED && state < PoolState.FINAL_SCORED
              ? 'text-[var(--turf-green)]'
              : state === PoolState.FINAL_SCORED
              ? 'text-[var(--championship-gold)]'
              : 'text-[var(--smoke)]'
          }`}>
            {stateToString(state)}
            {nextQuarter !== null && (
              <span className="ml-2 text-xs">({QUARTER_NAMES[nextQuarter]})</span>
            )}
          </div>
          <div className="text-sm text-[var(--smoke)]">
            {squaresSold.toString()}/100 squares | {formatEther(totalPot)} ETH
          </div>
        </div>
      </div>
    </div>
  );
}

function YieldWithdrawalSection({ pools, onRefresh }: { pools: `0x${string}`[]; onRefresh: () => void }) {
  const [hasAavePool, setHasAavePool] = useState(false);

  return (
    <div className="card p-6 mb-8">
      <h2 className="text-xl font-bold text-[var(--chrome)] mb-4" style={{ fontFamily: 'var(--font-display)' }}>
        Yield Withdrawal
      </h2>
      <p className="text-[var(--smoke)] mb-4 text-sm">
        Withdraw accrued yield from finished pools. Yield is generated by depositing pool funds to Aave V3.
      </p>

      <div className="space-y-3">
        {pools.map((poolAddress) => (
          <PoolYieldRow
            key={poolAddress}
            poolAddress={poolAddress}
            onRefresh={onRefresh}
            onAaveDetected={() => setHasAavePool(true)}
          />
        ))}
      </div>

      {!hasAavePool && (
        <div className="p-4 rounded-xl bg-[var(--steel)]/10 border border-[var(--steel)]/30 text-center">
          <div className="flex items-center justify-center gap-3 text-[var(--smoke)]">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-[var(--smoke)]">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
              <path d="M12 8v4M12 16h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <span className="text-sm">
              No pools with Aave yield found. ETH pools created after Aave is configured on the factory will generate yield.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function PoolYieldRow({ poolAddress, onRefresh, onAaveDetected }: { poolAddress: `0x${string}`; onRefresh: () => void; onAaveDetected?: () => void }) {
  const { yieldInfo, isLoading: isLoadingYield, refetch: refetchYield } = usePoolYieldInfo(poolAddress);
  const { state, isFinished } = usePoolState(poolAddress);
  const { withdrawYield, isPending, isConfirming, isSuccess, error, reset } = useWithdrawYield(poolAddress);

  const { data: poolInfo } = useReadContract({
    address: poolAddress,
    abi: SquaresPoolABI,
    functionName: 'getPoolInfo',
  });

  // Notify parent when Aave is detected
  useEffect(() => {
    if (yieldInfo?.aaveConfigured && onAaveDetected) {
      onAaveDetected();
    }
  }, [yieldInfo?.aaveConfigured, onAaveDetected]);

  // Handle success
  if (isSuccess) {
    setTimeout(() => {
      refetchYield();
      onRefresh();
      reset();
    }, 2000);
  }

  // Don't show if Aave not configured or no yield
  if (isLoadingYield) {
    return (
      <div className="p-4 rounded-lg bg-[var(--steel)]/10 border border-[var(--steel)]/30 animate-pulse">
        <div className="h-5 bg-[var(--steel)]/20 rounded w-1/3"></div>
      </div>
    );
  }

  if (!yieldInfo?.aaveConfigured) {
    return null; // Skip pools without Aave
  }

  const poolName = poolInfo ? (poolInfo as [string, number, bigint, string, bigint, bigint, string, string])[0] : 'Pool';
  const hasYield = yieldInfo.yield > BigInt(0);
  const canWithdraw = isFinished && hasYield;

  return (
    <div className="p-4 rounded-lg bg-[var(--steel)]/10 border border-[var(--steel)]/30">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-bold text-[var(--chrome)]">{poolName}</div>
          <div className="text-sm text-[var(--smoke)]">
            <code className="text-xs">{poolAddress.slice(0, 10)}...{poolAddress.slice(-8)}</code>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-sm text-[var(--smoke)]">Principal</div>
            <div className="font-medium text-[var(--chrome)]">
              {formatEther(yieldInfo.principal)} ETH
            </div>
          </div>

          <div className="text-right">
            <div className="text-sm text-[var(--smoke)]">Yield</div>
            <div className={`font-bold ${hasYield ? 'text-[var(--turf-green)]' : 'text-[var(--smoke)]'}`}>
              {formatEther(yieldInfo.yield)} ETH
            </div>
          </div>

          <div className="text-right">
            <div className="text-sm text-[var(--smoke)]">Status</div>
            <div className={`text-sm font-medium ${
              isFinished ? 'text-[var(--championship-gold)]' : 'text-[var(--smoke)]'
            }`}>
              {isFinished ? 'Finished' : 'In Progress'}
            </div>
          </div>

          <button
            onClick={() => withdrawYield()}
            disabled={!canWithdraw || isPending || isConfirming}
            className={`px-4 py-2 rounded-lg font-medium text-sm transition-all ${
              canWithdraw && !isPending && !isConfirming
                ? 'bg-[var(--turf-green)] text-[var(--midnight)] hover:shadow-[0_0_15px_rgba(34,197,94,0.3)]'
                : 'bg-[var(--steel)]/30 text-[var(--smoke)] cursor-not-allowed'
            }`}
          >
            {isPending ? 'Confirm...' : isConfirming ? 'Withdrawing...' : 'Withdraw'}
          </button>
        </div>
      </div>

      {isSuccess && (
        <div className="mt-3 p-2 rounded bg-[var(--turf-green)]/20 border border-[var(--turf-green)]/30">
          <span className="text-sm text-[var(--turf-green)]">Yield withdrawn successfully!</span>
        </div>
      )}

      {error && (
        <div className="mt-3 p-2 rounded bg-red-500/20 border border-red-500/30">
          <span className="text-sm text-red-400">Error: {error.message}</span>
        </div>
      )}
    </div>
  );
}

function CurrentScoresDisplay({ poolAddress, onRefresh }: { poolAddress: `0x${string}`; onRefresh: () => void }) {
  // Read scores for all quarters
  const { data: q1Score } = useReadContract({
    address: poolAddress,
    abi: SquaresPoolABI,
    functionName: 'getScore',
    args: [0],
  });

  const { data: q2Score } = useReadContract({
    address: poolAddress,
    abi: SquaresPoolABI,
    functionName: 'getScore',
    args: [1],
  });

  const { data: q3Score } = useReadContract({
    address: poolAddress,
    abi: SquaresPoolABI,
    functionName: 'getScore',
    args: [2],
  });

  const { data: finalScore } = useReadContract({
    address: poolAddress,
    abi: SquaresPoolABI,
    functionName: 'getScore',
    args: [3],
  });

  const { data: poolInfo } = useReadContract({
    address: poolAddress,
    abi: SquaresPoolABI,
    functionName: 'getPoolInfo',
  });

  const teamAName = poolInfo ? (poolInfo as [string, number, bigint, string, bigint, bigint, string, string])[6] : 'Team A';
  const teamBName = poolInfo ? (poolInfo as [string, number, bigint, string, bigint, bigint, string, string])[7] : 'Team B';

  const scores = [
    { quarter: 'Q1', data: q1Score },
    { quarter: 'Halftime', data: q2Score },
    { quarter: 'Q3', data: q3Score },
    { quarter: 'Final', data: finalScore },
  ];

  const getNextQuarterIndex = () => {
    for (let i = 0; i < scores.length; i++) {
      const score = scores[i].data as { submitted?: boolean } | undefined;
      if (!score?.submitted) return i;
    }
    return -1; // All complete
  };

  const nextQuarterIndex = getNextQuarterIndex();

  return (
    <div className="card p-6 mb-8">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-[var(--chrome)]" style={{ fontFamily: 'var(--font-display)' }}>
          Current Game Status
        </h2>
        <button
          onClick={onRefresh}
          className="text-sm text-[var(--turf-green)] hover:underline"
        >
          Refresh
        </button>
      </div>

      {/* Scoreboard Style Display */}
      <div className="bg-gradient-to-br from-[var(--midnight)] to-[var(--steel)]/20 rounded-xl border border-[var(--steel)]/30 overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-5 gap-0 bg-[var(--steel)]/20 border-b border-[var(--steel)]/30">
          <div className="p-3 text-center">
            <span className="text-xs font-medium text-[var(--smoke)]">TEAM</span>
          </div>
          {scores.map(({ quarter }, index) => (
            <div
              key={quarter}
              className={`p-3 text-center border-l border-[var(--steel)]/30 ${
                index === nextQuarterIndex ? 'bg-[var(--turf-green)]/20' : ''
              }`}
            >
              <span className={`text-xs font-bold ${
                index === nextQuarterIndex ? 'text-[var(--turf-green)]' : 'text-[var(--smoke)]'
              }`}>
                {quarter}
                {index === nextQuarterIndex && (
                  <span className="ml-1 text-[10px]">NEXT</span>
                )}
              </span>
            </div>
          ))}
        </div>

        {/* Team A Row */}
        <div className="grid grid-cols-5 gap-0 border-b border-[var(--steel)]/30">
          <div className="p-4 flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-[#002244] flex items-center justify-center text-white text-xs font-bold">
              {teamAName.charAt(0)}
            </div>
            <span className="text-sm font-medium text-[var(--chrome)]">{teamAName}</span>
          </div>
          {scores.map(({ quarter, data }, index) => {
            const score = data as { teamAScore?: number; submitted?: boolean } | undefined;
            const isSubmitted = score?.submitted;
            return (
              <div
                key={quarter}
                className={`p-4 text-center border-l border-[var(--steel)]/30 ${
                  index === nextQuarterIndex ? 'bg-[var(--turf-green)]/10' : ''
                }`}
              >
                <span className={`text-2xl font-bold ${
                  isSubmitted ? 'text-[var(--chrome)]' : 'text-[var(--steel)]'
                }`}>
                  {isSubmitted ? score?.teamAScore : '-'}
                </span>
              </div>
            );
          })}
        </div>

        {/* Team B Row */}
        <div className="grid grid-cols-5 gap-0">
          <div className="p-4 flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-[#69BE28] flex items-center justify-center text-white text-xs font-bold">
              {teamBName.charAt(0)}
            </div>
            <span className="text-sm font-medium text-[var(--chrome)]">{teamBName}</span>
          </div>
          {scores.map(({ quarter, data }, index) => {
            const score = data as { teamBScore?: number; submitted?: boolean } | undefined;
            const isSubmitted = score?.submitted;
            return (
              <div
                key={quarter}
                className={`p-4 text-center border-l border-[var(--steel)]/30 ${
                  index === nextQuarterIndex ? 'bg-[var(--turf-green)]/10' : ''
                }`}
              >
                <span className={`text-2xl font-bold ${
                  isSubmitted ? 'text-[var(--chrome)]' : 'text-[var(--steel)]'
                }`}>
                  {isSubmitted ? score?.teamBScore : '-'}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Status Badges */}
      <div className="flex items-center gap-2 mt-4">
        {scores.map(({ quarter, data }, index) => {
          const score = data as { submitted?: boolean } | undefined;
          const isSubmitted = score?.submitted;
          const isNext = index === nextQuarterIndex;

          return (
            <div
              key={quarter}
              className={`flex-1 py-2 px-3 rounded-lg text-center text-xs font-medium ${
                isSubmitted
                  ? 'bg-[var(--turf-green)]/20 text-[var(--turf-green)] border border-[var(--turf-green)]/30'
                  : isNext
                  ? 'bg-[var(--championship-gold)]/20 text-[var(--championship-gold)] border border-[var(--championship-gold)]/30'
                  : 'bg-[var(--steel)]/10 text-[var(--smoke)] border border-[var(--steel)]/20'
              }`}
            >
              {isSubmitted ? (
                <span className="flex items-center justify-center gap-1">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                    <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {quarter}
                </span>
              ) : isNext ? (
                <span className="flex items-center justify-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-[var(--championship-gold)] animate-pulse" />
                  {quarter}
                </span>
              ) : (
                <span>{quarter}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
