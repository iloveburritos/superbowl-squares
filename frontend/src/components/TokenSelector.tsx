'use client';

import { useState, useRef, useEffect } from 'react';
import { zeroAddress, isAddress } from 'viem';
import { Token, getTokensForChain, isNativeToken } from '@/config/tokens';

interface TokenSelectorProps {
  chainId: number | undefined;
  selectedToken: Token | null;
  onSelectToken: (token: Token) => void;
  disabled?: boolean;
}

// Token icon component with fallback
function TokenIcon({ token, size = 24 }: { token: Token; size?: number }) {
  const [hasError, setHasError] = useState(false);

  // Fallback colors based on token symbol
  const getFallbackColor = (symbol: string) => {
    const colors: Record<string, string> = {
      ETH: '#627EEA',
      USDC: '#2775CA',
      USDT: '#26A17B',
    };
    return colors[symbol] || '#6B7280';
  };

  if (hasError || !token.logoUrl) {
    return (
      <div
        className="rounded-full flex items-center justify-center text-white font-bold"
        style={{
          width: size,
          height: size,
          backgroundColor: getFallbackColor(token.symbol),
          fontSize: size * 0.4,
        }}
      >
        {token.symbol.slice(0, 2)}
      </div>
    );
  }

  return (
    <img
      src={token.logoUrl}
      alt={token.symbol}
      width={size}
      height={size}
      className="rounded-full"
      onError={() => setHasError(true)}
    />
  );
}

export function TokenSelector({
  chainId,
  selectedToken,
  onSelectToken,
  disabled = false,
}: TokenSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showCustom, setShowCustom] = useState(false);
  const [customAddress, setCustomAddress] = useState('');
  const [customError, setCustomError] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  const tokens = chainId ? getTokensForChain(chainId) : [];

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setShowCustom(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Reset when chain changes
  useEffect(() => {
    setShowCustom(false);
    setCustomAddress('');
    setCustomError('');
  }, [chainId]);

  const handleSelectToken = (token: Token) => {
    onSelectToken(token);
    setIsOpen(false);
    setShowCustom(false);
  };

  const handleCustomSubmit = () => {
    if (!customAddress) {
      setCustomError('Please enter an address');
      return;
    }

    if (!isAddress(customAddress)) {
      setCustomError('Invalid address format');
      return;
    }

    // Create custom token - user will need to verify decimals
    const customToken: Token = {
      symbol: 'CUSTOM',
      name: 'Custom Token',
      decimals: 18, // Default, may need adjustment
      address: customAddress as `0x${string}`,
    };

    onSelectToken(customToken);
    setIsOpen(false);
    setShowCustom(false);
    setCustomAddress('');
    setCustomError('');
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Selected Token Button */}
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled || !chainId}
        className={`
          w-full flex items-center justify-between gap-3 p-4 rounded-xl border transition-all
          ${disabled || !chainId
            ? 'bg-[var(--steel)]/10 border-[var(--steel)]/20 opacity-50 cursor-not-allowed'
            : isOpen
            ? 'bg-[var(--turf-green)]/10 border-[var(--turf-green)]/50 ring-2 ring-[var(--turf-green)]/20'
            : 'bg-[var(--steel)]/10 border-[var(--steel)]/30 hover:border-[var(--steel)]/50'
          }
        `}
      >
        <div className="flex items-center gap-3">
          {selectedToken ? (
            <>
              <TokenIcon token={selectedToken} size={32} />
              <div className="text-left">
                <div className="font-bold text-[var(--chrome)]">{selectedToken.symbol}</div>
                <div className="text-xs text-[var(--smoke)]">{selectedToken.name}</div>
              </div>
            </>
          ) : (
            <>
              <div className="w-8 h-8 rounded-full bg-[var(--steel)]/30 flex items-center justify-center">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-[var(--smoke)]">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
                  <path d="M12 8v8M8 12h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </div>
              <div className="text-left">
                <div className="font-medium text-[var(--smoke)]">Select Token</div>
                <div className="text-xs text-[var(--smoke)]/60">
                  {chainId ? 'Choose payment currency' : 'Select network first'}
                </div>
              </div>
            </>
          )}
        </div>

        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          className={`text-[var(--smoke)] transition-transform ${isOpen ? 'rotate-180' : ''}`}
        >
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* Dropdown */}
      {isOpen && chainId && (
        <div className="absolute z-50 w-full mt-2 p-2 rounded-xl bg-[var(--midnight)] border border-[var(--steel)]/30 shadow-xl shadow-black/50">
          {!showCustom ? (
            <>
              {/* Token List */}
              <div className="max-h-64 overflow-y-auto space-y-1">
                {tokens.map((token) => {
                  const isSelected = selectedToken?.address.toLowerCase() === token.address.toLowerCase();
                  const isNative = isNativeToken(token);

                  return (
                    <button
                      key={token.address}
                      type="button"
                      onClick={() => handleSelectToken(token)}
                      className={`
                        w-full flex items-center gap-3 p-3 rounded-lg transition-all
                        ${isSelected
                          ? 'bg-[var(--turf-green)]/20 border border-[var(--turf-green)]/30'
                          : 'hover:bg-[var(--steel)]/20 border border-transparent'
                        }
                      `}
                    >
                      <TokenIcon token={token} size={32} />
                      <div className="flex-1 text-left">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-[var(--chrome)]">{token.symbol}</span>
                          {isNative && (
                            <span className="text-[8px] px-1.5 py-0.5 rounded bg-[var(--turf-green)]/20 text-[var(--turf-green)]">
                              NATIVE
                            </span>
                          )}
                          {isSelected && (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-[var(--turf-green)]">
                              <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          )}
                        </div>
                        <div className="text-xs text-[var(--smoke)]">{token.name}</div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Divider */}
              <div className="my-2 border-t border-[var(--steel)]/20" />

              {/* Custom Token Button */}
              <button
                type="button"
                onClick={() => setShowCustom(true)}
                className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-[var(--steel)]/20 transition-all"
              >
                <div className="w-8 h-8 rounded-full bg-[var(--steel)]/30 flex items-center justify-center">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-[var(--smoke)]">
                    <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </div>
                <div className="text-left">
                  <div className="font-medium text-[var(--smoke)]">Custom Token</div>
                  <div className="text-xs text-[var(--smoke)]/60">Enter contract address</div>
                </div>
              </button>
            </>
          ) : (
            <>
              {/* Custom Token Input */}
              <div className="p-3 space-y-3">
                <div className="flex items-center gap-2 mb-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowCustom(false);
                      setCustomError('');
                    }}
                    className="p-1 rounded hover:bg-[var(--steel)]/20"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-[var(--smoke)]">
                      <path d="M19 12H5M12 19l-7-7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                  <span className="text-sm font-medium text-[var(--chrome)]">Custom Token Address</span>
                </div>

                <input
                  type="text"
                  value={customAddress}
                  onChange={(e) => {
                    setCustomAddress(e.target.value);
                    setCustomError('');
                  }}
                  placeholder="0x..."
                  className="input w-full text-sm font-mono"
                />

                {customError && (
                  <p className="text-xs text-[var(--danger)]">{customError}</p>
                )}

                <div className="p-3 rounded-lg bg-[var(--championship-gold)]/10 border border-[var(--championship-gold)]/20">
                  <div className="flex items-start gap-2">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-[var(--championship-gold)] mt-0.5 shrink-0">
                      <path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <div className="text-xs text-[var(--smoke)]">
                      <strong className="text-[var(--championship-gold)]">Verify carefully!</strong>
                      <br />
                      Ensure this is a valid ERC20 token contract. Assumes 18 decimals.
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleCustomSubmit}
                  className="w-full btn-primary py-2 text-sm"
                >
                  Use This Token
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// Compact version for display in review sections
export function TokenDisplay({ token }: { token: Token }) {
  return (
    <div className="flex items-center gap-2">
      <TokenIcon token={token} size={20} />
      <span className="font-bold text-[var(--chrome)]">{token.symbol}</span>
    </div>
  );
}
