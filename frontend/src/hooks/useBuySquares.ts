'use client';

import { useState, useEffect } from 'react';
import { useWriteContract, useWaitForTransactionReceipt, useReadContract, useAccount } from 'wagmi';
import { SquaresPoolABI } from '@/lib/contracts';
import { zeroAddress } from 'viem';

// Standard ERC20 ABI for approve and allowance
const ERC20_ABI = [
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
  },
  {
    name: 'allowance',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ type: 'uint256' }],
  },
] as const;

export function useBuySquares(
  poolAddress: `0x${string}` | undefined,
  paymentToken: `0x${string}` = zeroAddress
) {
  const { address: userAddress } = useAccount();
  const [step, setStep] = useState<'idle' | 'approving' | 'buying'>('idle');

  const isNativePayment = paymentToken === zeroAddress;

  // Check ERC20 allowance
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: paymentToken,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: userAddress && poolAddress ? [userAddress, poolAddress] : undefined,
    query: {
      enabled: !isNativePayment && !!userAddress && !!poolAddress,
    },
  });

  // Write contract for approval
  const {
    writeContract: writeApprove,
    data: approveHash,
    isPending: isApprovePending,
    error: approveError,
    reset: resetApprove,
  } = useWriteContract();

  // Wait for approval transaction
  const { isLoading: isApproveConfirming, isSuccess: isApproveSuccess } = useWaitForTransactionReceipt({
    hash: approveHash,
  });

  // Write contract for buying squares
  const {
    writeContract: writeBuy,
    data: buyHash,
    isPending: isBuyPending,
    error: buyError,
    reset: resetBuy,
  } = useWriteContract();

  // Wait for buy transaction
  const { isLoading: isBuyConfirming, isSuccess: isBuySuccess } = useWaitForTransactionReceipt({
    hash: buyHash,
  });

  // When approval succeeds, refetch allowance
  useEffect(() => {
    if (isApproveSuccess) {
      refetchAllowance();
    }
  }, [isApproveSuccess, refetchAllowance]);

  // Check if approval is needed for a given amount
  const needsApproval = (amount: bigint): boolean => {
    if (isNativePayment) return false;
    if (!allowance) return true;
    return allowance < amount;
  };

  // Approve ERC20 spending (amount is required)
  const approve = async (amount: bigint) => {
    if (!poolAddress || isNativePayment || !amount) return;

    setStep('approving');

    writeApprove({
      address: paymentToken,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [poolAddress, amount],
    });
  };

  // Buy squares
  const buySquares = async (positions: number[], squarePrice: bigint, password: string = '') => {
    if (!poolAddress) return;

    const totalValue = squarePrice * BigInt(positions.length);

    // Check if we need approval first
    if (!isNativePayment && needsApproval(totalValue)) {
      // Need to approve first - only approve exact amount needed
      setStep('approving');
      writeApprove({
        address: paymentToken,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [poolAddress, totalValue],
      });
      return;
    }

    // Proceed with buying
    setStep('buying');

    writeBuy({
      address: poolAddress,
      abi: SquaresPoolABI,
      functionName: 'buySquares',
      args: [positions.map((p) => p), password],
      value: isNativePayment ? totalValue : BigInt(0),
    });
  };

  // Continue buying after approval
  const continueBuyAfterApproval = async (positions: number[], squarePrice: bigint, password: string = '') => {
    if (!poolAddress) return;

    const totalValue = squarePrice * BigInt(positions.length);

    setStep('buying');

    writeBuy({
      address: poolAddress,
      abi: SquaresPoolABI,
      functionName: 'buySquares',
      args: [positions.map((p) => p), password],
      value: isNativePayment ? totalValue : BigInt(0),
    });
  };

  // Reset all state
  const reset = () => {
    setStep('idle');
    resetApprove();
    resetBuy();
  };

  // Combined state
  const isPending = isApprovePending || isBuyPending;
  const isConfirming = isApproveConfirming || isBuyConfirming;
  const isSuccess = isBuySuccess;
  const error = approveError || buyError;
  const hash = buyHash || approveHash;

  return {
    buySquares,
    approve,
    continueBuyAfterApproval,
    needsApproval,
    allowance,
    refetchAllowance,
    step,
    isPending,
    isConfirming,
    isSuccess,
    isApproveSuccess,
    error,
    hash,
    reset,
    isNativePayment,
  };
}
