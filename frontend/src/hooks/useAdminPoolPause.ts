'use client';

import { useReadContract, useWriteContract, useWaitForTransactionReceipt, useAccount } from 'wagmi';
import { SquaresFactoryABI } from '@/lib/abis/SquaresFactory';
import { getFactoryAddress } from '@/lib/contracts';

export function usePoolCreationPaused() {
  const { chainId } = useAccount();
  const factoryAddress = chainId ? getFactoryAddress(chainId) : undefined;

  const { data: isPaused, isLoading, refetch } = useReadContract({
    address: factoryAddress,
    abi: SquaresFactoryABI,
    functionName: 'poolCreationPaused',
    query: {
      enabled: !!factoryAddress && factoryAddress !== '0x0000000000000000000000000000000000000000',
    },
  });

  return {
    isPaused: isPaused ?? false,
    isLoading,
    refetch,
  };
}

export function useSetPoolCreationPaused() {
  const { chainId } = useAccount();
  const factoryAddress = chainId ? getFactoryAddress(chainId) : undefined;

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

  const setPoolCreationPaused = (paused: boolean) => {
    if (!factoryAddress || factoryAddress === '0x0000000000000000000000000000000000000000') {
      return;
    }

    writeContract({
      address: factoryAddress,
      abi: SquaresFactoryABI,
      functionName: 'setPoolCreationPaused',
      args: [paused],
    });
  };

  return {
    setPoolCreationPaused,
    isPending,
    isConfirming,
    isSuccess,
    error,
    reset,
    hash,
  };
}
