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
import { base, arbitrum, mainnet } from 'wagmi/chains';

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
  chains: [base, arbitrum, mainnet], // mainnet included for ENS lookups
  transports: {
    [base.id]: http(),
    [arbitrum.id]: http(),
    [mainnet.id]: http(), // For ENS resolution
  },
  ssr: true,
});

// Chain-specific contract addresses
export const FACTORY_ADDRESSES: Record<number, `0x${string}`> = {
  // Base
  8453: '0x45b17B0098002c5C33D649Aa8B5D366f1b903a5f',
  // Arbitrum
  42161: '0x45b17B0098002c5C33D649Aa8B5D366f1b903a5f',
};

export const SUPPORTED_CHAINS = [
  { id: 8453, name: 'Base', icon: '/chains/base.svg' },
  { id: 42161, name: 'Arbitrum', icon: '/chains/arbitrum.svg' },
];
