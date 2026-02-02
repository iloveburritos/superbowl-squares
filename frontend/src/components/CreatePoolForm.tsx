'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAccount, useSwitchChain, useReadContract, useChainId } from 'wagmi';
import { parseEther, keccak256, toBytes } from 'viem';
import { useCreatePool, usePoolCreationCost } from '@/hooks/useFactory';
import { SquaresFactoryABI } from '@/lib/abis';
import { FACTORY_ADDRESSES } from '@/config/wagmi';
import { usePoolCreationPaused } from '@/hooks/useAdminPoolPause';
import { useRouter } from 'next/navigation';
import type { PoolParams } from '@/lib/contracts';
import { PatriotsLogo, SeahawksLogo, SuperBowlLXLogo } from './Logos';
import { SUPPORTED_CHAINS } from '@/config/wagmi';
import { TokenSelector, TokenDisplay } from './TokenSelector';
import { Token, ETH_TOKEN, isNativeToken, parseTokenAmount, getTokensForChain } from '@/config/tokens';

// Super Bowl LX: February 8, 2026 at 6:30 PM EST
const SUPER_BOWL_DATE = new Date('2026-02-08T18:30:00-05:00');
const SUPER_BOWL_TIMESTAMP = Math.floor(SUPER_BOWL_DATE.getTime() / 1000);
// Purchase deadline & VRF trigger time 1 day before game
const PURCHASE_DEADLINE_TIMESTAMP = SUPER_BOWL_TIMESTAMP - (1 * 24 * 60 * 60);
const VRF_TRIGGER_TIMESTAMP = PURCHASE_DEADLINE_TIMESTAMP;

// Fixed teams for Super Bowl LX
const TEAM_A = 'Patriots';  // Rows
const TEAM_B = 'Seahawks';  // Columns

// Block explorer URLs by chain ID
const EXPLORER_URLS: Record<number, string> = {
  1: 'https://etherscan.io',
  11155111: 'https://sepolia.etherscan.io',
  8453: 'https://basescan.org',
  84532: 'https://sepolia.basescan.org',
  42161: 'https://arbiscan.io',
  421614: 'https://sepolia.arbiscan.io',
};

function getExplorerTxUrl(chainId: number | undefined, hash: string): string {
  const baseUrl = EXPLORER_URLS[chainId || 11155111] || EXPLORER_URLS[11155111];
  return `${baseUrl}/tx/${hash}`;
}

export function CreatePoolForm() {
  const router = useRouter();
  const { address, chainId } = useAccount();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const { createPool, isPending, isConfirming, isSuccess, isReceiptError, error, poolAddress, hash, refetchReceipt, isFactoryConfigured } = useCreatePool();
  const { totalCost, vrfFundingAmount, isLoading: isLoadingCost } = usePoolCreationCost();
  const { isPaused: poolCreationPaused, isLoading: isPauseLoading } = usePoolCreationPaused();

  // Check if pool creation deadline has passed
  const [isDeadlinePassed, setIsDeadlinePassed] = useState(false);
  useEffect(() => {
    const checkDeadline = () => {
      const now = Math.floor(Date.now() / 1000);
      setIsDeadlinePassed(now >= PURCHASE_DEADLINE_TIMESTAMP);
    };
    checkDeadline();
    // Check every minute
    const interval = setInterval(checkDeadline, 60000);
    return () => clearInterval(interval);
  }, []);

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
    isPrivate: false,
    password: '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [activeSection, setActiveSection] = useState(0);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [canSubmit, setCanSubmit] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Debounced name for checking uniqueness
  const [debouncedName, setDebouncedName] = useState(formData.name);
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedName(formData.name);
    }, 500);
    return () => clearTimeout(timer);
  }, [formData.name]);

  // Check if pool name is already taken
  const factoryAddress = targetChainId ? FACTORY_ADDRESSES[targetChainId] : undefined;
  const { data: nameCheckResult, isLoading: isCheckingName } = useReadContract({
    address: factoryAddress,
    abi: SquaresFactoryABI,
    functionName: 'isPoolNameTaken',
    args: [debouncedName],
    chainId: targetChainId,
    query: {
      enabled: !!factoryAddress && !!targetChainId && debouncedName.trim().length > 0,
    },
  });
  const isNameTaken = nameCheckResult === true;
  const isNameAvailable = nameCheckResult === false; // Explicit false, not undefined

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
    } else if (isNameTaken) {
      newErrors.name = 'This pool name is already taken';
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

    if (formData.isPrivate && !formData.password) {
      newErrors.password = 'Password is required for private pools';
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

    // Parse price based on token decimals
    const squarePrice = isNativeToken(selectedToken)
      ? parseEther(formData.squarePrice)
      : parseTokenAmount(formData.squarePrice, selectedToken.decimals);

    // Hash password for private pools, use zero bytes32 for public
    const passwordHash: `0x${string}` = formData.isPrivate && formData.password
      ? keccak256(toBytes(formData.password))
      : '0x0000000000000000000000000000000000000000000000000000000000000000';

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
      purchaseDeadline: BigInt(PURCHASE_DEADLINE_TIMESTAMP),
      vrfTriggerTime: BigInt(VRF_TRIGGER_TIMESTAMP),
      passwordHash,
    };

    await createPool(params, totalCost);
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
      {/* Pool Creation Deadline Passed Banner */}
      {isDeadlinePassed && (
        <div className="p-4 rounded-xl bg-[var(--championship-gold)]/10 border border-[var(--championship-gold)]/30">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-[var(--championship-gold)]/20 flex items-center justify-center shrink-0">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-[var(--championship-gold)]">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
                <path d="M12 6v6l4 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </div>
            <div>
              <p className="font-bold text-[var(--championship-gold)]">Pool Creation Has Ended</p>
              <p className="text-sm text-[var(--smoke)] mt-1">
                The deadline for creating new Super Bowl LX pools was February 7, 2026 at 6:30 PM EST.
                No new pools can be created for this game.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Pool Creation Paused Banner */}
      {poolCreationPaused && !isDeadlinePassed && (
        <div className="p-4 rounded-xl bg-[var(--championship-gold)]/10 border border-[var(--championship-gold)]/30">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-[var(--championship-gold)]/20 flex items-center justify-center shrink-0">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-[var(--championship-gold)]">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
                <path d="M12 6v6l4 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </div>
            <div>
              <p className="font-bold text-[var(--championship-gold)]">Pool Creation Closed</p>
              <p className="text-sm text-[var(--smoke)] mt-1">
                It's less than 24 hours until kickoff! Random numbers have been assigned and all pools are locked in. Good luck!
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Progress Steps */}
      <div className="flex justify-between items-center mb-8 relative">
        {/* Background line - connects icon centers */}
        <div className="absolute top-6 left-[24px] right-[24px] h-0.5 bg-[var(--steel)]/30" />
        {/* Progress line - width based on current step */}
        <div
          className="absolute top-6 left-[24px] h-0.5 bg-gradient-to-r from-[var(--turf-green)] to-[var(--electric-lime)] transition-all duration-500"
          style={{
            width: activeSection === 0 ? '0' :
                   activeSection === 1 ? 'calc(33.33% - 16px)' :
                   activeSection === 2 ? 'calc(66.66% - 32px)' :
                   'calc(100% - 48px)'
          }}
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
                  ? 'bg-[var(--midnight)] border border-[var(--turf-green)]/40'
                  : 'bg-[var(--midnight)] border border-[var(--steel)]/50'
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
            <div className="grid grid-cols-2 gap-3">
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
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-[var(--steel)]/30 flex items-center justify-center">
                        {chain.name === 'Base' ? (
                          <svg width="16" height="16" viewBox="0 0 111 111" fill="none">
                            <circle cx="55.5" cy="55.5" r="55.5" fill="#0052FF"/>
                            <path d="M55.5 95c21.815 0 39.5-17.685 39.5-39.5S77.315 16 55.5 16C34.408 16 17.174 32.507 16.03 53h52.92v5H16.03C17.174 78.493 34.408 95 55.5 95z" fill="white"/>
                          </svg>
                        ) : chain.name === 'Arbitrum' ? (
                          <svg width="16" height="16" viewBox="0 0 48 48" fill="none">
                            <path d="M24 4L44 14V34L24 44L4 34V14L24 4Z" stroke="#2D6AE0" strokeWidth="3" fill="none"/>
                            <path d="M18 32L24 14L30 32M20 27H28" stroke="#2D6AE0" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        ) : (
                          <svg width="16" height="16" viewBox="0 0 32 32" fill="none">
                            <circle cx="16" cy="16" r="16" fill="#627EEA"/>
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
            <details className="mt-3 group">
              <summary className="text-xs text-[var(--smoke)] cursor-pointer hover:text-[var(--chrome)] transition-colors flex items-center gap-1">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" className="text-[var(--smoke)]">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
                  <path d="M12 16v-4M12 8h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
                Why no Ethereum mainnet?
              </summary>
              <p className="mt-2 text-xs text-[var(--smoke)] pl-4 border-l-2 border-[var(--steel)]/30">
                The Super Bowl is almost here and Chainlink VRF on mainnet wasn't being reliable for random number generation.
                <span className="text-[var(--championship-gold)]"> Blame Chainlink!</span> <span className="opacity-60">(jk, we love you Chainlink)</span>
              </p>
            </details>
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
            <div className="relative">
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                placeholder="My Super Bowl LX Pool"
                className={`input w-full text-lg pr-12 ${
                  isNameTaken ? 'border-[var(--danger)]/50 focus:border-[var(--danger)]' :
                  isNameAvailable ? 'border-[var(--turf-green)]/50 focus:border-[var(--turf-green)]' : ''
                }`}
              />
              {formData.name.trim() && (
                <div className="absolute right-4 top-1/2 -translate-y-1/2">
                  {isCheckingName || formData.name !== debouncedName ? (
                    <div className="w-5 h-5 border-2 border-[var(--smoke)] border-t-transparent rounded-full animate-spin" />
                  ) : isNameTaken ? (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-[var(--danger)]">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
                      <path d="M15 9l-6 6M9 9l6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  ) : isNameAvailable ? (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-[var(--turf-green)]">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
                      <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : null}
                </div>
              )}
            </div>
            {isNameTaken && (
              <p className="text-[var(--danger)] text-sm mt-2 flex items-center gap-2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
                  <path d="M12 8v4M12 16h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
                This pool name is already taken. Please choose a different name.
              </p>
            )}
            {errors.name && !isNameTaken && <p className="text-[var(--danger)] text-sm mt-2">{errors.name}</p>}
          </div>

          {/* Private Pool Toggle */}
          <div className="p-4 rounded-xl bg-[var(--steel)]/10 border border-[var(--steel)]/30">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-[var(--championship-gold)]">
                  <rect x="3" y="11" width="18" height="11" rx="2" stroke="currentColor" strokeWidth="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
                <div>
                  <p className="font-medium text-[var(--chrome)]">Private Pool</p>
                  <p className="text-xs text-[var(--smoke)]">Require a password to join</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setFormData(prev => ({ ...prev, isPrivate: !prev.isPrivate, password: prev.isPrivate ? '' : prev.password }))}
                className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 border ${
                  formData.isPrivate
                    ? 'bg-[var(--turf-green)] border-[var(--turf-green)]'
                    : 'bg-[var(--steel)]/30 border-[var(--steel)]/60'
                }`}
              >
                <span
                  className={`absolute top-1/2 -translate-y-1/2 left-0.5 w-5 h-5 rounded-full shadow-md transition-all duration-200 ${
                    formData.isPrivate
                      ? 'translate-x-5 bg-white'
                      : 'translate-x-0 bg-[var(--smoke)]'
                  }`}
                />
              </button>
            </div>

            {formData.isPrivate && (
              <div className="mt-4 pt-4 border-t border-[var(--steel)]/30">
                <label className="label">Pool Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    name="password"
                    value={formData.password}
                    onChange={handleChange}
                    placeholder="Enter a password for your pool"
                    className="input w-full pr-12"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--smoke)] hover:text-[var(--chrome)] transition-colors"
                  >
                    {showPassword ? (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                        <line x1="1" y1="1" x2="23" y2="23" />
                      </svg>
                    ) : (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>
                <p className="text-xs text-[var(--smoke)] mt-2">
                  Share this password with people you want to invite. They'll need it to buy squares.
                </p>
                {formData.isPrivate && !formData.password && (
                  <p className="text-xs text-[var(--championship-gold)] mt-1">
                    Please enter a password for your private pool
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="p-4 rounded-xl bg-[var(--steel)]/20 border border-[var(--steel)]/30">
            <div className="flex items-center gap-3 mb-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-[var(--championship-gold)]">
                <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2" />
                <path d="M16 2v4M8 2v4M3 10h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <span className="text-sm font-medium text-[var(--smoke)]" style={{ fontFamily: 'var(--font-display)', letterSpacing: '0.05em' }}>
                PURCHASE DEADLINE
              </span>
            </div>
            <p className="text-[var(--chrome)] font-bold">February 7, 2026 at 6:30 PM EST</p>
            <p className="text-xs text-[var(--smoke)] mt-1 opacity-70">
              Squares close 2 days before kickoff. Random numbers assigned automatically via Chainlink VRF.
            </p>
          </div>
        </div>
      </div>

      {/* Section 1: Pricing */}
      <div className={`card p-8 transition-all duration-300 !overflow-visible ${activeSection === 1 ? 'block' : 'hidden'}`}>
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

        <div className="space-y-6 overflow-visible">
          {/* Token Selection */}
          <div className="overflow-visible">
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
                className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-sm font-bold z-10"
                style={{
                  backgroundColor: 'var(--midnight)',
                  boxShadow: `inset 0 0 0 100px ${color}30`,
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
                  value={formData[name as 'q1Payout' | 'halftimePayout' | 'q3Payout' | 'finalPayout']}
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

          {/* Pool Privacy */}
          <div className="p-4 rounded-xl bg-[var(--steel)]/10 border border-[var(--steel)]/20">
            <div className="flex justify-between items-center">
              <span className="text-[var(--smoke)]">Pool Access</span>
              <span className={`font-bold flex items-center gap-2 ${formData.isPrivate ? 'text-[var(--championship-gold)]' : 'text-[var(--turf-green)]'}`}>
                {formData.isPrivate ? (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <rect x="3" y="11" width="18" height="11" rx="2" stroke="currentColor" strokeWidth="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                    Private (Password Protected)
                  </>
                ) : (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
                      <path d="M12 16v-4M12 8h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                    Public (Anyone can join)
                  </>
                )}
              </span>
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


          {/* Payouts */}
          <div className="p-4 rounded-xl bg-[var(--steel)]/10 border border-[var(--steel)]/20">
            <div className="text-[var(--smoke)] mb-3">Payout Structure</div>
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: 'Q1', payout: formData.q1Payout, color: 'var(--turf-green)' },
                { label: 'Halftime', payout: formData.halftimePayout, color: 'var(--grass-light)' },
                { label: 'Q3', payout: formData.q3Payout, color: 'var(--electric-lime)' },
                { label: 'Final', payout: formData.finalPayout, color: 'var(--championship-gold)' },
              ].map(({ label, payout, color }) => {
                const maxPot = parseFloat(formData.squarePrice || '0') * 100;
                const amount = (maxPot * parseInt(payout || '0')) / 100;
                const decimals = selectedToken.decimals === 6 ? 2 : 4;
                return (
                  <div key={label} className="text-center p-2 rounded-lg" style={{ backgroundColor: `${color}10` }}>
                    <div className="text-xs text-[var(--smoke)]">{label}</div>
                    <div className="font-bold" style={{ color }}>
                      {parseFloat(amount.toFixed(decimals))} {selectedToken.symbol}
                    </div>
                    <div className="text-xs text-[var(--smoke)]">{payout}%</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Deadline */}
          <div className="p-4 rounded-xl bg-[var(--steel)]/10 border border-[var(--steel)]/20">
            <div className="flex justify-between items-center mb-2">
              <span className="text-[var(--smoke)]">Purchase Deadline</span>
              <span className="font-bold text-[var(--chrome)]">Feb 7, 2026 @ 6:30 PM EST</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[var(--smoke)]">Numbers Assigned</span>
              <span className="font-medium text-blue-400 flex items-center gap-2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
                  <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
                Via Chainlink VRF
              </span>
            </div>
          </div>

          {/* Pool Creation Cost */}
          {totalCost !== undefined && totalCost > BigInt(0) && (
            <div className="p-4 rounded-xl bg-[var(--championship-gold)]/10 border border-[var(--championship-gold)]/30">
              <div className="flex items-start gap-3">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-[var(--championship-gold)] mt-0.5 shrink-0">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
                  <path d="M12 6v12M9 9h6M9 15h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
                <div className="flex-1">
                  <div className="flex justify-between items-center">
                    <span className="text-[var(--championship-gold)] font-medium">Pool Creation Deposit</span>
                    <span className="font-bold text-[var(--championship-gold)]">
                      {(Number(totalCost) / 1e18).toFixed(4)} ETH
                    </span>
                  </div>
                  <p className="text-xs text-[var(--smoke)] mt-1">
                    This deposit funds Chainlink VRF for random number generation. It ensures your pool can assign numbers fairly.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* No Fees Notice */}
          <div className="p-4 rounded-xl bg-[var(--turf-green)]/10 border border-[var(--turf-green)]/20">
            <div className="flex items-start gap-3">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-[var(--turf-green)] mt-0.5 shrink-0">
                <path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <div>
                <p className="text-[var(--turf-green)] font-medium">100% to Winners</p>
                <p className="text-xs text-[var(--smoke)] mt-1">
                  No cut from the pot. While funds sit in the pool, they earn yield on Aave. We keep that instead of taking a percentage. The power of programmable money!
                </p>
              </div>
            </div>
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
        <div className={`p-4 rounded-xl border ${isReceiptError ? 'bg-[var(--championship-gold)]/10 border-[var(--championship-gold)]/30' : 'bg-[var(--turf-green)]/10 border-[var(--turf-green)]/30'}`}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isReceiptError ? 'bg-[var(--championship-gold)]/20' : 'bg-[var(--turf-green)]/20'}`}>
                {isReceiptError ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-[var(--championship-gold)]">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
                    <path d="M12 8v4M12 16h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                ) : (
                  <div className="w-4 h-4 border-2 border-[var(--turf-green)] border-t-transparent rounded-full animate-spin" />
                )}
              </div>
              <div>
                <p className={`font-medium ${isReceiptError ? 'text-[var(--championship-gold)]' : 'text-[var(--turf-green)]'}`}>
                  {isReceiptError ? 'Confirmation Timeout' : 'Transaction Submitted'}
                </p>
                <a
                  href={getExplorerTxUrl(chainId, hash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-[var(--smoke)] hover:text-[var(--chrome)] font-mono mt-1 break-all underline"
                >
                  {hash.slice(0, 20)}...{hash.slice(-8)}
                </a>
              </div>
            </div>
            {(isReceiptError || isConfirming) && (
              <button
                type="button"
                onClick={() => refetchReceipt?.()}
                className="btn-secondary px-4 py-2 text-sm"
              >
                Check Status
              </button>
            )}
          </div>
          {isReceiptError && (
            <p className="text-xs text-[var(--smoke)] mt-3">
              Could not confirm transaction automatically. Click "Check Status" or view on Etherscan.
            </p>
          )}
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
            disabled={!address || isPending || isConfirming || isSwitching || payoutSum !== 100 || !canSubmit || !isFactoryConfigured || isLoadingCost || !!poolCreationPaused || isDeadlinePassed || isNameTaken || isCheckingName}
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
          chainId={chainId}
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
  chainId,
  onViewPool,
  onViewMyPools,
}: {
  poolAddress?: string;
  poolName: string;
  hash?: string;
  chainId?: number;
  onViewPool?: () => void;
  onViewMyPools: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const poolUrl = poolAddress
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/pools/${poolAddress}`
    : '';

  const handleCopyLink = async () => {
    if (poolUrl) {
      await navigator.clipboard.writeText(poolUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleShareTwitter = () => {
    // Replace dots with " dot " to avoid Twitter algorithm deboosting links
    const obfuscatedUrl = poolUrl.replace(/\./g, ' dot ');
    const text = `Join my Super Bowl Squares pool "${poolName}" on Super Bowl Squares! 🏈🏆\n\n${obfuscatedUrl}`;
    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
    window.open(twitterUrl, '_blank', 'width=600,height=400');
  };

  const handleShareFarcaster = () => {
    const text = `Join my Super Bowl Squares pool "${poolName}" 🏈🏆\n\n${poolUrl}`;
    const farcasterUrl = `https://warpcast.com/~/compose?text=${encodeURIComponent(text)}`;
    window.open(farcasterUrl, '_blank', 'width=600,height=700');
  };
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
                    href={getExplorerTxUrl(chainId, hash)}
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
                type="button"
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
                type="button"
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

            {/* Share buttons */}
            {poolAddress && (
              <div className="mt-6 pt-6 border-t border-[var(--steel)]/30">
                <p className="text-sm text-[var(--smoke)] mb-3">Share your pool with friends</p>
                <div className="flex gap-3 justify-center">
                  <button
                    type="button"
                    onClick={handleCopyLink}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--steel)]/30 border border-[var(--steel)]/50 hover:bg-[var(--steel)]/50 transition-colors text-sm"
                  >
                    {copied ? (
                      <>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                        <span className="text-[var(--turf-green)]">Copied!</span>
                      </>
                    ) : (
                      <>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                        </svg>
                        <span>Copy Link</span>
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={handleShareTwitter}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#1DA1F2]/20 border border-[#1DA1F2]/50 hover:bg-[#1DA1F2]/30 transition-colors text-sm text-[#1DA1F2]"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                    </svg>
                    <span>X</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleShareFarcaster}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#8465CB]/20 border border-[#8465CB]/50 hover:bg-[#8465CB]/30 transition-colors text-sm text-[#8465CB]"
                  >
                    <svg width="16" height="16" viewBox="0 0 1000 1000" fill="currentColor">
                      <path d="M257.778 155.556H742.222V844.444H671.111V528.889H670.414C662.554 441.677 589.258 373.333 500 373.333C410.742 373.333 337.446 441.677 329.586 528.889H328.889V844.444H257.778V155.556Z" />
                      <path d="M128.889 253.333L157.778 351.111H182.222V746.667C169.949 746.667 160 756.616 160 768.889V795.556H155.556C143.283 795.556 133.333 805.505 133.333 817.778V844.444H382.222V817.778C382.222 805.505 372.273 795.556 360 795.556H355.556V768.889C355.556 756.616 345.606 746.667 333.333 746.667H306.667V253.333H128.889Z" />
                      <path d="M675.556 746.667C663.283 746.667 653.333 756.616 653.333 768.889V795.556H648.889C636.616 795.556 626.667 805.505 626.667 817.778V844.444H875.556V817.778C875.556 805.505 865.606 795.556 853.333 795.556H848.889V768.889C848.889 756.616 838.94 746.667 826.667 746.667V351.111H851.111L880 253.333H702.222V746.667H675.556Z" />
                    </svg>
                    <span>Farcaster</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
