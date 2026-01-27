'use client';

import { useState, useEffect } from 'react';
import { useAccount, useSwitchChain } from 'wagmi';
import { parseEther, zeroAddress } from 'viem';
import { useCreatePool } from '@/hooks/useFactory';
import { useRouter } from 'next/navigation';
import type { PoolParams } from '@/lib/contracts';
import { PatriotsLogo, SeahawksLogo, SuperBowlLXLogo } from './Logos';
import { SUPPORTED_CHAINS } from '@/config/wagmi';
import { TokenSelector, TokenDisplay } from './TokenSelector';
import { Token, ETH_TOKEN, isNativeToken, parseTokenAmount, getTokensForChain } from '@/config/tokens';

// Super Bowl LX: February 8, 2026 at 6:30 PM EST
const SUPER_BOWL_DATE = new Date('2026-02-08T18:30:00-05:00');
const SUPER_BOWL_TIMESTAMP = Math.floor(SUPER_BOWL_DATE.getTime() / 1000);
// VRF numbers assigned 2 days before game
const VRF_DEADLINE_TIMESTAMP = SUPER_BOWL_TIMESTAMP - (2 * 24 * 60 * 60);

// Default VRF configs per chain (example values - would need real subscription IDs)
const VRF_CONFIGS: Record<number, { subscriptionId: bigint; keyHash: `0x${string}` }> = {
  1: {
    subscriptionId: BigInt(0),
    keyHash: '0x8af398995b04c28e9951adb9721ef74c74f93e6a478f39e7e0777be13527e7ef',
  },
  11155111: {
    subscriptionId: BigInt(0),
    keyHash: '0x474e34a077df58807dbe9c96d3c009b23b3c6d0cce433e59bbf5b34f823bc56c',
  },
};

// Fixed teams for Super Bowl LX
const TEAM_A = 'Patriots';  // Rows
const TEAM_B = 'Seahawks';  // Columns

export function CreatePoolForm() {
  const router = useRouter();
  const { address, chainId } = useAccount();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const { createPool, isPending, isConfirming, isSuccess, error, poolAddress, hash, isFactoryConfigured } = useCreatePool();

  const [selectedChainId, setSelectedChainId] = useState<number | null>(null);
  const [selectedToken, setSelectedToken] = useState<Token>(ETH_TOKEN);

  // Use selected chain or current wallet chain
  const targetChainId = selectedChainId || chainId;

  // Reset token to ETH when chain changes (in case selected token isn't available)
  useEffect(() => {
    if (targetChainId) {
      const availableTokens = getTokensForChain(targetChainId);
      const tokenStillAvailable = availableTokens.some(
        (t) => t.address.toLowerCase() === selectedToken.address.toLowerCase()
      );
      if (!tokenStillAvailable) {
        setSelectedToken(ETH_TOKEN);
      }
    }
  }, [targetChainId, selectedToken.address]);

  const [formData, setFormData] = useState({
    name: 'Super Bowl LX Pool',
    squarePrice: '0.1',
    maxSquaresPerUser: '10',
    q1Payout: '15',
    halftimePayout: '30',
    q3Payout: '15',
    finalPayout: '40',
    purchaseDeadlineDays: '7',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [activeSection, setActiveSection] = useState(0);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [canSubmit, setCanSubmit] = useState(false);

  // Prevent auto-submit when navigating to Review tab
  useEffect(() => {
    if (activeSection === 3) {
      setCanSubmit(false);
      const timer = setTimeout(() => setCanSubmit(true), 500);
      return () => clearTimeout(timer);
    }
  }, [activeSection]);

  // Show success modal when pool is created
  useEffect(() => {
    if (isSuccess) {
      setShowSuccessModal(true);
    }
  }, [isSuccess]);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Pool name is required';
    }

    const price = parseFloat(formData.squarePrice);
    if (isNaN(price) || price <= 0) {
      newErrors.squarePrice = 'Invalid price';
    }

    const payoutSum =
      parseInt(formData.q1Payout) +
      parseInt(formData.halftimePayout) +
      parseInt(formData.q3Payout) +
      parseInt(formData.finalPayout);

    if (payoutSum !== 100) {
      newErrors.payout = `Payouts must sum to 100% (currently ${payoutSum}%)`;
    }

    if (!targetChainId) {
      newErrors.chain = 'Please select a network';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Check if wallet is on the correct chain
  const isCorrectChain = chainId === targetChainId;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;
    if (!chainId || !targetChainId) return;

    // Switch chain if needed
    if (!isCorrectChain) {
      switchChain({ chainId: targetChainId });
      return;
    }

    const now = BigInt(Math.floor(Date.now() / 1000));
    const vrfConfig = VRF_CONFIGS[chainId] || { subscriptionId: BigInt(0), keyHash: zeroAddress };

    // Parse price based on token decimals
    const squarePrice = isNativeToken(selectedToken)
      ? parseEther(formData.squarePrice)
      : parseTokenAmount(formData.squarePrice, selectedToken.decimals);

    const params: PoolParams = {
      name: formData.name,
      squarePrice,
      paymentToken: selectedToken.address,
      maxSquaresPerUser: parseInt(formData.maxSquaresPerUser) || 0,
      payoutPercentages: [
        parseInt(formData.q1Payout),
        parseInt(formData.halftimePayout),
        parseInt(formData.q3Payout),
        parseInt(formData.finalPayout),
      ] as [number, number, number, number],
      teamAName: TEAM_A,
      teamBName: TEAM_B,
      purchaseDeadline: now + BigInt(parseInt(formData.purchaseDeadlineDays) * 86400),
      vrfDeadline: BigInt(VRF_DEADLINE_TIMESTAMP),
      vrfSubscriptionId: vrfConfig.subscriptionId,
      vrfKeyHash: vrfConfig.keyHash,
      umaDisputePeriod: BigInt(0), // Not using UMA - operator submits scores
      umaBondAmount: BigInt(0),
    };

    await createPool(params);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  // Prevent Enter key from submitting the form
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
    }
  };

  const payoutSum =
    parseInt(formData.q1Payout || '0') +
    parseInt(formData.halftimePayout || '0') +
    parseInt(formData.q3Payout || '0') +
    parseInt(formData.finalPayout || '0');

  const sections = [
    { title: 'Pool Info', icon: '🏈' },
    { title: 'Pricing', icon: '💰' },
    { title: 'Payouts', icon: '🏆' },
    { title: 'Review', icon: '✓' },
  ];

  return (
    <form onSubmit={handleSubmit} onKeyDown={handleKeyDown} noValidate className="space-y-6">
      {/* Progress Steps */}
      <div className="flex justify-between items-center mb-8 relative">
        <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-[var(--steel)]/30 -translate-y-1/2" />
        <div
          className="absolute top-1/2 left-0 h-0.5 bg-gradient-to-r from-[var(--turf-green)] to-[var(--electric-lime)] -translate-y-1/2 transition-all duration-500"
          style={{ width: `${(activeSection / (sections.length - 1)) * 100}%` }}
        />
        {sections.map((section, index) => (
          <button
            key={section.title}
            type="button"
            onClick={() => setActiveSection(index)}
            className={`relative z-10 flex flex-col items-center gap-2 transition-all ${
              index <= activeSection ? 'opacity-100' : 'opacity-40'
            }`}
          >
            <div
              className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl transition-all duration-300 ${
                index === activeSection
                  ? 'bg-gradient-to-br from-[var(--turf-green)] to-[var(--grass-dark)] shadow-[0_0_20px_rgba(34,197,94,0.4)] scale-110'
                  : index < activeSection
                  ? 'bg-[var(--turf-green)]/20 border border-[var(--turf-green)]/40'
                  : 'bg-[var(--steel)]/30 border border-[var(--steel)]/50'
              }`}
            >
              {section.icon}
            </div>
            <span
              className={`text-xs font-medium hidden md:block ${
                index === activeSection ? 'text-[var(--turf-green)]' : 'text-[var(--smoke)]'
              }`}
              style={{ fontFamily: 'var(--font-display)', letterSpacing: '0.05em' }}
            >
              {section.title.toUpperCase()}
            </span>
          </button>
        ))}
      </div>

      {/* Section 0: Pool Info */}
      <div className={`card p-8 transition-all duration-300 ${activeSection === 0 ? 'block' : 'hidden'}`}>
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-[var(--turf-green)]/20 border border-[var(--turf-green)]/30 flex items-center justify-center">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-[var(--turf-green)]">
              <ellipse cx="12" cy="12" rx="10" ry="6" stroke="currentColor" strokeWidth="2" transform="rotate(45 12 12)" />
              <path d="M8 12h8M12 8v8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
          <div>
            <h2 className="text-xl font-bold text-[var(--chrome)]" style={{ fontFamily: 'var(--font-display)' }}>
              POOL INFORMATION
            </h2>
            <p className="text-sm text-[var(--smoke)]">Name your pool and set purchase deadline</p>
          </div>
        </div>

        <div className="space-y-6">
          {/* Fixed Matchup Display */}
          <div className="p-6 rounded-xl bg-gradient-to-r from-[#002244]/20 via-transparent to-[#002244]/20 border border-[var(--championship-gold)]/30">
            <div className="text-center mb-4">
              <span className="text-xs font-medium text-[var(--smoke)] tracking-widest" style={{ fontFamily: 'var(--font-display)' }}>
                SUPER BOWL LX • FEBRUARY 8, 2026
              </span>
            </div>
            <div className="flex items-center justify-center gap-6">
              <div className="flex flex-col items-center gap-2">
                <PatriotsLogo size={48} />
                <span className="font-bold text-[#c60c30]" style={{ fontFamily: 'var(--font-display)' }}>
                  PATRIOTS
                </span>
                <span className="text-xs text-[var(--smoke)]">(Rows)</span>
              </div>
              <div className="flex flex-col items-center">
                <SuperBowlLXLogo size={80} />
              </div>
              <div className="flex flex-col items-center gap-2">
                <SeahawksLogo size={48} />
                <span className="font-bold text-[#69be28]" style={{ fontFamily: 'var(--font-display)' }}>
                  SEAHAWKS
                </span>
                <span className="text-xs text-[var(--smoke)]">(Columns)</span>
              </div>
            </div>
          </div>

          {/* Chain Selector */}
          <div>
            <label className="label">Deploy to Network</label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {SUPPORTED_CHAINS.map((chain) => {
                const isSelected = targetChainId === chain.id;
                const isConnectedChain = chainId === chain.id;

                return (
                  <button
                    key={chain.id}
                    type="button"
                    onClick={async () => {
                      setSelectedChainId(chain.id);
                      if (chainId !== chain.id) {
                        switchChain({ chainId: chain.id });
                      }
                    }}
                    disabled={isSwitching}
                    className={`relative p-4 rounded-xl border transition-all ${
                      isSelected
                        ? 'bg-[var(--turf-green)]/10 border-[var(--turf-green)]/50 ring-2 ring-[var(--turf-green)]/20'
                        : 'bg-[var(--steel)]/10 border-[var(--steel)]/30 hover:border-[var(--steel)]/50'
                    }`}
                  >
                    {chain.testnet && (
                      <span className="absolute top-2 right-2 text-[8px] px-1.5 py-0.5 rounded bg-[var(--championship-gold)]/20 text-[var(--championship-gold)]">
                        TESTNET
                      </span>
                    )}
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-[var(--steel)]/30 flex items-center justify-center">
                        {chain.name === 'Ethereum' || chain.name === 'Sepolia' ? (
                          <svg width="16" height="16" viewBox="0 0 256 417" fill="none">
                            <path fill="#627EEA" d="M127.961 0l-2.795 9.5v275.668l2.795 2.79 127.962-75.638z"/>
                            <path fill="#8c9eff" d="M127.962 0L0 212.32l127.962 75.639V154.158z"/>
                            <path fill="#627EEA" d="M127.961 312.187l-1.575 1.92v98.199l1.575 4.601L256 236.587z"/>
                            <path fill="#8c9eff" d="M127.962 416.905v-104.72L0 236.585z"/>
                          </svg>
                        ) : chain.name.includes('Base') ? (
                          <svg width="16" height="16" viewBox="0 0 111 111" fill="none">
                            <circle cx="55.5" cy="55.5" r="55.5" fill="#0052FF"/>
                            <path d="M55.5 95c21.815 0 39.5-17.685 39.5-39.5S77.315 16 55.5 16C34.408 16 17.174 32.507 16.03 53h52.92v5H16.03C17.174 78.493 34.408 95 55.5 95z" fill="white"/>
                          </svg>
                        ) : (
                          <svg width="16" height="16" viewBox="0 0 256 256" fill="none">
                            <circle cx="128" cy="128" r="128" fill="#213147"/>
                            <path d="M226.1 135.5l-27.4-80.7c-1.8-5.2-6.6-8.7-12.1-8.7H69.3c-5.5 0-10.3 3.5-12.1 8.7l-27.4 80.7c-1.5 4.5-.2 9.5 3.4 12.6l88.1 72.5c4.1 3.4 10.1 3.4 14.3 0l88.1-72.5c3.6-3.1 4.9-8.1 3.4-12.6z" fill="#12AAFF"/>
                          </svg>
                        )}
                      </div>
                      <span className={`text-sm font-medium ${isSelected ? 'text-[var(--turf-green)]' : 'text-[var(--chrome)]'}`}>
                        {chain.name}
                      </span>
                      {isConnectedChain && !isSelected && (
                        <span className="text-[10px] text-[var(--smoke)]">Connected</span>
                      )}
                    </div>
                    {isSelected && (
                      <div className="absolute top-2 left-2">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-[var(--turf-green)]">
                          <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
            {isSwitching && (
              <p className="text-sm text-[var(--smoke)] mt-2 flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-[var(--turf-green)] border-t-transparent rounded-full animate-spin" />
                Switching network...
              </p>
            )}
            {targetChainId && chainId !== targetChainId && !isSwitching && (
              <p className="text-sm text-[var(--championship-gold)] mt-2">
                Please approve the network switch in your wallet
              </p>
            )}
          </div>

          <div>
            <label className="label">Pool Name</label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder="My Super Bowl LX Pool"
              className="input w-full text-lg"
            />
            {errors.name && <p className="text-[var(--danger)] text-sm mt-2">{errors.name}</p>}
          </div>

          <div className="p-4 rounded-xl bg-[var(--steel)]/20 border border-[var(--steel)]/30">
            <div className="flex items-center gap-3 mb-3">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-[var(--championship-gold)]">
                <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2" />
                <path d="M16 2v4M8 2v4M3 10h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <span className="text-sm font-medium text-[var(--smoke)]" style={{ fontFamily: 'var(--font-display)', letterSpacing: '0.05em' }}>
                PURCHASE DEADLINE
              </span>
            </div>
            <div className="flex items-center gap-4">
              <input
                type="number"
                name="purchaseDeadlineDays"
                value={formData.purchaseDeadlineDays}
                onChange={handleChange}
                min="1"
                max="30"
                className="input w-24 text-xl font-bold text-center"
              />
              <span className="text-[var(--smoke)]">days from now</span>
            </div>
            <p className="text-xs text-[var(--smoke)] mt-2 opacity-70">
              Random numbers will be assigned on Feb 6, 2026 (2 days before game)
            </p>
          </div>
        </div>
      </div>

      {/* Section 1: Pricing */}
      <div className={`card p-8 transition-all duration-300 ${activeSection === 1 ? 'block' : 'hidden'}`}>
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-[var(--championship-gold)]/20 border border-[var(--championship-gold)]/30 flex items-center justify-center">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-[var(--championship-gold)]">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
              <path d="M12 6v12M9 9h6M9 15h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
          <div>
            <h2 className="text-xl font-bold text-[var(--chrome)]" style={{ fontFamily: 'var(--font-display)' }}>
              PRICING & LIMITS
            </h2>
            <p className="text-sm text-[var(--smoke)]">Choose payment token and set the price per square</p>
          </div>
        </div>

        <div className="space-y-6">
          {/* Token Selection */}
          <div>
            <label className="label">Payment Token</label>
            <TokenSelector
              chainId={targetChainId}
              selectedToken={selectedToken}
              onSelectToken={setSelectedToken}
              disabled={!targetChainId}
            />
            <p className="text-sm text-[var(--smoke)] mt-2">
              {isNativeToken(selectedToken)
                ? 'Players will pay with native ETH'
                : `Players will need to approve ${selectedToken.symbol} before buying squares`
              }
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <label className="label">Square Price ({selectedToken.symbol})</label>
              <div className="relative">
                <input
                  type="number"
                  name="squarePrice"
                  value={formData.squarePrice}
                  onChange={handleChange}
                  step={selectedToken.decimals === 6 ? '0.01' : '0.001'}
                  min="0"
                  className="input w-full text-xl font-bold pr-20"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--smoke)] font-medium">
                  {selectedToken.symbol}
                </span>
              </div>
              {errors.squarePrice && <p className="text-[var(--danger)] text-sm mt-2">{errors.squarePrice}</p>}
              <p className="text-sm text-[var(--smoke)] mt-2">
                Max pot: <span className="text-[var(--turf-green)] font-bold">
                  {(parseFloat(formData.squarePrice || '0') * 100).toFixed(selectedToken.decimals === 6 ? 2 : 4)} {selectedToken.symbol}
                </span>
              </p>
            </div>

            <div>
              <label className="label">Max Squares Per User</label>
              <input
                type="number"
                name="maxSquaresPerUser"
                value={formData.maxSquaresPerUser}
                onChange={handleChange}
                min="0"
                max="100"
                className="input w-full text-xl font-bold"
              />
              <p className="text-sm text-[var(--smoke)] mt-2">
                Set to 0 for unlimited
              </p>
            </div>
          </div>

          {/* ERC20 Notice */}
          {!isNativeToken(selectedToken) && (
            <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20">
              <div className="flex items-start gap-3">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-blue-400 mt-0.5 shrink-0">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
                  <path d="M12 16v-4M12 8h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
                <div>
                  <p className="text-blue-400 font-medium">ERC20 Token Selected</p>
                  <p className="text-sm text-[var(--smoke)] mt-1">
                    When players buy squares, they'll first need to approve the pool contract to spend their {selectedToken.symbol}.
                    This is a standard ERC20 approval flow.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Section 2: Payouts */}
      <div className={`card p-8 transition-all duration-300 ${activeSection === 2 ? 'block' : 'hidden'}`}>
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-[var(--turf-green)]/20 border border-[var(--turf-green)]/30 flex items-center justify-center">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-[var(--turf-green)]">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <h2 className="text-xl font-bold text-[var(--chrome)]" style={{ fontFamily: 'var(--font-display)' }}>
              PAYOUT STRUCTURE
            </h2>
            <p className="text-sm text-[var(--smoke)]">How winnings are distributed each quarter</p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[
            { name: 'q1Payout', label: 'Q1', color: 'var(--turf-green)' },
            { name: 'halftimePayout', label: 'HALFTIME', color: 'var(--grass-light)' },
            { name: 'q3Payout', label: 'Q3', color: 'var(--electric-lime)' },
            { name: 'finalPayout', label: 'FINAL', color: 'var(--championship-gold)' },
          ].map(({ name, label, color }) => (
            <div key={name} className="relative">
              <div
                className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full text-xs font-bold"
                style={{
                  backgroundColor: `${color}20`,
                  color: color,
                  fontFamily: 'var(--font-display)',
                  letterSpacing: '0.1em',
                }}
              >
                {label}
              </div>
              <div
                className="pt-4 p-4 rounded-xl border text-center transition-all"
                style={{
                  borderColor: `${color}30`,
                  backgroundColor: `${color}05`,
                }}
              >
                <input
                  type="number"
                  name={name}
                  value={formData[name as keyof typeof formData]}
                  onChange={handleChange}
                  min="0"
                  max="100"
                  className="w-full bg-transparent text-center text-3xl font-bold text-[var(--chrome)] focus:outline-none"
                  style={{ fontFamily: 'var(--font-display)' }}
                />
                <span className="text-lg text-[var(--smoke)]">%</span>
              </div>
            </div>
          ))}
        </div>

        {/* Payout visualization bar */}
        <div className="relative h-8 rounded-full overflow-hidden bg-[var(--steel)]/30 mb-4">
          <div
            className="absolute left-0 top-0 bottom-0 bg-[var(--turf-green)] transition-all"
            style={{ width: `${parseInt(formData.q1Payout) || 0}%` }}
          />
          <div
            className="absolute top-0 bottom-0 bg-[var(--grass-light)] transition-all"
            style={{
              left: `${parseInt(formData.q1Payout) || 0}%`,
              width: `${parseInt(formData.halftimePayout) || 0}%`,
            }}
          />
          <div
            className="absolute top-0 bottom-0 bg-[var(--electric-lime)] transition-all"
            style={{
              left: `${(parseInt(formData.q1Payout) || 0) + (parseInt(formData.halftimePayout) || 0)}%`,
              width: `${parseInt(formData.q3Payout) || 0}%`,
            }}
          />
          <div
            className="absolute top-0 bottom-0 bg-[var(--championship-gold)] transition-all"
            style={{
              left: `${(parseInt(formData.q1Payout) || 0) + (parseInt(formData.halftimePayout) || 0) + (parseInt(formData.q3Payout) || 0)}%`,
              width: `${parseInt(formData.finalPayout) || 0}%`,
            }}
          />
        </div>

        <div className={`text-center p-3 rounded-lg ${payoutSum === 100 ? 'bg-[var(--turf-green)]/10 border border-[var(--turf-green)]/30' : 'bg-[var(--danger)]/10 border border-[var(--danger)]/30'}`}>
          <span className={`font-bold ${payoutSum === 100 ? 'text-[var(--turf-green)]' : 'text-[var(--danger)]'}`}>
            Total: {payoutSum}%
          </span>
          {payoutSum !== 100 && (
            <span className="text-[var(--danger)] ml-2">
              (must equal 100%)
            </span>
          )}
        </div>
        {errors.payout && <p className="text-[var(--danger)] text-sm mt-2 text-center">{errors.payout}</p>}
      </div>

      {/* Section 3: Review */}
      <div className={`card p-8 transition-all duration-300 ${activeSection === 3 ? 'block' : 'hidden'}`}>
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-[var(--championship-gold)]/20 border border-[var(--championship-gold)]/30 flex items-center justify-center">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-[var(--championship-gold)]">
              <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
            </svg>
          </div>
          <div>
            <h2 className="text-xl font-bold text-[var(--chrome)]" style={{ fontFamily: 'var(--font-display)' }}>
              REVIEW YOUR POOL
            </h2>
            <p className="text-sm text-[var(--smoke)]">Confirm your settings before creating</p>
          </div>
        </div>

        <div className="space-y-4">
          {/* Network */}
          <div className="p-4 rounded-xl bg-[var(--turf-green)]/10 border border-[var(--turf-green)]/20">
            <div className="flex justify-between items-center">
              <span className="text-[var(--smoke)]">Deploy to Network</span>
              <span className="font-bold text-[var(--turf-green)]">
                {SUPPORTED_CHAINS.find(c => c.id === targetChainId)?.name || 'Not selected'}
                {SUPPORTED_CHAINS.find(c => c.id === targetChainId)?.testnet && (
                  <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-[var(--championship-gold)]/20 text-[var(--championship-gold)]">
                    TESTNET
                  </span>
                )}
              </span>
            </div>
          </div>

          {/* Pool Name */}
          <div className="p-4 rounded-xl bg-[var(--steel)]/10 border border-[var(--steel)]/20">
            <div className="flex justify-between items-center">
              <span className="text-[var(--smoke)]">Pool Name</span>
              <span className="font-bold text-[var(--chrome)]">{formData.name}</span>
            </div>
          </div>

          {/* Matchup */}
          <div className="p-4 rounded-xl bg-[var(--steel)]/10 border border-[var(--steel)]/20">
            <div className="flex justify-between items-center">
              <span className="text-[var(--smoke)]">Matchup</span>
              <span className="font-bold">
                <span className="text-[#c60c30]">Patriots</span>
                <span className="text-[var(--smoke)] mx-2">vs</span>
                <span className="text-[#69be28]">Seahawks</span>
              </span>
            </div>
          </div>

          {/* Payment Token */}
          <div className="p-4 rounded-xl bg-[var(--steel)]/10 border border-[var(--steel)]/20">
            <div className="flex justify-between items-center">
              <span className="text-[var(--smoke)]">Payment Token</span>
              <TokenDisplay token={selectedToken} />
            </div>
          </div>

          {/* Pricing */}
          <div className="p-4 rounded-xl bg-[var(--steel)]/10 border border-[var(--steel)]/20">
            <div className="flex justify-between items-center mb-2">
              <span className="text-[var(--smoke)]">Square Price</span>
              <span className="font-bold text-[var(--chrome)]">{formData.squarePrice} {selectedToken.symbol}</span>
            </div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-[var(--smoke)]">Max Pot</span>
              <span className="font-bold text-[var(--turf-green)]">
                {(parseFloat(formData.squarePrice || '0') * 100).toFixed(selectedToken.decimals === 6 ? 2 : 4)} {selectedToken.symbol}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[var(--smoke)]">Max Squares/User</span>
              <span className="font-bold text-[var(--chrome)]">{formData.maxSquaresPerUser === '0' ? 'Unlimited' : formData.maxSquaresPerUser}</span>
            </div>
          </div>

          {/* ERC20 Notice in Review */}
          {!isNativeToken(selectedToken) && (
            <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20">
              <div className="flex items-start gap-2">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-blue-400 mt-0.5 shrink-0">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
                  <path d="M12 16v-4M12 8h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
                <p className="text-sm text-[var(--smoke)]">
                  Players will need to approve {selectedToken.symbol} spending before buying squares
                </p>
              </div>
            </div>
          )}

          {/* Payouts */}
          <div className="p-4 rounded-xl bg-[var(--steel)]/10 border border-[var(--steel)]/20">
            <div className="text-[var(--smoke)] mb-3">Payout Structure</div>
            <div className="grid grid-cols-4 gap-2">
              <div className="text-center p-2 rounded-lg bg-[var(--turf-green)]/10">
                <div className="text-xs text-[var(--smoke)]">Q1</div>
                <div className="font-bold text-[var(--turf-green)]">{formData.q1Payout}%</div>
              </div>
              <div className="text-center p-2 rounded-lg bg-[var(--grass-light)]/10">
                <div className="text-xs text-[var(--smoke)]">Halftime</div>
                <div className="font-bold text-[var(--grass-light)]">{formData.halftimePayout}%</div>
              </div>
              <div className="text-center p-2 rounded-lg bg-[var(--electric-lime)]/10">
                <div className="text-xs text-[var(--smoke)]">Q3</div>
                <div className="font-bold text-[var(--electric-lime)]">{formData.q3Payout}%</div>
              </div>
              <div className="text-center p-2 rounded-lg bg-[var(--championship-gold)]/10">
                <div className="text-xs text-[var(--smoke)]">Final</div>
                <div className="font-bold text-[var(--championship-gold)]">{formData.finalPayout}%</div>
              </div>
            </div>
          </div>

          {/* Deadline */}
          <div className="p-4 rounded-xl bg-[var(--steel)]/10 border border-[var(--steel)]/20">
            <div className="flex justify-between items-center">
              <span className="text-[var(--smoke)]">Purchase Deadline</span>
              <span className="font-bold text-[var(--chrome)]">{formData.purchaseDeadlineDays} days from now</span>
            </div>
          </div>

          {/* Score Verification */}
          <div className="p-4 rounded-xl bg-purple-500/10 border border-purple-500/20">
            <div className="flex items-center gap-2 mb-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-purple-400">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
                <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2" />
              </svg>
              <span className="text-purple-400 font-medium">Score Verification</span>
            </div>
            <p className="text-sm text-[var(--smoke)]">
              Scores automatically verified from ESPN, Yahoo Sports, and CBS Sports via Chainlink Functions
            </p>
          </div>
        </div>

        {payoutSum !== 100 && (
          <div className="mt-4 p-4 rounded-xl bg-[var(--danger)]/10 border border-[var(--danger)]/30">
            <p className="text-[var(--danger)] text-sm">
              Payouts must equal 100% (currently {payoutSum}%). Go back to fix this.
            </p>
          </div>
        )}

        {/* Factory not configured warning */}
        {!isFactoryConfigured && targetChainId && (
          <div className="mt-4 p-4 rounded-xl bg-[var(--championship-gold)]/10 border border-[var(--championship-gold)]/30">
            <div className="flex items-start gap-3">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-[var(--championship-gold)] mt-0.5 shrink-0">
                <path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <div>
                <p className="text-[var(--championship-gold)] font-medium">Contracts Not Deployed</p>
                <p className="text-sm text-[var(--smoke)] mt-1">
                  The factory contract hasn't been deployed to {SUPPORTED_CHAINS.find(c => c.id === targetChainId)?.name} yet.
                  Please deploy the contracts first or select a different network.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Transaction Hash Display */}
      {hash && !isSuccess && (
        <div className="p-4 rounded-xl bg-[var(--turf-green)]/10 border border-[var(--turf-green)]/30">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[var(--turf-green)]/20 flex items-center justify-center">
              <div className="w-4 h-4 border-2 border-[var(--turf-green)] border-t-transparent rounded-full animate-spin" />
            </div>
            <div>
              <p className="text-[var(--turf-green)] font-medium">Transaction Submitted</p>
              <p className="text-xs text-[var(--smoke)] font-mono mt-1 break-all">{hash}</p>
            </div>
          </div>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="p-4 rounded-xl bg-[var(--danger)]/10 border border-[var(--danger)]/30">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-[var(--danger)]/20 flex items-center justify-center shrink-0">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-[var(--danger)]">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
                <path d="M12 8v4M12 16h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </div>
            <div>
              <p className="text-[var(--danger)] font-medium">Transaction Failed</p>
              <p className="text-sm text-[var(--smoke)] mt-1">{error.message}</p>
            </div>
          </div>
        </div>
      )}

      {/* Navigation & Submit */}
      <div className="flex justify-between items-center pt-4">
        <button
          type="button"
          onClick={() => setActiveSection(Math.max(0, activeSection - 1))}
          disabled={activeSection === 0}
          className="btn-secondary px-6 py-3 disabled:opacity-30"
        >
          <span className="flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M19 12H5M12 19l-7-7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Previous
          </span>
        </button>

        {activeSection < sections.length - 1 ? (
          <button
            type="button"
            onClick={() => setActiveSection(activeSection + 1)}
            className="btn-primary px-8 py-3"
          >
            <span className="flex items-center gap-2">
              Continue
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </button>
        ) : (
          <button
            type="submit"
            disabled={!address || isPending || isConfirming || isSwitching || payoutSum !== 100 || !canSubmit || !isFactoryConfigured}
            className="btn-primary px-10 py-4 text-lg"
          >
            {isPending ? (
              <span className="flex items-center gap-3">
                <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                Confirm in Wallet...
              </span>
            ) : isConfirming ? (
              <span className="flex items-center gap-3">
                <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                Creating Pool...
              </span>
            ) : isSwitching ? (
              <span className="flex items-center gap-3">
                <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                Switching Network...
              </span>
            ) : !isCorrectChain && targetChainId ? (
              <span className="flex items-center gap-2">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path d="M8 7h12M8 12h12M8 17h12M4 7h.01M4 12h.01M4 17h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
                Switch to {SUPPORTED_CHAINS.find(c => c.id === targetChainId)?.name}
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
                Create Pool
              </span>
            )}
          </button>
        )}
      </div>

      {/* Success Modal with Confetti */}
      {showSuccessModal && (
        <SuccessModal
          poolAddress={poolAddress}
          poolName={formData.name}
          hash={hash}
          onViewPool={poolAddress ? () => router.push(`/pools/${poolAddress}`) : undefined}
          onViewMyPools={() => router.push('/pools/my')}
        />
      )}
    </form>
  );
}

// Confetti particle component
function Confetti() {
  const colors = ['#22c55e', '#fbbf24', '#c60c30', '#69be28', '#8b5cf6', '#ec4899', '#06b6d4'];
  const particles = Array.from({ length: 150 }, (_, i) => ({
    id: i,
    color: colors[Math.floor(Math.random() * colors.length)],
    left: `${Math.random() * 100}%`,
    delay: `${Math.random() * 3}s`,
    duration: `${3 + Math.random() * 2}s`,
    size: `${6 + Math.random() * 8}px`,
    rotation: `${Math.random() * 360}deg`,
  }));

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-50">
      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute animate-confetti"
          style={{
            left: p.left,
            top: '-20px',
            width: p.size,
            height: p.size,
            backgroundColor: p.color,
            animationDelay: p.delay,
            animationDuration: p.duration,
            transform: `rotate(${p.rotation})`,
            borderRadius: Math.random() > 0.5 ? '50%' : '2px',
          }}
        />
      ))}
      <style jsx global>{`
        @keyframes confetti {
          0% {
            transform: translateY(0) rotate(0deg);
            opacity: 1;
          }
          100% {
            transform: translateY(100vh) rotate(720deg);
            opacity: 0;
          }
        }
        .animate-confetti {
          animation: confetti linear forwards;
        }
        @keyframes modal-in {
          0% {
            opacity: 0;
            transform: scale(0.9);
          }
          100% {
            opacity: 1;
            transform: scale(1);
          }
        }
        .animate-modal-in {
          animation: modal-in 0.3s ease-out forwards;
        }
      `}</style>
    </div>
  );
}

// Success Modal component
function SuccessModal({
  poolAddress,
  poolName,
  hash,
  onViewPool,
  onViewMyPools,
}: {
  poolAddress?: string;
  poolName: string;
  hash?: string;
  onViewPool?: () => void;
  onViewMyPools: () => void;
}) {
  return (
    <>
      <Confetti />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop */}
        <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />

        {/* Modal */}
        <div className="relative w-full max-w-lg animate-modal-in">
          <div className="card p-8 text-center border-2 border-[var(--championship-gold)]/50 shadow-[0_0_60px_rgba(251,191,36,0.3)]">
            {/* Trophy icon */}
            <div className="mx-auto w-24 h-24 mb-6 relative">
              <div className="absolute inset-0 bg-gradient-to-br from-[var(--championship-gold)] to-[var(--championship-gold)]/60 rounded-full animate-pulse" />
              <div className="absolute inset-2 bg-[var(--midnight)] rounded-full flex items-center justify-center">
                <SuperBowlLXLogo size={60} />
              </div>
            </div>

            {/* Title */}
            <h2
              className="text-3xl font-bold mb-2 bg-gradient-to-r from-[var(--championship-gold)] via-[var(--chrome)] to-[var(--championship-gold)] bg-clip-text text-transparent"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              TOUCHDOWN!
            </h2>
            <p className="text-xl text-[var(--chrome)] mb-2">Your Pool is Live</p>
            <p className="text-[var(--smoke)] mb-6">
              <span className="font-semibold text-[var(--turf-green)]">{poolName}</span> has been successfully created on the blockchain.
            </p>

            {/* Pool address or transaction hash */}
            <div className="p-4 rounded-xl bg-[var(--steel)]/20 border border-[var(--steel)]/30 mb-6">
              {poolAddress ? (
                <>
                  <p className="text-xs text-[var(--smoke)] mb-1">Contract Address</p>
                  <p className="font-mono text-sm text-[var(--chrome)] break-all">{poolAddress}</p>
                </>
              ) : hash ? (
                <>
                  <p className="text-xs text-[var(--smoke)] mb-1">Transaction Hash</p>
                  <a
                    href={`https://sepolia.etherscan.io/tx/${hash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-sm text-[var(--turf-green)] break-all hover:underline"
                  >
                    {hash}
                  </a>
                </>
              ) : (
                <p className="text-sm text-[var(--smoke)]">Pool created successfully!</p>
              )}
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4 mb-8">
              <div className="p-3 rounded-lg bg-[var(--turf-green)]/10 border border-[var(--turf-green)]/20">
                <p className="text-2xl font-bold text-[var(--turf-green)]">100</p>
                <p className="text-xs text-[var(--smoke)]">Squares</p>
              </div>
              <div className="p-3 rounded-lg bg-[var(--championship-gold)]/10 border border-[var(--championship-gold)]/20">
                <p className="text-2xl font-bold text-[var(--championship-gold)]">4</p>
                <p className="text-xs text-[var(--smoke)]">Payouts</p>
              </div>
              <div className="p-3 rounded-lg bg-purple-500/10 border border-purple-500/20">
                <p className="text-2xl font-bold text-purple-400">Live</p>
                <p className="text-xs text-[var(--smoke)]">Status</p>
              </div>
            </div>

            {/* CTA Buttons */}
            {onViewPool ? (
              <button
                onClick={onViewPool}
                className="w-full btn-primary py-4 text-lg group"
              >
                <span className="flex items-center justify-center gap-3">
                  View Your Pool
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    className="group-hover:translate-x-1 transition-transform"
                  >
                    <path
                      d="M5 12h14M12 5l7 7-7 7"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
              </button>
            ) : (
              <button
                onClick={onViewMyPools}
                className="w-full btn-primary py-4 text-lg group"
              >
                <span className="flex items-center justify-center gap-3">
                  View My Pools
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    className="group-hover:translate-x-1 transition-transform"
                  >
                    <path
                      d="M5 12h14M12 5l7 7-7 7"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
              </button>
            )}

            {/* Share text */}
            <p className="text-xs text-[var(--smoke)] mt-4">
              Share the pool link with friends to start filling squares!
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
