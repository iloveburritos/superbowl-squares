'use client';

import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { SquaresPoolABI } from '@/lib/contracts';
import { parseEther } from 'viem';

export function useBuySquares(poolAddress: `0x${string}` | undefined) {
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

  const buySquares = async (positions: number[], squarePrice: bigint) => {
    if (!poolAddress) return;

    const totalValue = squarePrice * BigInt(positions.length);

    writeContract({
      address: poolAddress,
      abi: SquaresPoolABI,
      functionName: 'buySquares',
      args: [positions.map((p) => p)],
      value: totalValue,
    });
  };

  return {
    buySquares,
    isPending,
    isConfirming,
    isSuccess,
    error: writeError,
    hash,
    reset,
  };
}
