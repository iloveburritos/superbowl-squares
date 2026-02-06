'use client';

import { createContext, useContext, useCallback, useRef, useEffect, useSyncExternalStore } from 'react';
import { useWalletClient } from 'wagmi';
import { useAccount } from 'wagmi';
import { Client, LogLevel, type Signer } from '@xmtp/browser-sdk';
import { XMTP_ENV, toIdentifier } from '@/lib/xmtp';

// ---------------------------------------------------------------------------
// LocalStorage helpers – track which addresses have enabled XMTP
// ---------------------------------------------------------------------------

const XMTP_ENABLED_PREFIX = 'xmtp:enabled:';

function markXmtpEnabled(address: string) {
  try {
    localStorage.setItem(`${XMTP_ENABLED_PREFIX}${address.toLowerCase()}`, '1');
  } catch {}
}

function isXmtpEnabled(address: string): boolean {
  try {
    return localStorage.getItem(`${XMTP_ENABLED_PREFIX}${address.toLowerCase()}`) === '1';
  } catch {
    return false;
  }
}

function clearXmtpEnabled(address: string) {
  try {
    localStorage.removeItem(`${XMTP_ENABLED_PREFIX}${address.toLowerCase()}`);
  } catch {}
}

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
  const { address } = useAccount();
  const connectingRef = useRef(false);

  const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  // Try Client.build() — reuses existing OPFS database without requiring a signature.
  // Returns the client on success, or null if no local database exists.
  const tryBuild = useCallback(async (addr: string): Promise<Client | null> => {
    try {
      const identifier = toIdentifier(addr);
      const client = await Client.build(identifier, {
        env: XMTP_ENV,
        loggingLevel: LogLevel.Error,
      });
      console.log('[XMTP] Reconnected via Client.build() — no signature needed');
      return client;
    } catch {
      console.log('[XMTP] Client.build() failed (no local DB)');
      return null;
    }
  }, []);

  // Full connect: try Client.build() first, fall back to Client.create() (needs signature)
  const connect = useCallback(async () => {
    if (!walletClient) return;
    if (snap.client || connectingRef.current) return;

    connectingRef.current = true;
    setState({ isLoading: true, error: null });

    try {
      const addr = walletClient.account.address;

      // 1. Try to reuse existing local database (no signature needed)
      let client = await tryBuild(addr);

      // 2. Fall back to Client.create() — requires wallet signature
      if (!client) {
        const signer: Signer = {
          type: 'EOA' as const,
          getIdentifier: () => toIdentifier(addr),
          signMessage: async (message: string) => {
            const sig = await walletClient.signMessage({ message });
            const hex = sig.startsWith('0x') ? sig.slice(2) : sig;
            const bytes = new Uint8Array(hex.length / 2);
            for (let i = 0; i < bytes.length; i++) {
              bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
            }
            return bytes;
          },
        };

        client = await Client.create(signer, {
          env: XMTP_ENV,
          loggingLevel: LogLevel.Error,
        });
        console.log('[XMTP] Created new installation via Client.create()');
      }

      markXmtpEnabled(addr);
      setState({ client, isLoading: false });

      // Sync conversations and messages from the network
      try {
        await client.conversations.syncAll();
      } catch (syncErr) {
        console.warn('[XMTP] Post-connect syncAll failed:', syncErr);
      }
    } catch (err: any) {
      setState({ isLoading: false, error: err?.message ?? 'Failed to connect XMTP' });
    } finally {
      connectingRef.current = false;
    }
  }, [walletClient, snap.client, tryBuild]);

  // Auto-reconnect: silently try Client.build() only (no signature popup).
  // If the local OPFS database exists, the user is reconnected instantly.
  // If it doesn't exist, clear the flag — user must click "Enable Chat" again.
  useEffect(() => {
    if (!address) return;
    if (snap.client || connectingRef.current) return;
    if (!isXmtpEnabled(address)) return;

    connectingRef.current = true;
    setState({ isLoading: true, error: null });

    (async () => {
      try {
        const client = await tryBuild(address);
        if (client) {
          markXmtpEnabled(address);
          setState({ client, isLoading: false });
          // Sync conversations and messages from the network
          try {
            await client.conversations.syncAll();
          } catch (syncErr) {
            console.warn('[XMTP] Auto-reconnect syncAll failed:', syncErr);
          }
        } else {
          // No local DB — user must explicitly enable chat again
          clearXmtpEnabled(address);
          setState({ isLoading: false, error: null });
        }
      } catch {
        setState({ isLoading: false, error: null });
      } finally {
        connectingRef.current = false;
      }
    })();
  }, [address, snap.client, tryBuild]);

  const disconnect = useCallback(() => {
    if (snap.client) {
      snap.client.close();
    }
    if (address) {
      clearXmtpEnabled(address);
    }
    setState({ client: null, isLoading: false, error: null });
  }, [snap.client, address]);

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
