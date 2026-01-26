import { connectorsForWallets } from '@rainbow-me/rainbowkit';
import {
  metaMaskWallet,
  coinbaseWallet,
  rabbyWallet,
  phantomWallet,
  injectedWallet,
  rainbowWallet,
  trustWallet,
  walletConnectWallet,
  safeWallet,
} from '@rainbow-me/rainbowkit/wallets';
import { createConfig, http } from 'wagmi';
import { mainnet, sepolia, base, baseSepolia, arbitrum, arbitrumSepolia } from 'wagmi/chains';

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;
const hasValidProjectId = projectId && projectId !== 'your_project_id_here';

// Wallets that work without WalletConnect (browser extensions only)
const extensionOnlyWallets = [
  {
    groupName: 'Browser Wallets',
    wallets: [
      rabbyWallet,
      metaMaskWallet,
      coinbaseWallet,
      phantomWallet,
      injectedWallet,
    ],
  },
];

// Full wallet list including WalletConnect-dependent wallets
const allWallets = [
  {
    groupName: 'Popular',
    wallets: [
      rabbyWallet,
      metaMaskWallet,
      coinbaseWallet,
      rainbowWallet,
      trustWallet,
      phantomWallet,
    ],
  },
  {
    groupName: 'More',
    wallets: [
      walletConnectWallet,
      safeWallet,
      injectedWallet,
    ],
  },
];

const connectors = connectorsForWallets(
  hasValidProjectId ? allWallets : extensionOnlyWallets,
  {
    appName: 'Super Bowl Squares',
    projectId: projectId || 'placeholder',
  }
);

export const config = createConfig({
  connectors,
  chains: [mainnet, base, arbitrum, sepolia, baseSepolia, arbitrumSepolia],
  transports: {
    [mainnet.id]: http(),
    [base.id]: http(),
    [arbitrum.id]: http(),
    [sepolia.id]: http(),
    [baseSepolia.id]: http(),
    [arbitrumSepolia.id]: http(),
  },
  ssr: true,
});

// Chain-specific contract addresses
export const FACTORY_ADDRESSES: Record<number, `0x${string}`> = {
  // Mainnet
  1: '0x0000000000000000000000000000000000000000',
  // Base
  8453: '0x0000000000000000000000000000000000000000',
  // Arbitrum
  42161: '0x0000000000000000000000000000000000000000',
  // Sepolia
  11155111: '0xD6faaC1a709E760BAbF64272568402587f9b379D',
  // Base Sepolia
  84532: '0x0000000000000000000000000000000000000000',
  // Arbitrum Sepolia
  421614: '0x0000000000000000000000000000000000000000',
};

export const SUPPORTED_CHAINS = [
  { id: 1, name: 'Ethereum', icon: '/chains/ethereum.svg' },
  { id: 8453, name: 'Base', icon: '/chains/base.svg' },
  { id: 42161, name: 'Arbitrum', icon: '/chains/arbitrum.svg' },
  { id: 11155111, name: 'Sepolia', icon: '/chains/ethereum.svg', testnet: true },
  { id: 84532, name: 'Base Sepolia', icon: '/chains/base.svg', testnet: true },
  { id: 421614, name: 'Arbitrum Sepolia', icon: '/chains/arbitrum.svg', testnet: true },
];
