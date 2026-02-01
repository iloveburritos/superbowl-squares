'use client';

import { useWriteContract, useWaitForTransactionReceipt, useReadContract } from 'wagmi';
import { SquaresFactoryABI } from '@/lib/abis/SquaresFactory';
import { useFactoryAddress } from './useFactory';

// Score admin address
export const SCORE_ADMIN_ADDRESS = '0x51E5E6F9933fD28B62d714C3f7febECe775b6b95' as const;

export function useScoreAdmin() {
  const factoryAddress = useFactoryAddress();

  const { data: scoreAdmin, isLoading, error } = useReadContract({
    address: factoryAddress,
    abi: SquaresFactoryABI,
    functionName: 'scoreAdmin',
    query: {
      enabled: !!factoryAddress,
    },
  });

  return {
    scoreAdmin: scoreAdmin as `0x${string}` | undefined,
    isLoading,
    error,
  };
}

export function useIsScoreAdmin(address: `0x${string}` | undefined) {
  const { scoreAdmin, isLoading } = useScoreAdmin();

  return {
    isScoreAdmin: address && scoreAdmin
      ? address.toLowerCase() === scoreAdmin.toLowerCase() ||
        address.toLowerCase() === SCORE_ADMIN_ADDRESS.toLowerCase()
      : false,
    isLoading,
  };
}

export function useAdminScoreSubmit() {
  const factoryAddress = useFactoryAddress();

  const {
    writeContract,
    data: hash,
    isPending,
    error: writeError,
    reset,
  } = useWriteContract();

  const {
    isLoading: isConfirming,
    isSuccess,
    isError: isReceiptError,
    error: receiptError,
  } = useWaitForTransactionReceipt({
    hash,
    confirmations: 1,
  });

  const submitScoreToAllPools = (quarter: number, teamAScore: number, teamBScore: number) => {
    if (!factoryAddress) {
      console.error('Factory address not configured');
      return;
    }

    writeContract({
      address: factoryAddress,
      abi: SquaresFactoryABI,
      functionName: 'submitScoreToAllPools',
      args: [quarter, teamAScore, teamBScore],
    });
  };

  return {
    submitScoreToAllPools,
    isPending,
    isConfirming,
    isSuccess,
    isReceiptError,
    error: writeError || receiptError,
    hash,
    reset,
  };
}

export function useAdminTriggerVRF() {
  const factoryAddress = useFactoryAddress();

  const {
    writeContract,
    data: hash,
    isPending,
    error: writeError,
    reset,
  } = useWriteContract();

  const {
    isLoading: isConfirming,
    isSuccess,
    isError: isReceiptError,
    error: receiptError,
  } = useWaitForTransactionReceipt({
    hash,
    confirmations: 1,
  });

  const triggerVRF = () => {
    if (!factoryAddress) {
      console.error('Factory address not configured');
      return;
    }

    writeContract({
      address: factoryAddress,
      abi: SquaresFactoryABI,
      functionName: 'triggerVRFForAllPools',
    });
  };

  return {
    triggerVRF,
    isPending,
    isConfirming,
    isSuccess,
    isReceiptError,
    error: writeError || receiptError,
    hash,
    reset,
  };
}
