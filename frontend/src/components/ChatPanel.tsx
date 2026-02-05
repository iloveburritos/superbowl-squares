'use client';

import { useState, useRef, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { useXmtp } from '@/hooks/useXmtp';
import { usePoolChat } from '@/hooks/usePoolChat';
import { ChatMessage } from '@/components/ChatMessage';
import type { Client } from '@xmtp/browser-sdk';

interface ChatPanelProps {
  poolAddress: `0x${string}`;
  grid?: `0x${string}`[];
  isPrivate?: boolean;
  isOperator?: boolean;
  /** Total square owners for the "X of Y in chat" display */
  totalOwners?: number;
}

export function ChatPanel({ poolAddress, grid, isPrivate, isOperator, totalOwners }: ChatPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { isConnected: walletConnected } = useAccount();
  const { client, isConnected: xmtpConnected, isLoading: xmtpLoading, error: xmtpError, connect } = useXmtp();

  return (
    <div className="card overflow-hidden">
      {/* Header — always visible */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-4 hover:bg-[var(--steel)]/10 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-[var(--info)]/20 border border-[var(--info)]/30 flex items-center justify-center">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-[var(--info)]">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div className="text-left">
            <h2 className="text-lg font-bold text-[var(--chrome)]" style={{ fontFamily: 'var(--font-display)' }}>
              POOL CHAT
            </h2>
            {xmtpConnected && (
              <p className="text-xs text-[var(--smoke)]">Encrypted via XMTP</p>
            )}
          </div>
        </div>
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          className={`text-[var(--smoke)] transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
        >
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* Collapsible body */}
      {isOpen && (
        <div className="border-t border-[var(--steel)]/30">
          {!walletConnected ? (
            <EmptyState text="Connect your wallet to use pool chat" />
          ) : !xmtpConnected ? (
            <EnableChatPrompt isLoading={xmtpLoading} error={xmtpError} onEnable={connect} />
          ) : (
            <ActiveChat
              client={client!}
              poolAddress={poolAddress}
              grid={grid}
              isPrivate={isPrivate}
              isOperator={isOperator}
              totalOwners={totalOwners}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function EmptyState({ text }: { text: string }) {
  return (
    <div className="p-6 text-center">
      <p className="text-sm text-[var(--smoke)]">{text}</p>
    </div>
  );
}

function EnableChatPrompt({
  isLoading,
  error,
  onEnable,
}: {
  isLoading: boolean;
  error: string | null;
  onEnable: () => void;
}) {
  return (
    <div className="p-6 text-center space-y-4">
      <div className="w-12 h-12 mx-auto rounded-xl bg-[var(--info)]/20 border border-[var(--info)]/30 flex items-center justify-center">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-[var(--info)]">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <div>
        <p className="text-sm font-medium text-[var(--chrome)] mb-1">Enable Pool Chat</p>
        <p className="text-xs text-[var(--smoke)]">
          Sign a message to create your XMTP identity. One-time setup, no gas fee.
        </p>
      </div>
      {error && (
        <p className="text-xs text-[var(--danger)] p-2 rounded-lg bg-[var(--danger)]/10 border border-[var(--danger)]/30">
          {error}
        </p>
      )}
      <button
        onClick={onEnable}
        disabled={isLoading}
        className="btn-primary text-sm py-2 px-6"
      >
        {isLoading ? (
          <span className="flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            Connecting...
          </span>
        ) : (
          'Enable Chat'
        )}
      </button>
    </div>
  );
}

function ActiveChat({
  client,
  poolAddress,
  grid,
  isPrivate,
  isOperator,
  totalOwners,
}: {
  client: Client;
  poolAddress: `0x${string}`;
  grid?: `0x${string}`[];
  isPrivate?: boolean;
  isOperator?: boolean;
  totalOwners?: number;
}) {
  const { address } = useAccount();
  const {
    messages,
    memberCount,
    isLoadingGroup,
    isSending,
    sendMessage,
    joinGroup,
    hasGroup,
  } = usePoolChat({ client, poolAddress, grid, isPrivate, isOperator });

  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim()) return;
    const text = input;
    setInput('');
    await sendMessage(text);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (isLoadingGroup) {
    return (
      <div className="p-6 text-center">
        <div className="w-6 h-6 mx-auto border-2 border-[var(--info)] border-t-transparent rounded-full animate-spin mb-3" />
        <p className="text-xs text-[var(--smoke)]">Loading chat...</p>
      </div>
    );
  }

  // Check if current user owns a square (for public pool join validation)
  const userOwnsSquare = grid?.some(
    (owner) => owner?.toLowerCase() === address?.toLowerCase() &&
    owner !== '0x0000000000000000000000000000000000000000'
  );

  // No group found and not operator — show join / waiting state
  if (!hasGroup) {
    if (!isPrivate) {
      // Public pool: user must own a square to join
      if (!userOwnsSquare) {
        return (
          <div className="p-6 text-center space-y-3">
            <div className="w-12 h-12 mx-auto rounded-xl bg-[var(--warning)]/20 border border-[var(--warning)]/30 flex items-center justify-center">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-[var(--warning)]">
                <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <p className="text-sm text-[var(--smoke)]">
              You need to own a square to join the pool chat.
            </p>
            <p className="text-xs text-[var(--steel)]">
              Purchase a square to participate in the conversation.
            </p>
          </div>
        );
      }
      return (
        <div className="p-6 text-center space-y-3">
          <p className="text-sm text-[var(--smoke)]">
            Pool chat is available. Sync to check if you've been added.
          </p>
          <button onClick={joinGroup} className="btn-secondary text-sm py-2 px-6">
            Join Chat
          </button>
        </div>
      );
    }
    return (
      <EmptyState text="Chat will appear once the pool creator sets it up and you're added." />
    );
  }

  // Active chat
  const clientInboxId = client.inboxId;

  return (
    <div className="flex flex-col" style={{ height: '400px' }}>
      {/* Member count bar */}
      <div className="px-4 py-2 border-b border-[var(--steel)]/30 flex items-center justify-between">
        <span className="text-xs text-[var(--smoke)]">
          {memberCount} {memberCount === 1 ? 'member' : 'members'} in chat
          {totalOwners !== undefined && totalOwners > 0 && ` of ${totalOwners} owners`}
        </span>
        <span className="inline-flex items-center gap-1 text-[10px] text-[var(--turf-green)]">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--turf-green)]" />
          E2E Encrypted
        </span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {messages.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <p className="text-xs text-[var(--steel)]">No messages yet. Say hello!</p>
          </div>
        ) : (
          messages.map((msg) => (
            <ChatMessage
              key={msg.id}
              message={msg}
              isOwnMessage={msg.senderInboxId === clientInboxId}
              senderDisplay={truncateInboxId(msg.senderInboxId)}
            />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-[var(--steel)]/30 p-3">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            className="flex-1 px-3 py-2 rounded-lg bg-[var(--midnight)] border border-[var(--steel)]/50 text-sm text-[var(--chrome)] placeholder:text-[var(--steel)] focus:outline-none focus:border-[var(--info)]/50"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isSending}
            className="p-2 rounded-lg bg-[var(--info)]/20 border border-[var(--info)]/30 text-[var(--info)] hover:bg-[var(--info)]/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isSending ? (
              <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function truncateInboxId(inboxId: string): string {
  if (inboxId.length <= 12) return inboxId;
  return `${inboxId.slice(0, 6)}...${inboxId.slice(-4)}`;
}
