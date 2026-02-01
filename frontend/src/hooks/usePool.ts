'use client';

import { useReadContract, useReadContracts } from 'wagmi';
import { usePublicClient } from 'wagmi';
import { useEffect, useState } from 'react';
import { SquaresPoolABI, PoolState, Quarter, type PoolInfo, type Score } from '@/lib/contracts';
export function usePoolInfo(poolAddress: `0x${string}` | undefined) {
  const { data, isLoading, error, refetch } = useReadContract({
    address: poolAddress,
    abi: SquaresPoolABI,
    functionName: 'getPoolInfo',
    query: {
      enabled: !!poolAddress,
    },
  });

  const poolInfo: PoolInfo | undefined = data
    ? {
        name: data[0],
        state: data[1] as PoolState,
        squarePrice: data[2],
        paymentToken: data[3],
        totalPot: data[4],
        squaresSold: data[5],
        teamAName: data[6],
        teamBName: data[7],
      }
    : undefined;

  return { poolInfo, isLoading, error, refetch };
}

export function usePoolGrid(poolAddress: `0x${string}` | undefined) {
  const { data, isLoading, error, refetch } = useReadContract({
    address: poolAddress,
    abi: SquaresPoolABI,
    functionName: 'getGrid',
    query: {
      enabled: !!poolAddress,
    },
  });

  return {
    grid: data as `0x${string}`[] | undefined,
    isLoading,
    error,
    refetch,
  };
}

export function usePoolNumbers(poolAddress: `0x${string}` | undefined) {
  const { data, isLoading, error, refetch } = useReadContract({
    address: poolAddress,
    abi: SquaresPoolABI,
    functionName: 'getNumbers',
    query: {
      enabled: !!poolAddress,
    },
  });

  return {
    rowNumbers: data?.[0] as number[] | undefined,
    colNumbers: data?.[1] as number[] | undefined,
    isLoading,
    error,
    refetch,
  };
}

export function usePoolScore(poolAddress: `0x${string}` | undefined, quarter: Quarter) {
  const { data, isLoading, error, refetch } = useReadContract({
    address: poolAddress,
    abi: SquaresPoolABI,
    functionName: 'getScore',
    args: [quarter],
    query: {
      enabled: !!poolAddress,
    },
  });

  const score: Score | undefined = data
    ? {
        teamAScore: (data as any).teamAScore,
        teamBScore: (data as any).teamBScore,
        submitted: (data as any).submitted,
        settled: (data as any).settled,
        requestId: (data as any).requestId,
      }
    : undefined;

  return { score, isLoading, error, refetch };
}

export function usePoolWinner(poolAddress: `0x${string}` | undefined, quarter: Quarter) {
  const { data, isLoading, error, refetch } = useReadContract({
    address: poolAddress,
    abi: SquaresPoolABI,
    functionName: 'getWinner',
    args: [quarter],
    query: {
      enabled: !!poolAddress,
    },
  });

  return {
    winner: data?.[0] as `0x${string}` | undefined,
    payout: data?.[1] as bigint | undefined,
    isLoading,
    error,
    refetch,
  };
}

export function usePoolOperator(poolAddress: `0x${string}` | undefined) {
  const { data, isLoading, error } = useReadContract({
    address: poolAddress,
    abi: SquaresPoolABI,
    functionName: 'operator',
    query: {
      enabled: !!poolAddress,
    },
  });

  return { operator: data as `0x${string}` | undefined, isLoading, error };
}

// ABI fragment for legacy revealDeadline (for backward compatibility with old contracts)
const legacyRevealDeadlineABI = [
  {
    inputs: [],
    name: 'revealDeadline',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

export function usePoolDeadlines(poolAddress: `0x${string}` | undefined) {
  const { data, isLoading, error } = useReadContracts({
    contracts: [
      {
        address: poolAddress,
        abi: SquaresPoolABI,
        functionName: 'purchaseDeadline',
      },
      {
        address: poolAddress,
        abi: SquaresPoolABI,
        functionName: 'vrfTriggerTime',
      },
      // Fallback for old contracts that use revealDeadline
      {
        address: poolAddress,
        abi: legacyRevealDeadlineABI,
        functionName: 'revealDeadline',
      },
    ],
    query: {
      enabled: !!poolAddress,
    },
  });

  // Use vrfTriggerTime if available, otherwise fall back to revealDeadline
  const vrfTriggerTime = (data?.[1]?.result as bigint | undefined) ?? (data?.[2]?.result as bigint | undefined);

  return {
    purchaseDeadline: data?.[0]?.result as bigint | undefined,
    vrfTriggerTime,
    isLoading,
    error,
  };
}

export function useUserSquareCount(
  poolAddress: `0x${string}` | undefined,
  userAddress: `0x${string}` | undefined
) {
  const { data, isLoading, error } = useReadContract({
    address: poolAddress,
    abi: SquaresPoolABI,
    functionName: 'userSquareCount',
    args: userAddress ? [userAddress] : undefined,
    query: {
      enabled: !!poolAddress && !!userAddress,
    },
  });

  return { squareCount: data as number | undefined, isLoading, error };
}

export function useMaxSquaresPerUser(poolAddress: `0x${string}` | undefined) {
  const { data, isLoading, error } = useReadContract({
    address: poolAddress,
    abi: SquaresPoolABI,
    functionName: 'maxSquaresPerUser',
    query: {
      enabled: !!poolAddress,
    },
  });

  return { maxSquares: data as number | undefined, isLoading, error };
}

export function useIsPrivate(poolAddress: `0x${string}` | undefined) {
  const { data, isLoading, error } = useReadContract({
    address: poolAddress,
    abi: SquaresPoolABI,
    functionName: 'isPrivate',
    query: {
      enabled: !!poolAddress,
    },
  });

  return { isPrivate: data as boolean | undefined, isLoading, error };
}

export function usePasswordHash(poolAddress: `0x${string}` | undefined) {
  const { data, isLoading, error } = useReadContract({
    address: poolAddress,
    abi: SquaresPoolABI,
    functionName: 'passwordHash',
    query: {
      enabled: !!poolAddress,
    },
  });

  return { passwordHash: data as `0x${string}` | undefined, isLoading, error };
}

export function usePayoutPercentages(poolAddress: `0x${string}` | undefined) {
  const { data, isLoading, error } = useReadContract({
    address: poolAddress,
    abi: SquaresPoolABI,
    functionName: 'getPayoutPercentages',
    query: {
      enabled: !!poolAddress,
    },
  });

  return {
    percentages: data as [number, number, number, number] | undefined,
    isLoading,
    error,
  };
}

export function useHasClaimed(
  poolAddress: `0x${string}` | undefined,
  userAddress: `0x${string}` | undefined,
  quarter: Quarter
) {
  const { data, isLoading, error } = useReadContract({
    address: poolAddress,
    abi: SquaresPoolABI,
    functionName: 'hasClaimed',
    args: userAddress ? [userAddress, quarter] : undefined,
    query: {
      enabled: !!poolAddress && !!userAddress,
    },
  });

  return { hasClaimed: data as boolean | undefined, isLoading, error };
}
