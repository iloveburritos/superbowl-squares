import { SquaresFactoryABI, SquaresPoolABI } from './abis';

// Chain IDs
export const CHAIN_IDS = {
  MAINNET: 1,
  BASE: 8453,
  ARBITRUM: 42161,
  SEPOLIA: 11155111,
  BASE_SEPOLIA: 84532,
  ARBITRUM_SEPOLIA: 421614,
} as const;

// Factory addresses per chain (to be updated after deployment)
export const FACTORY_ADDRESSES: Record<number, `0x${string}`> = {
  [CHAIN_IDS.MAINNET]: '0x0000000000000000000000000000000000000000',
  [CHAIN_IDS.BASE]: '0x0000000000000000000000000000000000000000',
  [CHAIN_IDS.ARBITRUM]: '0x0000000000000000000000000000000000000000',
  [CHAIN_IDS.SEPOLIA]: '0x26e1cea44259af44Cb291528503337d34915d769',
  [CHAIN_IDS.BASE_SEPOLIA]: '0x0000000000000000000000000000000000000000',
  [CHAIN_IDS.ARBITRUM_SEPOLIA]: '0x0000000000000000000000000000000000000000',
};

// Export ABIs
export { SquaresFactoryABI, SquaresPoolABI };

// Helper to get factory address for current chain
export function getFactoryAddress(chainId: number): `0x${string}` | undefined {
  return FACTORY_ADDRESSES[chainId];
}

// Pool states enum (matches contract)
export enum PoolState {
  OPEN = 0,
  CLOSED = 1,
  NUMBERS_ASSIGNED = 2,
  Q1_SCORED = 3,
  Q2_SCORED = 4,
  Q3_SCORED = 5,
  FINAL_SCORED = 6,
}

// Quarter enum (matches contract)
export enum Quarter {
  Q1 = 0,
  Q2 = 1,
  Q3 = 2,
  FINAL = 3,
}

// Pool state labels
export const POOL_STATE_LABELS: Record<PoolState, string> = {
  [PoolState.OPEN]: 'Open',
  [PoolState.CLOSED]: 'Closed',
  [PoolState.NUMBERS_ASSIGNED]: 'Numbers Assigned',
  [PoolState.Q1_SCORED]: 'Q1 Scored',
  [PoolState.Q2_SCORED]: 'Q2 Scored',
  [PoolState.Q3_SCORED]: 'Q3 Scored',
  [PoolState.FINAL_SCORED]: 'Final',
};

// Quarter labels
export const QUARTER_LABELS: Record<Quarter, string> = {
  [Quarter.Q1]: 'Q1',
  [Quarter.Q2]: 'Halftime',
  [Quarter.Q3]: 'Q3',
  [Quarter.FINAL]: 'Final',
};

// Score verification sources
export const SCORE_SOURCES = ['ESPN', 'Yahoo Sports', 'CBS Sports'] as const;

// Type definitions
export interface PoolInfo {
  name: string;
  state: PoolState;
  squarePrice: bigint;
  paymentToken: `0x${string}`;
  totalPot: bigint;
  squaresSold: bigint;
  teamAName: string;
  teamBName: string;
}

export interface Score {
  teamAScore: number;
  teamBScore: number;
  submitted: boolean;
  settled: boolean;
  requestId: `0x${string}`;
}

export interface PoolParams {
  name: string;
  squarePrice: bigint;
  paymentToken: `0x${string}`;
  maxSquaresPerUser: number;
  payoutPercentages: [number, number, number, number];
  teamAName: string;
  teamBName: string;
  purchaseDeadline: bigint;
  vrfTriggerTime: bigint;
  passwordHash: `0x${string}`;
}
