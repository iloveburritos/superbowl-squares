'use client';

import { useEnsName } from 'wagmi';
import { mainnet } from 'wagmi/chains';

interface AddressDisplayProps {
  address: `0x${string}`;
  isMine?: boolean;
  mineLabel?: string;
  className?: string;
}

// Shared component to display ENS name or truncated address
export function AddressDisplay({
  address,
  isMine = false,
  mineLabel = 'You',
  className = ''
}: AddressDisplayProps) {
  const { data: ensName } = useEnsName({
    address,
    chainId: mainnet.id, // ENS is on mainnet
  });

  if (isMine) {
    return <span className={className}>{mineLabel}</span>;
  }

  if (ensName) {
    return <span className={className}>{ensName}</span>;
  }

  // Truncate address: 0x1234...5678
  const truncated = `${address.slice(0, 6)}...${address.slice(-4)}`;
  return <span className={className}>{truncated}</span>;
}

// Hook version for more control
export function useAddressDisplay(address: `0x${string}` | undefined) {
  const { data: ensName, isLoading } = useEnsName({
    address,
    chainId: mainnet.id,
    query: {
      enabled: !!address,
    },
  });

  const truncated = address ? `${address.slice(0, 6)}...${address.slice(-4)}` : '';
  const displayName = ensName || truncated;

  return {
    ensName,
    truncated,
    displayName,
    isLoading,
  };
}
