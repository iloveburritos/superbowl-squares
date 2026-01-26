'use client';

import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { SquaresFactoryABI, getFactoryAddress, type PoolParams } from '@/lib/contracts';
import { useChainId } from 'wagmi';
import { decodeEventLog } from 'viem';

export function useFactoryAddress() {
  const chainId = useChainId();
  return getFactoryAddress(chainId);
}

export function useAllPools(offset: number = 0, limit: number = 20) {
  const factoryAddress = useFactoryAddress();

  const { data, isLoading, error, refetch } = useReadContract({
    address: factoryAddress,
    abi: SquaresFactoryABI,
    functionName: 'getAllPools',
    args: [BigInt(offset), BigInt(limit)],
    query: {
      enabled: !!factoryAddress,
    },
  });

  // Type assertion for getAllPools return value
  const result = data as readonly [`0x${string}`[], bigint] | undefined;

  return {
    pools: result?.[0],
    total: result?.[1],
    isLoading,
    error,
    refetch,
  };
}

export function usePoolsByCreator(creator: `0x${string}` | undefined) {
  const factoryAddress = useFactoryAddress();

  const { data, isLoading, error, refetch } = useReadContract({
    address: factoryAddress,
    abi: SquaresFactoryABI,
    functionName: 'getPoolsByCreator',
    args: creator ? [creator] : undefined,
    query: {
      enabled: !!factoryAddress && !!creator,
    },
  });

  return {
    pools: data as `0x${string}`[] | undefined,
    isLoading,
    error,
    refetch,
  };
}

export function usePoolCount() {
  const factoryAddress = useFactoryAddress();

  const { data, isLoading, error } = useReadContract({
    address: factoryAddress,
    abi: SquaresFactoryABI,
    functionName: 'getPoolCount',
    query: {
      enabled: !!factoryAddress,
    },
  });

  return {
    count: data as bigint | undefined,
    isLoading,
    error,
  };
}

export function useCreatePool() {
  const factoryAddress = useFactoryAddress();
  const isFactoryConfigured = factoryAddress && factoryAddress !== '0x0000000000000000000000000000000000000000';

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
    data: receipt,
  } = useWaitForTransactionReceipt({
    hash,
  });

  const createPool = async (params: PoolParams) => {
    if (!factoryAddress || !isFactoryConfigured) {
      console.error('Factory contract not configured for this chain');
      return;
    }

    writeContract({
      address: factoryAddress,
      abi: SquaresFactoryABI,
      functionName: 'createPool',
      args: [params],
    });
  };

  // Extract pool address from PoolCreated event in receipt logs
  let poolAddress: `0x${string}` | undefined;

  if (receipt?.logs && factoryAddress) {
    for (const log of receipt.logs) {
      // Only decode logs from the factory contract
      if (log.address.toLowerCase() !== factoryAddress.toLowerCase()) {
        continue;
      }
      try {
        const decoded = decodeEventLog({
          abi: SquaresFactoryABI,
          data: log.data,
          topics: log.topics,
        });
        if (decoded.eventName === 'PoolCreated') {
          const args = decoded.args as unknown as { pool: `0x${string}`; creator: `0x${string}` };
          poolAddress = args.pool;
          break;
        }
      } catch {
        // Not a PoolCreated event, continue
      }
    }
  }

  return {
    createPool,
    isPending,
    isConfirming,
    isSuccess,
    error: writeError,
    hash,
    poolAddress,
    reset,
    isFactoryConfigured,
  };
}
