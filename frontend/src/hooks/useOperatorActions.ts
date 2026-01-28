'use client';

import { useCallback } from 'react';
import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { SquaresPoolABI } from '@/lib/contracts';

/**
 * Hook for manually triggering VRF (operator fallback)
 * This is used when Chainlink Automation doesn't trigger automatically
 */
export function useClosePoolAndRequestVRF(poolAddress: `0x${string}` | undefined) {
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

  const closePoolAndRequestVRF = useCallback(async () => {
    if (!poolAddress) return;

    writeContract({
      address: poolAddress,
      abi: SquaresPoolABI,
      functionName: 'closePoolAndRequestVRF',
    });
  }, [poolAddress, writeContract]);

  return {
    closePoolAndRequestVRF,
    isPending,
    isConfirming,
    isSuccess,
    error,
    hash,
    reset,
  };
}

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

/**
 * Hook for fetching scores via Chainlink Functions
 */
export function useFetchScore(poolAddress: `0x${string}` | undefined) {
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

  const fetchScore = useCallback(
    async (quarter: number) => {
      if (!poolAddress) return;

      writeContract({
        address: poolAddress,
        abi: SquaresPoolABI,
        functionName: 'fetchScore',
        args: [quarter],
      });
    },
    [poolAddress, writeContract]
  );

  return {
    fetchScore,
    isPending,
    isConfirming,
    isSuccess,
    error,
    hash,
    reset,
  };
}
