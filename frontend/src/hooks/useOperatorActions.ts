'use client';

import { useCallback } from 'react';
import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { SquaresPoolABI } from '@/lib/contracts';

/**
 * Hook for submitting scores (operator fallback when Chainlink Functions fails)
 */
export function useSubmitScore(poolAddress: `0x${string}` | undefined) {
  const {
    writeContract,
    data: hash,
    isPending,
    error,
    reset,
  } = useWriteContract();

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  });

  const submitScore = useCallback(
    async (quarter: number, teamAScore: number, teamBScore: number) => {
      if (!poolAddress) return;

      writeContract({
        address: poolAddress,
        abi: SquaresPoolABI,
        functionName: 'submitScore',
        args: [quarter, teamAScore, teamBScore],
      });
    },
    [poolAddress, writeContract]
  );

  return {
    submitScore,
    isPending,
    isConfirming,
    isSuccess,
    error,
    hash,
    reset,
  };
}

