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
import { mainnet, sepolia, base, arbitrum } from 'wagmi/chains';

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
  chains: [mainnet, base, arbitrum, sepolia],
  transports: {
    [mainnet.id]: http(),
    [base.id]: http(),
    [arbitrum.id]: http(),
    [sepolia.id]: http(),
  },
  ssr: true,
});

// Chain-specific contract addresses
export const FACTORY_ADDRESSES: Record<number, `0x${string}`> = {
  // Mainnet
  1: '0x4e670Ce734c08e352b2C7aD8678fCDa63047D248',
  // Base
  8453: '0xd573508f1D6B8751F72e3642a32c4Cc2EeFb5eA3',
  // Arbitrum
  42161: '0xd573508f1D6B8751F72e3642a32c4Cc2EeFb5eA3',
  // Sepolia (no Aave integration)
  11155111: '0x27b0879ceaD424B20c358d6F2dC097fCd57BdBdE',
};

export const SUPPORTED_CHAINS = [
  { id: 1, name: 'Ethereum', icon: '/chains/ethereum.svg' },
  { id: 8453, name: 'Base', icon: '/chains/base.svg' },
  { id: 42161, name: 'Arbitrum', icon: '/chains/arbitrum.svg' },
  { id: 11155111, name: 'Sepolia', icon: '/chains/ethereum.svg', testnet: true },
];
