'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAccount } from 'wagmi';
import type { Client, Group, DecodedMessage } from '@xmtp/browser-sdk';
import { SortDirection } from '@xmtp/browser-sdk';
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
  /** Is the current user the pool operator/creator? */
  isOperator?: boolean;
}

export function usePoolChat({
  client,
  poolAddress,
  grid,
  isPrivate,
  isOperator,
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
  // Shared helper: find existing group or create one (if operator)
  // ---------------------------------------------------
  const findOrCreateGroup = useCallback(async () => {
    if (!client || !poolAddress) return;
    if (groupFoundRef.current) return;

    setIsLoadingGroup(true);

    try {
      await client.conversations.sync();
      const allGroups = await client.conversations.listGroups();
      const existing = allGroups.find((g) => isPoolGroup(g.description, poolAddress));

      if (existing) {
        console.log('[usePoolChat] Found existing group for pool:', poolAddress);
        groupFoundRef.current = true;
        setGroup(existing);
        const members = await existing.members();
        setMemberCount(members.length);
      } else if (isOperator) {
        console.log('[usePoolChat] No group found — creating as operator');
        const newGroup = await client.conversations.createGroupOptimistic({
          groupName: `Pool Chat`,
          groupDescription: poolGroupDescription(poolAddress),
        });
        groupFoundRef.current = true;
        setGroup(newGroup);
        setMemberCount(1);
      } else {
        console.log('[usePoolChat] No group found and not operator — waiting');
      }
    } catch (err) {
      console.error('[usePoolChat] Failed to find/create pool chat group:', err);
    } finally {
      setIsLoadingGroup(false);
    }
  }, [client, poolAddress, isOperator]);

  // ---------------------------------------------------
  // Find or create the pool's XMTP group.
  // Re-runs when client connects or isOperator changes
  // (covers the case where the contract read loads after
  // the XMTP client is ready).
  // ---------------------------------------------------
  useEffect(() => {
    if (!client || !poolAddress) return;
    if (groupFoundRef.current) {
      setIsLoadingGroup(false);
      return;
    }

    findOrCreateGroup();
  }, [client, poolAddress, isOperator, findOrCreateGroup]);

  // ---------------------------------------------------
  // Load message history when group is found
  // ---------------------------------------------------
  useEffect(() => {
    if (!group) return;

    let cancelled = false;

    (async () => {
      try {
        await group.sync();
        const history = await group.messages({
          direction: SortDirection.Ascending,
          limit: BigInt(100),
        });
        if (!cancelled) {
          setMessages(decodeMessages(history));
        }
      } catch (err) {
        console.error('Failed to load chat history:', err);
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
  // Lazy member sync: add new XMTP-enabled square owners
  // Runs for any member who has the group (operator or
  // anyone already added). This ensures that whenever any
  // group member visits the page, new square owners get added.
  // ---------------------------------------------------
  useEffect(() => {
    if (!group || !grid || !client) return;

    let cancelled = false;

    (async () => {
      try {
        const members = await group.members();
        const memberInboxIds = new Set(members.map((m) => m.inboxId));

        // Get unique non-zero addresses from grid
        const owners = new Set<string>();
        for (const addr of grid) {
          if (addr && addr !== '0x0000000000000000000000000000000000000000') {
            owners.add(addr.toLowerCase());
          }
        }

        const ownerAddresses = Array.from(owners);
        if (ownerAddresses.length === 0) return;

        const canMessageMap = await client.canMessage(
          ownerAddresses.map(toIdentifier),
        );

        // Find XMTP-enabled owners not yet in the group
        const toAdd: string[] = [];
        for (const addr of ownerAddresses) {
          if (!canMessageMap.get(addr.toLowerCase())) continue;

          const inboxId = await client.fetchInboxIdByIdentifier(toIdentifier(addr));
          if (inboxId && !memberInboxIds.has(inboxId)) {
            toAdd.push(inboxId);
          }
        }

        if (toAdd.length > 0 && !cancelled) {
          await group.addMembers(toAdd);
          const updatedMembers = await group.members();
          if (!cancelled) setMemberCount(updatedMembers.length);
        }
      } catch (err) {
        console.error('Failed to sync pool chat members:', err);
      }
    })();

    return () => {
      cancelled = true;
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
  // Sync / join: re-sync conversations from network to
  // discover if someone has added this user to the group.
  // For the operator, also creates the group if it doesn't exist.
  // ---------------------------------------------------
  const syncGroup = useCallback(async () => {
    if (!client || !address) return;

    // Reset ref so findOrCreateGroup can run again
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
  // Only render plain text messages; skip system messages (group_updated, etc.)
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
