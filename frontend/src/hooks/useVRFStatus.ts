'use client';

import { useReadContract } from 'wagmi';
import { SquaresPoolABI } from '@/lib/abis';

export interface VRFStatus {
  vrfTriggerTime: bigint;
  vrfRequested: boolean;
  vrfRequestId: bigint;
  numbersAssigned: boolean;
}

export function useVRFStatus(poolAddress: `0x${string}` | undefined) {
  const { data, isLoading, error, refetch } = useReadContract({
    address: poolAddress,
    abi: SquaresPoolABI,
    functionName: 'getVRFStatus',
    query: {
      enabled: !!poolAddress,
      refetchInterval: 10000, // Refresh every 10 seconds
    },
  });

  const vrfStatus: VRFStatus | undefined = data
    ? {
        vrfTriggerTime: data[0],
        vrfRequested: data[1],
        vrfRequestId: data[2],
        numbersAssigned: data[3],
      }
    : undefined;

  // Calculate time until VRF trigger
  const now = BigInt(Math.floor(Date.now() / 1000));
  const timeUntilTrigger = vrfStatus
    ? Number(vrfStatus.vrfTriggerTime - now)
    : undefined;

  // Determine automation status
  type AutomationStatus = 'waiting' | 'pending' | 'complete';
  let automationStatus: AutomationStatus = 'waiting';
  if (vrfStatus?.numbersAssigned) {
    automationStatus = 'complete';
  } else if (vrfStatus?.vrfRequested) {
    automationStatus = 'pending';
  }

  return {
    vrfStatus,
    timeUntilTrigger,
    automationStatus,
    isLoading,
    error,
    refetch,
  };
}

// Helper to format time remaining
export function formatTimeRemaining(seconds: number): string {
  if (seconds <= 0) return 'Ready';

  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (secs > 0 && days === 0) parts.push(`${secs}s`);

  return parts.join(' ') || '0s';
}
