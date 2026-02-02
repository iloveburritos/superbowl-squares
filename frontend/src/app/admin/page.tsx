'use client';

import { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { useAllPools, useFactoryAddress } from '@/hooks/useFactory';
import { useAdminScoreSubmit, useAdminTriggerVRF, SCORE_ADMIN_ADDRESS, useVRFSubscriptionId, useFundVRFSubscription, useCancelVRFSubscription, useEmergencySetNumbers } from '@/hooks/useAdminScoreSubmit';
import { usePoolCreationPaused, useSetPoolCreationPaused } from '@/hooks/useAdminPoolPause';
import { usePoolYieldInfo, useWithdrawYield, usePoolState, useWithdrawAllYield } from '@/hooks/useAdminYield';
import { useReadContract, useChainId } from 'wagmi';
import { SquaresPoolABI } from '@/lib/abis/SquaresPool';
import { formatEther, zeroAddress } from 'viem';
import { findToken, formatTokenAmount, ETH_TOKEN } from '@/config/tokens';

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
  const factoryAddress = useFactoryAddress();

  // Score submission form state
  const [selectedQuarter, setSelectedQuarter] = useState<number>(0);
  const [teamAScore, setTeamAScore] = useState<string>('');
  const [teamBScore, setTeamBScore] = useState<string>('');

  const { pools, total, isLoading: isLoadingPools, refetch: refetchPools } = useAllPools(0, 100);
  const [poolsNeedingVRF, setPoolsNeedingVRF] = useState<number>(0);
  const [poolsStuckInClosed, setPoolsStuckInClosed] = useState<number>(0);
  const [poolsReportedVRF, setPoolsReportedVRF] = useState<Set<string>>(new Set());
  const [poolsReportedClosed, setPoolsReportedClosed] = useState<Set<string>>(new Set());

  // Wrapper refetch that resets VRF tracking
  const refetch = () => {
    setPoolsNeedingVRF(0);
    setPoolsStuckInClosed(0);
    setPoolsReportedVRF(new Set());
    setPoolsReportedClosed(new Set());
    refetchPools();
  };
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
    emergencySetNumbers,
    isPending: isEmergencyPending,
    isConfirming: isEmergencyConfirming,
    isSuccess: isEmergencySuccess,
    error: emergencyError,
    reset: resetEmergency,
  } = useEmergencySetNumbers();

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

  // Read scores from the first pool to determine which quarters are already submitted
  const firstPoolAddress = pools?.[0];
  const { data: q1Score, refetch: refetchQ1 } = useReadContract({
    address: firstPoolAddress,
    abi: SquaresPoolABI,
    functionName: 'getScore',
    args: [0],
    query: { enabled: !!firstPoolAddress },
  });
  const { data: q2Score, refetch: refetchQ2 } = useReadContract({
    address: firstPoolAddress,
    abi: SquaresPoolABI,
    functionName: 'getScore',
    args: [1],
    query: { enabled: !!firstPoolAddress },
  });
  const { data: q3Score, refetch: refetchQ3 } = useReadContract({
    address: firstPoolAddress,
    abi: SquaresPoolABI,
    functionName: 'getScore',
    args: [2],
    query: { enabled: !!firstPoolAddress },
  });
  const { data: finalScore, refetch: refetchFinal } = useReadContract({
    address: firstPoolAddress,
    abi: SquaresPoolABI,
    functionName: 'getScore',
    args: [3],
    query: { enabled: !!firstPoolAddress },
  });

  // Check which quarters have been submitted
  const quarterSubmitted = [
    (q1Score as { submitted?: boolean } | undefined)?.submitted ?? false,
    (q2Score as { submitted?: boolean } | undefined)?.submitted ?? false,
    (q3Score as { submitted?: boolean } | undefined)?.submitted ?? false,
    (finalScore as { submitted?: boolean } | undefined)?.submitted ?? false,
  ];

  // Find the next unsubmitted quarter (for display purposes)
  const nextUnsubmittedQuarter = quarterSubmitted.findIndex(submitted => !submitted);

  // Auto-select next unsubmitted quarter when current selection is already submitted
  useEffect(() => {
    if (nextUnsubmittedQuarter !== -1 && quarterSubmitted[selectedQuarter]) {
      setSelectedQuarter(nextUnsubmittedQuarter);
    }
  }, [nextUnsubmittedQuarter, quarterSubmitted, selectedQuarter]);

  // Refresh scores on score success
  if (isSuccess) {
    setTimeout(() => {
      refetch();
      refetchQ1();
      refetchQ2();
      refetchQ3();
      refetchFinal();
      reset();
      setTeamAScore('');
      setTeamBScore('');
      // Auto-select next unsubmitted quarter
      const nextQuarter = quarterSubmitted.findIndex((submitted, i) => i > selectedQuarter && !submitted);
      if (nextQuarter !== -1) {
        setSelectedQuarter(nextQuarter);
      }
    }, 2000);
  }

  // Refresh pools on VRF success
  if (isVRFSuccess) {
    setTimeout(() => {
      refetch();
      resetVRF();
    }, 2000);
  }

  // Refresh pools on Emergency VRF success
  if (isEmergencySuccess) {
    setTimeout(() => {
      refetch();
      resetEmergency();
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
    // Prevent resubmission for already-submitted quarters
    if (quarterSubmitted[selectedQuarter]) {
      alert('This quarter has already been scored');
      return;
    }

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
          <YieldWithdrawalSection pools={pools} onRefresh={refetch} factoryAddress={factoryAddress} />
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
              disabled={isVRFPending || isVRFConfirming || poolsNeedingVRF === 0}
              className={`btn-primary disabled:opacity-50 disabled:cursor-not-allowed ${
                poolsNeedingVRF === 0 ? '!bg-[var(--steel)]/30 !text-[var(--smoke)]' : ''
              }`}
            >
              {isVRFPending ? 'Confirm in Wallet...' : isVRFConfirming ? 'Triggering VRF...' : poolsNeedingVRF === 0 ? 'VRF Already Triggered' : 'Trigger VRF for All Pools'}
            </button>

            {poolsNeedingVRF > 0 && !isVRFPending && !isVRFConfirming && (
              <span className="text-sm text-[var(--smoke)]">
                {poolsNeedingVRF} pool{poolsNeedingVRF > 1 ? 's' : ''} in OPEN state
              </span>
            )}

            {isVRFSuccess && (
              <span className="text-[var(--turf-green)]">VRF triggered successfully!</span>
            )}

            {vrfError && (
              <span className="text-red-400 text-sm">Error: {vrfError.message}</span>
            )}
          </div>
        </div>

        {/* Emergency VRF Override Section */}
        <div className="card p-6 mb-8 border-2 border-[var(--championship-gold)]/30">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-[var(--championship-gold)]/20 flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-[var(--championship-gold)]">
                <path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div>
              <h2 className="text-xl font-bold text-[var(--chrome)]" style={{ fontFamily: 'var(--font-display)' }}>
                Emergency: Manual Number Assignment
              </h2>
              <p className="text-sm text-[var(--smoke)]">
                Use only if VRF is not responding
              </p>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-[var(--championship-gold)]/10 border border-[var(--championship-gold)]/30 mb-4">
            <p className="text-sm text-[var(--smoke)]">
              If Chainlink VRF fails to respond after triggering, use this to manually assign random numbers to all pools stuck in CLOSED state.
              This generates randomness client-side and submits it to the contract.
            </p>
            {poolsStuckInClosed > 0 && (
              <p className="text-sm text-[var(--championship-gold)] mt-2 font-medium">
                {poolsStuckInClosed} pool{poolsStuckInClosed > 1 ? 's' : ''} stuck in CLOSED state (awaiting VRF)
              </p>
            )}
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={emergencySetNumbers}
              disabled={isEmergencyPending || isEmergencyConfirming || poolsStuckInClosed === 0}
              className={`px-6 py-3 rounded-xl font-bold text-sm transition-all disabled:cursor-not-allowed ${
                poolsStuckInClosed === 0
                  ? 'bg-[var(--steel)]/30 text-[var(--smoke)] disabled:opacity-100'
                  : 'bg-gradient-to-r from-[var(--championship-gold)] to-[var(--trophy-gold)] text-[var(--midnight)] hover:shadow-[0_0_20px_rgba(255,215,0,0.3)] disabled:opacity-50'
              }`}
            >
              {isEmergencyPending ? (
                <span className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  Confirm in Wallet...
                </span>
              ) : isEmergencyConfirming ? (
                <span className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  Setting Numbers...
                </span>
              ) : poolsStuckInClosed === 0 ? (
                <span>No Pools Need Emergency Assignment</span>
              ) : (
                <span className="flex items-center gap-2">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                  Emergency: Assign Random Numbers
                </span>
              )}
            </button>

            {isEmergencySuccess && (
              <span className="text-[var(--turf-green)] flex items-center gap-2">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Numbers assigned successfully!
              </span>
            )}

            {emergencyError && (
              <span className="text-red-400 text-sm">Error: {emergencyError.message}</span>
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
              {QUARTER_NAMES.map((name, index) => {
                const isSubmitted = quarterSubmitted[index];
                const isSelected = selectedQuarter === index;

                return (
                  <button
                    key={index}
                    onClick={() => !isSubmitted && setSelectedQuarter(index)}
                    disabled={isSubmitted}
                    className={`py-3 px-4 rounded-xl font-bold text-sm transition-all relative ${
                      isSubmitted
                        ? 'bg-[var(--turf-green)]/20 text-[var(--turf-green)] border border-[var(--turf-green)]/30 cursor-not-allowed'
                        : isSelected
                          ? 'bg-[var(--turf-green)] text-[var(--midnight)] shadow-[0_0_20px_rgba(34,197,94,0.3)]'
                          : 'bg-[var(--steel)]/20 text-[var(--smoke)] hover:bg-[var(--steel)]/40 border border-[var(--steel)]/30'
                    }`}
                  >
                    {name}
                    {isSubmitted && (
                      <span className="absolute top-1 right-1">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-[var(--turf-green)]">
                          <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </span>
                    )}
                  </button>
                );
              })}
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
                disabled={isPending || isConfirming || !teamAScore || !teamBScore || quarterSubmitted[selectedQuarter]}
                className={`px-8 py-3 rounded-xl font-bold text-sm transition-all ${
                  isPending || isConfirming || !teamAScore || !teamBScore || quarterSubmitted[selectedQuarter]
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
                <PoolRow key={poolAddress} address={poolAddress} onOpenStateChange={(isOpen) => {
                  // Only count if not already reported for this pool
                  if (!poolsReportedVRF.has(poolAddress)) {
                    setPoolsReportedVRF(prev => new Set(prev).add(poolAddress));
                    if (isOpen) {
                      setPoolsNeedingVRF(prev => prev + 1);
                    }
                  }
                }} onClosedStateChange={(isClosed) => {
                  // Track pools stuck in CLOSED state (VRF requested but not fulfilled)
                  if (!poolsReportedClosed.has(poolAddress)) {
                    setPoolsReportedClosed(prev => new Set(prev).add(poolAddress));
                    if (isClosed) {
                      setPoolsStuckInClosed(prev => prev + 1);
                    }
                  }
                }} />
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-[var(--smoke)]">No pools found</div>
          )}
        </div>

        {/* VRF Subscription Management */}
        <VRFSubscriptionSection />
      </div>
    </div>
  );
}

function PoolRow({ address, onOpenStateChange, onClosedStateChange }: { address: `0x${string}`; onOpenStateChange?: (isOpen: boolean) => void; onClosedStateChange?: (isClosed: boolean) => void }) {
  const chainId = useChainId();
  const { data: poolInfo, isLoading } = useReadContract({
    address,
    abi: SquaresPoolABI,
    functionName: 'getPoolInfo',
  });

  const state = poolInfo ? (poolInfo as [string, number, bigint, `0x${string}`, bigint, bigint, string, string])[1] : null;
  const isOpen = state === PoolState.OPEN;
  const isClosed = state === PoolState.CLOSED;

  // Report open state to parent once when loaded
  useEffect(() => {
    if (state !== null && onOpenStateChange) {
      onOpenStateChange(isOpen);
    }
  }, [state, isOpen, onOpenStateChange]);

  // Report closed state to parent once when loaded
  useEffect(() => {
    if (state !== null && onClosedStateChange) {
      onClosedStateChange(isClosed);
    }
  }, [state, isClosed, onClosedStateChange]);

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

  const [name, poolState, , paymentToken, totalPot, squaresSold] = poolInfo as [string, number, bigint, `0x${string}`, bigint, bigint, string, string];
  const nextQuarter = getNextQuarter(poolState);

  // Get token info for correct formatting
  const token = findToken(chainId, paymentToken) || ETH_TOKEN;
  const formattedPot = formatTokenAmount(totalPot, token.decimals, 6);

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
            poolState >= PoolState.NUMBERS_ASSIGNED && poolState < PoolState.FINAL_SCORED
              ? 'text-[var(--turf-green)]'
              : poolState === PoolState.FINAL_SCORED
              ? 'text-[var(--championship-gold)]'
              : 'text-[var(--smoke)]'
          }`}>
            {stateToString(poolState)}
            {nextQuarter !== null && (
              <span className="ml-2 text-xs">({QUARTER_NAMES[nextQuarter]})</span>
            )}
          </div>
          <div className="text-sm text-[var(--smoke)]">
            {squaresSold.toString()}/100 squares | {formattedPot} {token.symbol}
          </div>
        </div>
      </div>
    </div>
  );
}

function YieldWithdrawalSection({ pools, onRefresh, factoryAddress }: { pools: `0x${string}`[]; onRefresh: () => void; factoryAddress: `0x${string}` | undefined }) {
  const [hasAavePool, setHasAavePool] = useState(false);
  const [poolsWithYield, setPoolsWithYield] = useState<`0x${string}`[]>([]);
  const { withdrawAll, isPending, isConfirming, isSuccess, error, reset } = useWithdrawAllYield(factoryAddress);

  const handleWithdrawAll = () => {
    withdrawAll();
  };

  // Handle success
  useEffect(() => {
    if (isSuccess) {
      setTimeout(() => {
        setPoolsWithYield([]); // Clear pools after successful withdrawal
        onRefresh();
        reset();
      }, 2000);
    }
  }, [isSuccess, onRefresh, reset]);

  const addPoolWithYield = (poolAddress: `0x${string}`) => {
    setPoolsWithYield(prev => {
      if (prev.includes(poolAddress)) return prev;
      return [...prev, poolAddress];
    });
  };

  const removePoolWithYield = (poolAddress: `0x${string}`) => {
    setPoolsWithYield(prev => prev.filter(addr => addr !== poolAddress));
  };

  return (
    <div className="card p-6 mb-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-[var(--chrome)]" style={{ fontFamily: 'var(--font-display)' }}>
          Yield Withdrawal
        </h2>
        {poolsWithYield.length > 0 && (
          <button
            onClick={handleWithdrawAll}
            disabled={isPending || isConfirming}
            className={`px-4 py-2 rounded-lg font-bold text-sm transition-all ${
              isPending || isConfirming
                ? 'bg-[var(--steel)]/30 text-[var(--smoke)] cursor-not-allowed'
                : 'bg-gradient-to-r from-[var(--championship-gold)] to-[var(--trophy-gold)] text-[var(--midnight)] hover:shadow-[0_0_20px_rgba(255,215,0,0.3)]'
            }`}
          >
            {isPending ? (
              <span className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                Confirm in Wallet...
              </span>
            ) : isConfirming ? (
              <span className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                Withdrawing All...
              </span>
            ) : (
              `Withdraw All (${poolsWithYield.length} pools)`
            )}
          </button>
        )}
      </div>
      <p className="text-[var(--smoke)] mb-4 text-sm">
        Withdraw accrued yield from all finished pools in a single transaction.
      </p>

      {isSuccess && (
        <div className="mb-4 p-3 rounded-lg bg-[var(--turf-green)]/20 border border-[var(--turf-green)]/30">
          <span className="text-sm text-[var(--turf-green)]">✓ Yield withdrawn from all pools successfully!</span>
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-500/20 border border-red-500/30">
          <span className="text-sm text-red-400">Error: {error.message}</span>
        </div>
      )}

      <div className="space-y-3">
        {pools.map((poolAddress) => (
          <PoolYieldRow
            key={poolAddress}
            poolAddress={poolAddress}
            onRefresh={onRefresh}
            onAaveDetected={() => setHasAavePool(true)}
            onYieldDetected={() => addPoolWithYield(poolAddress)}
            onYieldWithdrawn={() => removePoolWithYield(poolAddress)}
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

function PoolYieldRow({ poolAddress, onRefresh, onAaveDetected, onYieldDetected, onYieldWithdrawn }: { poolAddress: `0x${string}`; onRefresh: () => void; onAaveDetected?: () => void; onYieldDetected?: () => void; onYieldWithdrawn?: () => void }) {
  const chainId = useChainId();
  const { yieldInfo, isLoading: isLoadingYield } = usePoolYieldInfo(poolAddress);
  const { isFinished } = usePoolState(poolAddress);
  const { withdrawYield, isPending, isConfirming, isSuccess, error, reset } = useWithdrawYield(poolAddress);
  const [hasWithdrawn, setHasWithdrawn] = useState(false);

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

  // Notify parent when pool has withdrawable yield (finished pool with yield > 0)
  useEffect(() => {
    if (yieldInfo?.yield && yieldInfo.yield > BigInt(0) && isFinished && onYieldDetected) {
      onYieldDetected();
    }
  }, [yieldInfo?.yield, isFinished, onYieldDetected]);

  // Handle withdraw success
  useEffect(() => {
    if (isSuccess) {
      setHasWithdrawn(true);
      setTimeout(() => {
        onYieldWithdrawn?.();
        onRefresh();
        reset();
      }, 2000);
    }
  }, [isSuccess, onRefresh, reset, onYieldWithdrawn]);

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

  const poolName = poolInfo ? (poolInfo as [string, number, bigint, `0x${string}`, bigint, bigint, string, string])[0] : 'Pool';
  const paymentToken = poolInfo ? (poolInfo as [string, number, bigint, `0x${string}`, bigint, bigint, string, string])[3] : zeroAddress;

  // Get token info for correct formatting
  const token = findToken(chainId, paymentToken) || ETH_TOKEN;
  const formattedPrincipal = formatTokenAmount(yieldInfo.principal, token.decimals, 6);
  const formattedYield = formatTokenAmount(yieldInfo.yield, token.decimals, 18);

  const hasYield = yieldInfo.yield > BigInt(0);

  return (
    <div className="p-4 rounded-lg bg-[var(--steel)]/10 border border-[var(--steel)]/30">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-bold text-[var(--chrome)]">{poolName}</div>
          <div className="text-sm text-[var(--smoke)]">
            <code className="text-xs">{poolAddress.slice(0, 10)}...{poolAddress.slice(-8)}</code>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="text-right">
            <div className="text-sm text-[var(--smoke)]">Principal</div>
            <div className="font-medium text-[var(--chrome)]">
              {formattedPrincipal} {token.symbol}
            </div>
          </div>

          <div className="text-right">
            <div className="text-sm text-[var(--smoke)]">Yield</div>
            <div className={`font-bold ${hasYield ? 'text-[var(--turf-green)]' : 'text-[var(--smoke)]'}`}>
              {formattedYield} {token.symbol}
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

          {/* Individual withdraw button as fallback */}
          {isFinished && (
            <button
              onClick={() => withdrawYield()}
              disabled={isPending || isConfirming || !hasYield || hasWithdrawn}
              className={`px-4 py-2 rounded-lg font-bold text-xs transition-all ${
                isPending || isConfirming || !hasYield || hasWithdrawn
                  ? 'bg-[var(--steel)]/30 text-[var(--smoke)] cursor-not-allowed'
                  : 'bg-[var(--championship-gold)]/20 text-[var(--championship-gold)] border border-[var(--championship-gold)]/30 hover:bg-[var(--championship-gold)]/30'
              }`}
            >
              {isPending ? 'Confirm...' : isConfirming ? 'Withdrawing...' : hasWithdrawn ? 'Withdrawn' : hasYield ? 'Withdraw' : 'No Yield'}
            </button>
          )}
        </div>
      </div>
      {isSuccess && (
        <div className="mt-2 p-2 rounded bg-[var(--turf-green)]/20 border border-[var(--turf-green)]/30">
          <span className="text-xs text-[var(--turf-green)]">✓ Yield withdrawn successfully!</span>
        </div>
      )}
      {error && (
        <div className="mt-2 p-2 rounded bg-red-500/20 border border-red-500/30">
          <span className="text-xs text-red-400">Error: {error.message}</span>
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

function VRFSubscriptionSection() {
  const { address } = useAccount();
  const [fundAmount, setFundAmount] = useState<string>('0.01');
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  const { subscriptionId, isLoading: isLoadingSubId, refetch: refetchSubId } = useVRFSubscriptionId();
  const {
    fundVRF,
    isPending: isFundPending,
    isConfirming: isFundConfirming,
    isSuccess: isFundSuccess,
    error: fundError,
    reset: resetFund,
  } = useFundVRFSubscription();
  const {
    cancelAndWithdraw,
    isPending: isCancelPending,
    isConfirming: isCancelConfirming,
    isSuccess: isCancelSuccess,
    error: cancelError,
    reset: resetCancel,
  } = useCancelVRFSubscription();

  // Refresh subscription ID on success
  if (isFundSuccess) {
    setTimeout(() => {
      refetchSubId();
      resetFund();
      setFundAmount('0.01');
    }, 2000);
  }

  if (isCancelSuccess) {
    setTimeout(() => {
      refetchSubId();
      resetCancel();
      setShowCancelConfirm(false);
    }, 2000);
  }

  const handleFund = () => {
    const amountEth = parseFloat(fundAmount);
    if (isNaN(amountEth) || amountEth <= 0) {
      alert('Please enter a valid amount');
      return;
    }
    const amountWei = BigInt(Math.floor(amountEth * 1e18));
    fundVRF(amountWei);
  };

  const handleCancel = () => {
    if (!address) {
      alert('Wallet not connected');
      return;
    }
    cancelAndWithdraw(address);
  };

  const hasSubscription = subscriptionId && subscriptionId > BigInt(0);

  return (
    <div className="card p-6 mb-8">
      <h2 className="text-xl font-bold text-[var(--chrome)] mb-4" style={{ fontFamily: 'var(--font-display)' }}>
        VRF Subscription Management
      </h2>
      <p className="text-[var(--smoke)] mb-4 text-sm">
        Manage the Chainlink VRF subscription. Top up when balance is low, or cancel and withdraw remaining funds.
      </p>

      {/* Subscription Status */}
      <div className="p-4 rounded-xl bg-[var(--steel)]/10 border border-[var(--steel)]/30 mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
              hasSubscription
                ? 'bg-[var(--turf-green)]/20 border border-[var(--turf-green)]/30'
                : 'bg-red-500/20 border border-red-500/30'
            }`}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className={hasSubscription ? 'text-[var(--turf-green)]' : 'text-red-400'}>
                <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
                <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </div>
            <div>
              <p className="text-sm text-[var(--smoke)]">Subscription ID</p>
              <p className={`font-bold ${hasSubscription ? 'text-[var(--chrome)]' : 'text-red-400'}`}>
                {isLoadingSubId ? 'Loading...' : hasSubscription ? subscriptionId.toString() : 'No Active Subscription'}
              </p>
            </div>
          </div>
          <a
            href="https://vrf.chain.link"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-[var(--turf-green)] hover:underline flex items-center gap-1"
          >
            View on Chainlink
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3" />
            </svg>
          </a>
        </div>
      </div>

      {hasSubscription && (
        <>
          {/* Fund Subscription */}
          <div className="p-4 rounded-xl bg-[var(--turf-green)]/10 border border-[var(--turf-green)]/30 mb-4">
            <h3 className="font-bold text-[var(--chrome)] mb-3 flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-[var(--turf-green)]">
                <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              Top Up Subscription
            </h3>
            <p className="text-sm text-[var(--smoke)] mb-3">
              Add ETH to the VRF subscription to ensure random number generation continues working.
            </p>
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <div className="relative">
                  <input
                    type="number"
                    step="0.001"
                    min="0.001"
                    value={fundAmount}
                    onChange={(e) => setFundAmount(e.target.value)}
                    placeholder="0.01"
                    className="w-full px-4 py-3 rounded-lg bg-[var(--midnight)]/50 border border-[var(--steel)]/30 text-[var(--chrome)] focus:outline-none focus:border-[var(--turf-green)] pr-16"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--smoke)]">ETH</span>
                </div>
              </div>
              <button
                onClick={handleFund}
                disabled={isFundPending || isFundConfirming}
                className="px-6 py-3 rounded-lg font-bold text-sm bg-[var(--turf-green)] text-[var(--midnight)] hover:shadow-[0_0_15px_rgba(34,197,94,0.3)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isFundPending ? 'Confirm...' : isFundConfirming ? 'Sending...' : 'Fund'}
              </button>
            </div>
            {isFundSuccess && (
              <div className="mt-3 p-2 rounded bg-[var(--turf-green)]/20 border border-[var(--turf-green)]/30">
                <span className="text-sm text-[var(--turf-green)]">VRF subscription funded successfully!</span>
              </div>
            )}
            {fundError && (
              <div className="mt-3 p-2 rounded bg-red-500/20 border border-red-500/30">
                <span className="text-sm text-red-400">Error: {fundError.message}</span>
              </div>
            )}
          </div>

          {/* Cancel Subscription */}
          <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30">
            <h3 className="font-bold text-[var(--chrome)] mb-3 flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-red-400">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
                <path d="M15 9l-6 6M9 9l6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              Cancel & Withdraw
            </h3>
            <p className="text-sm text-[var(--smoke)] mb-3">
              Cancel the VRF subscription and withdraw remaining ETH to your wallet. This will disable random number generation until a new subscription is created.
            </p>

            {!showCancelConfirm ? (
              <button
                onClick={() => setShowCancelConfirm(true)}
                className="px-6 py-3 rounded-lg font-bold text-sm bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 transition-all"
              >
                Cancel Subscription
              </button>
            ) : (
              <div className="p-3 rounded-lg bg-red-500/20 border border-red-500/50">
                <p className="text-sm text-red-400 mb-3 font-medium">
                  Are you sure? This will cancel the subscription and send remaining funds to your wallet.
                </p>
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleCancel}
                    disabled={isCancelPending || isCancelConfirming}
                    className="px-4 py-2 rounded-lg font-bold text-sm bg-red-500 text-white hover:bg-red-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isCancelPending ? 'Confirm...' : isCancelConfirming ? 'Cancelling...' : 'Yes, Cancel'}
                  </button>
                  <button
                    onClick={() => setShowCancelConfirm(false)}
                    className="px-4 py-2 rounded-lg font-bold text-sm bg-[var(--steel)]/30 text-[var(--smoke)] hover:bg-[var(--steel)]/50 transition-all"
                  >
                    No, Keep It
                  </button>
                </div>
              </div>
            )}
            {isCancelSuccess && (
              <div className="mt-3 p-2 rounded bg-[var(--turf-green)]/20 border border-[var(--turf-green)]/30">
                <span className="text-sm text-[var(--turf-green)]">Subscription cancelled and funds withdrawn!</span>
              </div>
            )}
            {cancelError && (
              <div className="mt-3 p-2 rounded bg-red-500/20 border border-red-500/30">
                <span className="text-sm text-red-400">Error: {cancelError.message}</span>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
