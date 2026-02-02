'use client';

import { useReadContract, useReadContracts, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { SquaresFactoryABI, getFactoryAddress, type PoolParams } from '@/lib/contracts';
import { SquaresPoolABI } from '@/lib/abis/SquaresPool';
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

export function usePoolsParticipating(userAddress: `0x${string}` | undefined) {
  // 1. Get all pool addresses
  const { pools: allPools, isLoading: poolsLoading } = useAllPools(0, 1000);

  // 2. Batch check userSquareCount for each pool using useReadContracts (multicall)
  const contracts = (allPools ?? []).map((pool) => ({
    address: pool,
    abi: SquaresPoolABI,
    functionName: 'userSquareCount' as const,
    args: [userAddress] as readonly [`0x${string}`],
  }));

  const { data: squareCounts, isLoading: countsLoading } = useReadContracts({
    contracts,
    query: {
      enabled: !!userAddress && !!allPools?.length,
    },
  });

  // 3. Filter to pools where user owns squares (count > 0) and include the count
  const participatingPools = allPools?.reduce<{ address: `0x${string}`; squareCount: number }[]>(
    (acc, pool, i) => {
      const result = squareCounts?.[i];
      if (result?.status === 'success' && result.result && Number(result.result) > 0) {
        acc.push({ address: pool, squareCount: Number(result.result) });
      }
      return acc;
    },
    []
  );

  return {
    pools: participatingPools,
    isLoading: poolsLoading || countsLoading,
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

export function usePoolCreationCost() {
  const factoryAddress = useFactoryAddress();

  const { data: creationFee, isLoading: isLoadingFee } = useReadContract({
    address: factoryAddress,
    abi: SquaresFactoryABI,
    functionName: 'creationFee',
    query: {
      enabled: !!factoryAddress,
    },
  });

  const { data: vrfFundingAmount, isLoading: isLoadingVrf } = useReadContract({
    address: factoryAddress,
    abi: SquaresFactoryABI,
    functionName: 'vrfFundingAmount',
    query: {
      enabled: !!factoryAddress,
    },
  });

  const totalCost = creationFee !== undefined && vrfFundingAmount !== undefined
    ? (creationFee as bigint) + (vrfFundingAmount as bigint)
    : undefined;

  return {
    creationFee: creationFee as bigint | undefined,
    vrfFundingAmount: vrfFundingAmount as bigint | undefined,
    totalCost,
    isLoading: isLoadingFee || isLoadingVrf,
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
    isError: isReceiptError,
    error: receiptError,
    data: receipt,
    refetch: refetchReceipt,
  } = useWaitForTransactionReceipt({
    hash,
  });

  const createPool = async (params: PoolParams, value?: bigint) => {
    if (!factoryAddress || !isFactoryConfigured) {
      console.error('Factory contract not configured for this chain');
      return;
    }

    writeContract({
      address: factoryAddress,
      abi: SquaresFactoryABI,
      functionName: 'createPool',
      args: [params],
      value: value || BigInt(0),
      gas: BigInt(5000000), // Manual gas limit to avoid estimation issues
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
    isReceiptError,
    error: writeError || receiptError,
    hash,
    poolAddress,
    reset,
    refetchReceipt,
    isFactoryConfigured,
  };
}
