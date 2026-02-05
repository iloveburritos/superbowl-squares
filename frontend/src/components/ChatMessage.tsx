'use client';

import { isPoolUpdate, getPoolUpdateContent } from '@/lib/xmtp';
import type { ChatMessage as ChatMessageType } from '@/hooks/usePoolChat';

interface ChatMessageProps {
  message: ChatMessageType;
  isOwnMessage: boolean;
  senderDisplay: string;
}

export function ChatMessage({ message, isOwnMessage, senderDisplay }: ChatMessageProps) {
  if (isPoolUpdate(message.text)) {
    return <PoolUpdateMessage text={getPoolUpdateContent(message.text)} sentAt={message.sentAt} />;
  }

  return (
    <div className={`flex flex-col ${isOwnMessage ? 'items-end' : 'items-start'} mb-3`}>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[10px] font-medium text-[var(--smoke)]">
          {isOwnMessage ? 'You' : senderDisplay}
        </span>
        <span className="text-[10px] text-[var(--steel)]">
          {formatTime(message.sentAt)}
        </span>
      </div>
      <div
        className={`max-w-[85%] px-3 py-2 rounded-xl text-sm break-words ${
          isOwnMessage
            ? 'bg-[var(--turf-green)]/20 border border-[var(--turf-green)]/30 text-[var(--chrome)]'
            : 'bg-[var(--steel)]/30 border border-[var(--steel)]/40 text-[var(--chrome)]'
        }`}
      >
        {message.text}
      </div>
    </div>
  );
}

function PoolUpdateMessage({ text, sentAt }: { text: string; sentAt: Date }) {
  return (
    <div className="flex justify-center my-3">
      <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-[var(--championship-gold)]/10 border border-[var(--championship-gold)]/30">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-[var(--championship-gold)] shrink-0">
          <path
            d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span className="text-xs font-medium text-[var(--championship-gold)]">{text}</span>
        <span className="text-[10px] text-[var(--smoke)]">{formatTime(sentAt)}</span>
      </div>
    </div>
  );
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
