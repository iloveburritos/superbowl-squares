import { zeroAddress } from 'viem';

export interface Token {
  symbol: string;
  name: string;
  decimals: number;
  address: `0x${string}`;
  logoUrl?: string;
  isNative?: boolean;
}

// ETH is represented by zero address in the contract
export const ETH_TOKEN: Token = {
  symbol: 'ETH',
  name: 'Ethereum',
  decimals: 18,
  address: zeroAddress,
  logoUrl: '/tokens/eth.svg',
  isNative: true,
};

// Popular tokens per chain
export const TOKENS_BY_CHAIN: Record<number, Token[]> = {
  // Ethereum Mainnet
  1: [
    ETH_TOKEN,
    {
      symbol: 'USDC',
      name: 'USD Coin',
      decimals: 6,
      address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      logoUrl: '/tokens/usdc.svg',
    },
    {
      symbol: 'USDT',
      name: 'Tether USD',
      decimals: 6,
      address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
      logoUrl: '/tokens/usdt.svg',
    },
  ],
  // Base
  8453: [
    ETH_TOKEN,
    {
      symbol: 'USDC',
      name: 'USD Coin',
      decimals: 6,
      address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      logoUrl: '/tokens/usdc.svg',
    },
    {
      symbol: 'USDbC',
      name: 'USD Base Coin',
      decimals: 6,
      address: '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA',
      logoUrl: '/tokens/usdc.svg',
    },
  ],
  // Arbitrum
  42161: [
    ETH_TOKEN,
    {
      symbol: 'USDC',
      name: 'USD Coin',
      decimals: 6,
      address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
      logoUrl: '/tokens/usdc.svg',
    },
    {
      symbol: 'USDC.e',
      name: 'Bridged USDC',
      decimals: 6,
      address: '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8',
      logoUrl: '/tokens/usdc.svg',
    },
    {
      symbol: 'USDT',
      name: 'Tether USD',
      decimals: 6,
      address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
      logoUrl: '/tokens/usdt.svg',
    },
  ],
  // Sepolia Testnet
  11155111: [
    ETH_TOKEN,
    {
      symbol: 'USDC',
      name: 'USD Coin (Test)',
      decimals: 6,
      address: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
      logoUrl: '/tokens/usdc.svg',
    },
  ],
  // Base Sepolia
  84532: [
    ETH_TOKEN,
    {
      symbol: 'USDC',
      name: 'USD Coin (Test)',
      decimals: 6,
      address: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
      logoUrl: '/tokens/usdc.svg',
    },
  ],
  // Arbitrum Sepolia
  421614: [
    ETH_TOKEN,
    {
      symbol: 'USDC',
      name: 'USD Coin (Test)',
      decimals: 6,
      address: '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d',
      logoUrl: '/tokens/usdc.svg',
    },
  ],
};

// Get tokens for a specific chain, with ETH always first
export function getTokensForChain(chainId: number): Token[] {
  return TOKENS_BY_CHAIN[chainId] || [ETH_TOKEN];
}

// Find a token by address on a specific chain
export function findToken(chainId: number, address: `0x${string}`): Token | undefined {
  const tokens = getTokensForChain(chainId);
  return tokens.find((t) => t.address.toLowerCase() === address.toLowerCase());
}

// Check if a token is ETH (native token)
export function isNativeToken(token: Token): boolean {
  return token.isNative === true || token.address === zeroAddress;
}

// Format token amount for display
export function formatTokenAmount(amount: bigint, decimals: number, maxDecimals: number = 4): string {
  const divisor = BigInt(10 ** decimals);
  const wholePart = amount / divisor;
  const fractionalPart = amount % divisor;

  if (fractionalPart === BigInt(0)) {
    return wholePart.toString();
  }

  const fractionalStr = fractionalPart.toString().padStart(decimals, '0');
  const trimmed = fractionalStr.slice(0, maxDecimals).replace(/0+$/, '');

  if (trimmed === '') {
    return wholePart.toString();
  }

  return `${wholePart}.${trimmed}`;
}

// Parse token amount from string
export function parseTokenAmount(amount: string, decimals: number): bigint {
  const [whole, fraction = ''] = amount.split('.');
  const paddedFraction = fraction.padEnd(decimals, '0').slice(0, decimals);
  return BigInt(whole + paddedFraction);
}
