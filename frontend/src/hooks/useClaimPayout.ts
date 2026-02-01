'use client';

import { useReadContract } from 'wagmi';
import { SquaresPoolABI } from '@/lib/contracts';

export function useFinalDistributionShare(poolAddress: `0x${string}` | undefined, userAddress: `0x${string}` | undefined) {
  const { data, isLoading, refetch } = useReadContract({
    address: poolAddress,
    abi: SquaresPoolABI,
    functionName: 'getFinalDistributionShare',
    args: userAddress ? [userAddress] : undefined,
    query: {
      enabled: !!poolAddress && !!userAddress,
    },
  });

  return {
    share: data?.[0] as bigint | undefined,
    claimed: data?.[1] as boolean | undefined,
    isLoading,
    refetch,
  };
}

export function useUnclaimedInfo(poolAddress: `0x${string}` | undefined) {
  const { data, isLoading, refetch } = useReadContract({
    address: poolAddress,
    abi: SquaresPoolABI,
    functionName: 'getUnclaimedInfo',
    query: {
      enabled: !!poolAddress,
    },
  });

  return {
    rolledAmount: data?.[0] as bigint | undefined,
    distributionPool: data?.[1] as bigint | undefined,
    distributionReady: data?.[2] as boolean | undefined,
    isLoading,
    refetch,
  };
}
