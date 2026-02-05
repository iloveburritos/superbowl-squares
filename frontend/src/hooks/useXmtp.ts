'use client';

import { createContext, useContext, useCallback, useRef, useSyncExternalStore } from 'react';
import { useWalletClient } from 'wagmi';
import { Client, LogLevel, type Signer } from '@xmtp/browser-sdk';
import { XMTP_ENV, toIdentifier } from '@/lib/xmtp';

// ---------------------------------------------------------------------------
// Store – holds the XMTP client singleton and notifies subscribers on change
// ---------------------------------------------------------------------------

type XmtpState = {
  client: Client | null;
  isLoading: boolean;
  error: string | null;
};

let state: XmtpState = { client: null, isLoading: false, error: null };
const listeners = new Set<() => void>();

function getSnapshot(): XmtpState {
  return state;
}

function setState(next: Partial<XmtpState>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useXmtp() {
  const { data: walletClient } = useWalletClient();
  const connectingRef = useRef(false);

  const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const connect = useCallback(async () => {
    if (!walletClient) return;
    if (snap.client || connectingRef.current) return;

    connectingRef.current = true;
    setState({ isLoading: true, error: null });

    try {
      const signer: Signer = {
        type: 'EOA' as const,
        getIdentifier: () => toIdentifier(walletClient.account.address),
        signMessage: async (message: string) => {
          const sig = await walletClient.signMessage({ message });
          // Convert hex signature to Uint8Array
          const hex = sig.startsWith('0x') ? sig.slice(2) : sig;
          const bytes = new Uint8Array(hex.length / 2);
          for (let i = 0; i < bytes.length; i++) {
            bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
          }
          return bytes;
        },
      };

      const client = await Client.create(signer, {
        env: XMTP_ENV,
        loggingLevel: LogLevel.Error, // Suppress verbose INFO/WARN logs from WASM bindings
      });
      setState({ client, isLoading: false });
    } catch (err: any) {
      setState({ isLoading: false, error: err?.message ?? 'Failed to connect XMTP' });
    } finally {
      connectingRef.current = false;
    }
  }, [walletClient, snap.client]);

  const disconnect = useCallback(() => {
    if (snap.client) {
      snap.client.close();
    }
    setState({ client: null, isLoading: false, error: null });
  }, [snap.client]);

  const canMessage = useCallback(
    async (addresses: string[]): Promise<Map<string, boolean>> => {
      const identifiers = addresses.map(toIdentifier);
      return Client.canMessage(identifiers, XMTP_ENV);
    },
    [],
  );

  return {
    client: snap.client,
    isConnected: !!snap.client,
    isLoading: snap.isLoading,
    error: snap.error,
    connect,
    disconnect,
    canMessage,
  };
}
