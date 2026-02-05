import type { Identifier } from '@xmtp/browser-sdk';
import { IdentifierKind } from '@xmtp/browser-sdk';

// XMTP environment - use 'dev' for localhost (CORS), 'production' for deployed apps
export const XMTP_ENV = (
  typeof window !== 'undefined' && window.location.hostname === 'localhost'
    ? 'dev'
    : 'production'
) as 'dev' | 'production';

// Prefix used to identify pool notification messages vs regular chat
export const POOL_UPDATE_PREFIX = '[POOL UPDATE] ';

// Group metadata key: pool contract address stored in group description
export function poolGroupDescription(poolAddress: string): string {
  return `superbowl-squares:${poolAddress.toLowerCase()}`;
}

// Check if a group description matches a pool address
export function isPoolGroup(description: string | undefined, poolAddress: string): boolean {
  if (!description) return false;
  return description === poolGroupDescription(poolAddress);
}

// Create an Identifier from an Ethereum address
export function toIdentifier(address: string): Identifier {
  return {
    identifier: address.toLowerCase(),
    identifierKind: IdentifierKind.Ethereum,
  };
}

// Check if a message is a pool update notification
export function isPoolUpdate(text: string): boolean {
  return text.startsWith(POOL_UPDATE_PREFIX);
}

// Extract the notification content from a pool update message
export function getPoolUpdateContent(text: string): string {
  return text.slice(POOL_UPDATE_PREFIX.length);
}

// Format a pool update message for sending
export function formatPoolUpdate(content: string): string {
  return `${POOL_UPDATE_PREFIX}${content}`;
}
