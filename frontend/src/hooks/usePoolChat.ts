'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAccount } from 'wagmi';
import { Client, SortDirection } from '@xmtp/browser-sdk';
import type { Group, DecodedMessage } from '@xmtp/browser-sdk';
import {
  poolGroupDescription,
  isPoolGroup,
  toIdentifier,
  formatPoolUpdate,
} from '@/lib/xmtp';

export interface ChatMessage {
  id: string;
  senderInboxId: string;
  text: string;
  sentAt: Date;
}

interface UsePoolChatOptions {
  client: Client | null;
  poolAddress: string;
  /** On-chain grid of square owners (100 addresses) */
  grid?: `0x${string}`[];
  /** Is this a private pool? */
  isPrivate?: boolean;
}

// ---------------------------------------------------------------------------
// Helper: resolve XMTP-enabled square owners to inbox IDs
// ---------------------------------------------------------------------------

async function resolveXmtpOwners(
  client: Client,
  grid: `0x${string}`[],
  excludeAddress?: string,
): Promise<string[]> {
  const owners = new Set<string>();
  for (const addr of grid) {
    if (
      addr &&
      addr !== '0x0000000000000000000000000000000000000000' &&
      addr.toLowerCase() !== excludeAddress?.toLowerCase()
    ) {
      owners.add(addr.toLowerCase());
    }
  }

  const ownerAddresses = Array.from(owners);
  if (ownerAddresses.length === 0) return [];

  const canMessageMap = await Client.canMessage(
    ownerAddresses.map(toIdentifier),
  );

  const inboxIds: string[] = [];
  for (const addr of ownerAddresses) {
    if (!canMessageMap.get(addr)) continue;
    const inboxId = await client.fetchInboxIdByIdentifier(toIdentifier(addr));
    if (inboxId) inboxIds.push(inboxId);
  }

  return inboxIds;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function usePoolChat({
  client,
  poolAddress,
  grid,
  isPrivate,
}: UsePoolChatOptions) {
  const { address } = useAccount();
  const [group, setGroup] = useState<Group<any> | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoadingGroup, setIsLoadingGroup] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [memberCount, setMemberCount] = useState(0);
  const streamRef = useRef<any>(null);
  const groupFoundRef = useRef(false);

  // ---------------------------------------------------
  // Find the canonical pool group from all matching groups.
  // If multiple exist (race condition), pick the one with
  // the smallest ID so all users converge on the same group.
  // ---------------------------------------------------
  const findCanonicalGroup = useCallback(
    async (): Promise<Group<any> | null> => {
      if (!client) return null;
      const allGroups = await client.conversations.listGroups();
      const matching = allGroups
        .filter((g) => isPoolGroup(g.description, poolAddress))
        .sort((a, b) => a.id.localeCompare(b.id));
      return matching.length > 0 ? matching[0] : null;
    },
    [client, poolAddress],
  );

  // ---------------------------------------------------
  // Main logic: find existing group or create one.
  // Uses non-optimistic createGroup() which syncs to the
  // network immediately, preventing the "local only" issue.
  // ---------------------------------------------------
  const findOrCreateGroup = useCallback(async () => {
    if (!client || !poolAddress) return;
    if (groupFoundRef.current) return;

    const userOwnsSquare =
      grid?.some(
        (owner) =>
          owner?.toLowerCase() === address?.toLowerCase() &&
          owner !== '0x0000000000000000000000000000000000000000',
      ) ?? false;

    setIsLoadingGroup(true);

    try {
      // Sync all conversations and messages from the network
      await client.conversations.syncAll();

      // Check for existing group(s)
      const existing = await findCanonicalGroup();

      if (existing) {
        console.log(`[usePoolChat] Found group ${existing.id} for pool`);
        groupFoundRef.current = true;
        setGroup(existing);
        const members = await existing.members();
        setMemberCount(members.length);
        return;
      }

      if (!userOwnsSquare) {
        console.log('[usePoolChat] No group found, user does not own a square');
        return;
      }

      // No group exists — create one. Use non-optimistic createGroup()
      // which syncs to the network immediately.
      console.log('[usePoolChat] Creating group for pool');

      // Resolve other XMTP-enabled square owners
      let otherInboxIds: string[] = [];
      if (grid) {
        try {
          otherInboxIds = await resolveXmtpOwners(client, grid, address);
          console.log(`[usePoolChat] Found ${otherInboxIds.length} other XMTP-enabled owners`);
        } catch (err) {
          console.warn('[usePoolChat] Failed to resolve XMTP owners:', err);
        }
      }

      // createGroup() publishes to the network immediately (not optimistic)
      const newGroup = await client.conversations.createGroup(otherInboxIds, {
        groupName: 'Pool Chat',
        groupDescription: poolGroupDescription(poolAddress),
      });

      console.log(`[usePoolChat] Created group ${newGroup.id}`);

      // Post-creation dedup: sync and check if someone else created a
      // group at the same time. If so, prefer the canonical one.
      try {
        await client.conversations.syncAll();
        const canonical = await findCanonicalGroup();
        if (canonical && canonical.id !== newGroup.id) {
          console.log(`[usePoolChat] Switching to canonical group ${canonical.id}`);
          groupFoundRef.current = true;
          setGroup(canonical);
          const members = await canonical.members();
          setMemberCount(members.length);
          return;
        }
      } catch (err) {
        console.warn('[usePoolChat] Post-creation dedup failed:', err);
      }

      groupFoundRef.current = true;
      setGroup(newGroup);
      setMemberCount(1 + otherInboxIds.length);
    } catch (err) {
      console.error('[usePoolChat] Failed to find/create group:', err);
    } finally {
      setIsLoadingGroup(false);
    }
  }, [client, poolAddress, grid, address, findCanonicalGroup]);

  // ---------------------------------------------------
  // Trigger find/create when client connects or grid loads
  // ---------------------------------------------------
  useEffect(() => {
    if (!client || !poolAddress) return;
    if (groupFoundRef.current) {
      setIsLoadingGroup(false);
      return;
    }
    findOrCreateGroup();
  }, [client, poolAddress, findOrCreateGroup]);

  // ---------------------------------------------------
  // Auto-poll: re-check every 10s if no group found yet
  // (e.g. user enabled XMTP before anyone created a group)
  // ---------------------------------------------------
  useEffect(() => {
    if (!client || !poolAddress) return;
    if (groupFoundRef.current) return;

    const interval = setInterval(() => {
      if (groupFoundRef.current) {
        clearInterval(interval);
        return;
      }
      console.log('[usePoolChat] Polling for group...');
      findOrCreateGroup();
    }, 10_000);

    return () => clearInterval(interval);
  }, [client, poolAddress, findOrCreateGroup]);

  // ---------------------------------------------------
  // Load message history when group is found.
  // group.sync() fetches messages sent while offline.
  // Retries once after 3s to catch history sync arrivals.
  // ---------------------------------------------------
  useEffect(() => {
    if (!group) return;

    let cancelled = false;

    const loadMessages = async () => {
      try {
        await group.sync();
        const history = await group.messages({
          direction: SortDirection.Ascending,
          limit: BigInt(100),
        });
        if (!cancelled) {
          setMessages(decodeMessages(history));
        }
        return history.length;
      } catch (err) {
        console.error('Failed to load chat history:', err);
        return 0;
      }
    };

    (async () => {
      const count = await loadMessages();
      // If no messages, retry after a delay — history sync from
      // other installations may still be in progress
      if (count === 0 && !cancelled) {
        await new Promise((r) => setTimeout(r, 3000));
        if (!cancelled) await loadMessages();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [group]);

  // ---------------------------------------------------
  // Stream new messages in real-time
  // ---------------------------------------------------
  useEffect(() => {
    if (!group) return;

    let cancelled = false;

    (async () => {
      try {
        const stream = await group.stream();
        streamRef.current = stream;

        for await (const msg of stream) {
          if (cancelled) break;
          const decoded = decodeMessage(msg);
          if (decoded) {
            setMessages((prev) => {
              if (prev.some((m) => m.id === decoded.id)) return prev;
              return [...prev, decoded];
            });
          }
        }
      } catch (err) {
        if (!cancelled) console.error('Message stream error:', err);
      }
    })();

    return () => {
      cancelled = true;
      if (streamRef.current) {
        streamRef.current.return();
        streamRef.current = null;
      }
    };
  }, [group]);

  // ---------------------------------------------------
  // Periodic convergence: even after finding a group,
  // re-sync and check if there's a canonical group with
  // a smaller ID (e.g. another user created one and added us).
  // This ensures all users converge on the same group.
  // ---------------------------------------------------
  useEffect(() => {
    if (!group || !client) return;

    let cancelled = false;

    const converge = async () => {
      try {
        await client.conversations.syncAll();
        const canonical = await findCanonicalGroup();
        if (canonical && canonical.id !== group.id) {
          console.log(`[usePoolChat] Converging to canonical group ${canonical.id} (was ${group.id})`);
          setGroup(canonical);
          // Load messages from canonical group
          await canonical.sync();
          const history = await canonical.messages({
            direction: SortDirection.Ascending,
            limit: BigInt(100),
          });
          if (!cancelled) {
            setMessages(decodeMessages(history));
            const members = await canonical.members();
            setMemberCount(members.length);
          }
        } else if (canonical) {
          // Same group — just sync new messages
          await group.sync();
          const history = await group.messages({
            direction: SortDirection.Ascending,
            limit: BigInt(100),
          });
          if (!cancelled) {
            setMessages(decodeMessages(history));
          }
        }
      } catch (err) {
        console.error('[usePoolChat] Convergence check failed:', err);
      }
    };

    const interval = setInterval(converge, 15_000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [group, client, findCanonicalGroup]);

  // ---------------------------------------------------
  // Lazy member sync: periodically add new XMTP-enabled
  // square owners who aren't yet in the group.
  // ---------------------------------------------------
  useEffect(() => {
    if (!group || !grid || !client) return;

    let cancelled = false;

    const syncMembers = async () => {
      try {
        const members = await group.members();
        const memberInboxIds = new Set(members.map((m) => m.inboxId));

        const allInboxIds = await resolveXmtpOwners(client, grid);
        const toAdd = allInboxIds.filter((id) => !memberInboxIds.has(id));

        if (toAdd.length > 0 && !cancelled) {
          console.log(`[usePoolChat] Adding ${toAdd.length} new members`);
          await group.addMembers(toAdd);
          const updated = await group.members();
          if (!cancelled) setMemberCount(updated.length);
        }
      } catch (err) {
        console.error('Failed to sync pool chat members:', err);
      }
    };

    // Run immediately and then every 30s
    syncMembers();
    const interval = setInterval(syncMembers, 30_000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [group, grid, client]);

  // ---------------------------------------------------
  // Send a text message
  // ---------------------------------------------------
  const sendMessage = useCallback(
    async (text: string) => {
      if (!group || !text.trim()) return;
      setIsSending(true);
      try {
        await group.sendText(text.trim());
      } catch (err) {
        console.error('Failed to send message:', err);
      } finally {
        setIsSending(false);
      }
    },
    [group],
  );

  // ---------------------------------------------------
  // Send a pool update notification
  // ---------------------------------------------------
  const sendPoolUpdate = useCallback(
    async (content: string) => {
      if (!group) return;
      try {
        await group.sendText(formatPoolUpdate(content));
      } catch (err) {
        console.error('Failed to send pool update:', err);
      }
    },
    [group],
  );

  // ---------------------------------------------------
  // Manual sync trigger
  // ---------------------------------------------------
  const syncGroup = useCallback(async () => {
    if (!client || !address) return;
    groupFoundRef.current = false;
    await findOrCreateGroup();
  }, [client, address, findOrCreateGroup]);

  return {
    group,
    messages,
    memberCount,
    isLoadingGroup,
    isSending,
    sendMessage,
    sendPoolUpdate,
    syncGroup,
    hasGroup: !!group,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function decodeMessage(msg: DecodedMessage<any>): ChatMessage | null {
  if (typeof msg.content !== 'string' || !msg.content) return null;
  return {
    id: msg.id,
    senderInboxId: msg.senderInboxId,
    text: msg.content,
    sentAt: msg.sentAt,
  };
}

function decodeMessages(msgs: DecodedMessage<any>[]): ChatMessage[] {
  const result: ChatMessage[] = [];
  for (const msg of msgs) {
    const decoded = decodeMessage(msg);
    if (decoded) result.push(decoded);
  }
  return result;
}
