'use client';

import { useWriteContract, useWaitForTransactionReceipt, useReadContract } from 'wagmi';
import { SquaresFactoryABI } from '@/lib/abis/SquaresFactory';
import { useFactoryAddress } from './useFactory';

// Score admin address
export const SCORE_ADMIN_ADDRESS = '0xc4364F3a17bb60F3A56aDbe738414eeEB523C6B2' as const;

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

export function useVRFSubscriptionId() {
  const factoryAddress = useFactoryAddress();

  const { data: subscriptionId, isLoading, error, refetch } = useReadContract({
    address: factoryAddress,
    abi: SquaresFactoryABI,
    functionName: 'defaultVRFSubscriptionId',
    query: {
      enabled: !!factoryAddress,
    },
  });

  return {
    subscriptionId: subscriptionId as bigint | undefined,
    isLoading,
    error,
    refetch,
  };
}

export function useFundVRFSubscription() {
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

  const fundVRF = (amountInWei: bigint) => {
    if (!factoryAddress) {
      console.error('Factory address not configured');
      return;
    }

    writeContract({
      address: factoryAddress,
      abi: SquaresFactoryABI,
      functionName: 'fundVRFSubscription',
      value: amountInWei,
    });
  };

  return {
    fundVRF,
    isPending,
    isConfirming,
    isSuccess,
    isReceiptError,
    error: writeError || receiptError,
    hash,
    reset,
  };
}

export function useCancelVRFSubscription() {
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

  const cancelAndWithdraw = (toAddress: `0x${string}`) => {
    if (!factoryAddress) {
      console.error('Factory address not configured');
      return;
    }

    writeContract({
      address: factoryAddress,
      abi: SquaresFactoryABI,
      functionName: 'cancelAndWithdrawVRFSubscription',
      args: [toAddress],
    });
  };

  return {
    cancelAndWithdraw,
    isPending,
    isConfirming,
    isSuccess,
    isReceiptError,
    error: writeError || receiptError,
    hash,
    reset,
  };
}
