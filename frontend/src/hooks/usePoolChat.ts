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
  // Find or create the pool's XMTP group
  // ---------------------------------------------------
  useEffect(() => {
    // Wait for client and poolAddress
    if (!client || !poolAddress) {
      return;
    }
    // Already found a group (use ref to avoid race with state update)
    if (groupFoundRef.current) {
      setIsLoadingGroup(false);
      return;
    }

    setIsLoadingGroup(true);

    (async () => {
      try {
        // Sync conversations from network
        await client.conversations.sync();

        // Search existing groups for one matching this pool
        const allGroups = await client.conversations.listGroups();

        const existing = allGroups.find((g) => isPoolGroup(g.description, poolAddress));

        if (existing) {
          groupFoundRef.current = true;
          setGroup(existing);
          const members = await existing.members();
          setMemberCount(members.length);
          setIsLoadingGroup(false);
        } else if (isOperator) {
          // Pool creator creates the group
          const newGroup = await client.conversations.createGroupOptimistic({
            groupName: `Pool Chat`,
            groupDescription: poolGroupDescription(poolAddress),
          });
          groupFoundRef.current = true;
          setGroup(newGroup);
          setMemberCount(1);
          setIsLoadingGroup(false);
        } else {
          setIsLoadingGroup(false);
        }
      } catch (err) {
        console.error('[usePoolChat] Failed to find/create pool chat group:', err);
        setIsLoadingGroup(false);
      }
    })();
    // Intentionally not including isOperator in deps to avoid re-running mid-flight
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, poolAddress]);

  // ---------------------------------------------------
  // Retry group creation when isOperator becomes true
  // ---------------------------------------------------
  useEffect(() => {
    // Only relevant if we have a client, no group yet, and user is now operator
    if (!client || !poolAddress || group || groupFoundRef.current || !isOperator) {
      return;
    }

    setIsLoadingGroup(true);

    (async () => {
      try {
        // Double-check no group exists (someone else might have created it)
        await client.conversations.sync();
        const allGroups = await client.conversations.listGroups();
        const existing = allGroups.find((g) => isPoolGroup(g.description, poolAddress));

        if (existing) {
          groupFoundRef.current = true;
          setGroup(existing);
          const members = await existing.members();
          setMemberCount(members.length);
        } else {
          const newGroup = await client.conversations.createGroupOptimistic({
            groupName: `Pool Chat`,
            groupDescription: poolGroupDescription(poolAddress),
          });
          groupFoundRef.current = true;
          setGroup(newGroup);
          setMemberCount(1);
        }
      } catch (err) {
        console.error('[usePoolChat] Failed to create group on retry:', err);
      } finally {
        setIsLoadingGroup(false);
      }
    })();
  }, [client, poolAddress, group, isOperator]);

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
              // Deduplicate
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
  // ---------------------------------------------------
  useEffect(() => {
    if (!group || !grid || !client || !isPrivate) return;
    // Only auto-add for private pools; public pools are opt-in

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

        // Check which owners are XMTP-enabled
        const ownerAddresses = Array.from(owners);
        if (ownerAddresses.length === 0) return;

        const canMessageMap = await client.canMessage(
          ownerAddresses.map(toIdentifier),
        );

        // Find XMTP-enabled owners not yet in the group
        const toAdd: string[] = [];
        for (const addr of ownerAddresses) {
          if (!canMessageMap.get(addr.toLowerCase())) continue;

          // Check if this address's inbox is already a member
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
  }, [group, grid, client, isPrivate]);

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
  // Join group (for public pools — requires someone in the group to add you)
  // This is a request: the current user's client tries to add themselves.
  // If the group allows it (default permissions), this works.
  // ---------------------------------------------------
  const joinGroup = useCallback(async () => {
    if (!client || !address) return;

    setIsLoadingGroup(true);
    try {
      // Sync to discover if someone has added us to the group
      await client.conversations.sync();
      const groups = await client.conversations.listGroups();
      const existing = groups.find((g) => isPoolGroup(g.description, poolAddress));

      if (existing) {
        setGroup(existing);
        const members = await existing.members();
        setMemberCount(members.length);
      }
    } catch (err) {
      console.error('Failed to join pool chat:', err);
    } finally {
      setIsLoadingGroup(false);
    }
  }, [client, address, poolAddress]);

  return {
    group,
    messages,
    memberCount,
    isLoadingGroup,
    isSending,
    sendMessage,
    sendPoolUpdate,
    joinGroup,
    hasGroup: !!group,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function decodeMessage(msg: DecodedMessage<any>): ChatMessage | null {
  if (msg.content === undefined || msg.content === null) return null;
  const text = typeof msg.content === 'string' ? msg.content : String(msg.content);
  return {
    id: msg.id,
    senderInboxId: msg.senderInboxId,
    text,
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
