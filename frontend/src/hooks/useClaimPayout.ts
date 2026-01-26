'use client';

import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { SquaresPoolABI, Quarter } from '@/lib/contracts';

export function useClaimPayout(poolAddress: `0x${string}` | undefined) {
  const {
    writeContract,
    data: hash,
    isPending,
    error: writeError,
    reset,
  } = useWriteContract();

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  });

  const claimPayout = async (quarter: Quarter) => {
    if (!poolAddress) return;

    writeContract({
      address: poolAddress,
      abi: SquaresPoolABI,
      functionName: 'claimPayout',
      args: [quarter],
    });
  };

  return {
    claimPayout,
    isPending,
    isConfirming,
    isSuccess,
    error: writeError,
    hash,
    reset,
  };
}
