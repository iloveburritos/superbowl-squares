'use client';

import { useWriteContract, useWaitForTransactionReceipt, useWatchContractEvent } from 'wagmi';
import { SquaresPoolABI } from '@/lib/abis';
import { Quarter } from '@/lib/contracts';
import { useState, useCallback } from 'react';

interface ScoreVerificationResult {
  quarter: Quarter;
  patriotsScore: number;
  seahawksScore: number;
  verified: boolean;
  sources: string[];
}

export function useFetchScore(poolAddress: `0x${string}`) {
  const [verificationResult, setVerificationResult] = useState<ScoreVerificationResult | null>(null);
  const [isFetching, setIsFetching] = useState(false);

  const { data: hash, writeContract, isPending, error } = useWriteContract();

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  });

  // Watch for ScoreVerified events
  useWatchContractEvent({
    address: poolAddress,
    abi: SquaresPoolABI,
    eventName: 'ScoreVerified',
    onLogs(logs) {
      const log = logs[0];
      if (log && 'args' in log) {
        const args = log.args as {
          quarter: number;
          teamAScore: number;
          teamBScore: number;
          verified: boolean;
        };
        setVerificationResult({
          quarter: args.quarter as Quarter,
          patriotsScore: args.teamAScore,
          seahawksScore: args.teamBScore,
          verified: args.verified,
          sources: args.verified ? ['ESPN', 'Yahoo Sports', 'CBS Sports'] : [],
        });
        setIsFetching(false);
      }
    },
  });

  const fetchScore = useCallback(
    async (quarter: Quarter) => {
      setIsFetching(true);
      setVerificationResult(null);

      writeContract({
        address: poolAddress,
        abi: SquaresPoolABI,
        functionName: 'fetchScore',
        args: [quarter],
      });
    },
    [poolAddress, writeContract]
  );

  return {
    fetchScore,
    isPending,
    isConfirming,
    isSuccess,
    isFetching,
    verificationResult,
    error,
    hash,
  };
}
