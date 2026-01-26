import { vi } from 'vitest';

// Mock Next.js router
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/',
}));

// Mock wagmi hooks
vi.mock('wagmi', async () => {
  const actual = await vi.importActual('wagmi');
  return {
    ...actual,
    useAccount: vi.fn(() => ({
      address: '0x1234567890123456789012345678901234567890',
      isConnected: true,
      chainId: 11155111, // Sepolia
    })),
    useChainId: vi.fn(() => 11155111),
    useSwitchChain: vi.fn(() => ({
      switchChain: vi.fn(),
      isPending: false,
    })),
    useReadContract: vi.fn(() => ({
      data: undefined,
      isLoading: false,
      error: null,
    })),
    useWriteContract: vi.fn(() => ({
      writeContract: vi.fn(),
      data: undefined,
      isPending: false,
      error: null,
      reset: vi.fn(),
    })),
    useWaitForTransactionReceipt: vi.fn(() => ({
      isLoading: false,
      isSuccess: false,
      data: undefined,
    })),
  };
});

// Mock RainbowKit
vi.mock('@rainbow-me/rainbowkit', () => ({
  ConnectButton: {
    Custom: ({ children }: { children: Function }) =>
      children({
        account: { displayName: '0x1234...5678' },
        chain: { name: 'Sepolia', hasIcon: false },
        openConnectModal: vi.fn(),
        openChainModal: vi.fn(),
        openAccountModal: vi.fn(),
        mounted: true,
      }),
  },
}));
