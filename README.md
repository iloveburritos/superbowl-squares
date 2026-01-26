# Super Bowl Squares DApp

A decentralized Super Bowl Squares betting game where users can create pools, buy squares with crypto, and automatically receive payouts based on game scores.

## Architecture

```
superbowl/
├── contracts/          # Solidity smart contracts (Foundry)
├── frontend/           # Next.js 14 web application
└── subgraph/           # The Graph indexer
```

## Tech Stack

- **Smart Contracts:** Solidity 0.8.24, Foundry
- **Frontend:** Next.js 14, TypeScript, Tailwind CSS
- **Wallet:** RainbowKit, wagmi v2
- **Randomness:** Chainlink VRF v2.5
- **Score Oracle:** UMA Optimistic Oracle v3
- **Indexing:** The Graph
- **Chains:** Ethereum, Base, Arbitrum

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) >= 18
- [Foundry](https://book.getfoundry.sh/getting-started/installation) for smart contracts
- [pnpm](https://pnpm.io/) or npm

### Install Foundry

```bash
curl -L https://foundry.paradigm.xyz | bash
foundryup
```

### Smart Contracts

```bash
cd contracts

# Install dependencies
forge install OpenZeppelin/openzeppelin-contracts
forge install smartcontractkit/chainlink
forge install foundry-rs/forge-std

# Build
forge build

# Test
forge test

# Deploy (update .env with PRIVATE_KEY and RPC URLs)
forge script script/Deploy.s.sol --rpc-url $RPC_URL --broadcast
```

### Frontend

```bash
cd frontend

# Install dependencies
npm install

# Set environment variables
cp .env.example .env.local
# Edit .env.local with your WalletConnect Project ID

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### Subgraph

```bash
cd subgraph

# Install dependencies
npm install

# Generate types
npm run codegen

# Build
npm run build

# Deploy to The Graph Studio
npm run deploy
```

## Contract Architecture

### SquaresFactory.sol
Factory contract for deploying pool instances.

**Functions:**
- `createPool(params)` - Deploy new pool
- `getAllPools(offset, limit)` - Paginated pool list
- `getPoolsByCreator(address)` - Pools by creator

### SquaresPool.sol
Individual pool contract managing one game.

**State Machine:**
```
OPEN → CLOSED → NUMBERS_ASSIGNED → Q1_SCORED → Q2_SCORED → Q3_SCORED → FINAL_SCORED
```

**Key Functions:**
- `buySquares(positions)` - Purchase squares
- `closePool()` - Stop purchases (operator)
- `requestRandomNumbers()` - Trigger VRF
- `submitScore(quarter, scoreA, scoreB)` - Submit via UMA
- `settleScore(quarter)` - Settle after dispute period
- `claimPayout(quarter)` - Claim winnings

## How It Works

1. **Create Pool:** Operator creates a pool with team names, pricing, and payout structure
2. **Buy Squares:** Users purchase squares (0-99) on the 10x10 grid
3. **Close & Randomize:** After purchase deadline, operator closes pool and requests VRF random numbers
4. **Numbers Assigned:** Chainlink VRF assigns random 0-9 to rows/columns
5. **Score Submission:** Anyone can submit scores via UMA Oracle (requires bond)
6. **Dispute Period:** 2-hour window for disputes on submitted scores
7. **Settlement:** Scores settle after dispute period, winners determined
8. **Claim Payouts:** Winners claim their payouts

## Deployed Addresses

| Chain | Factory | Block Explorer |
|-------|---------|----------------|
| Ethereum | TBD | [Etherscan](https://etherscan.io) |
| Base | TBD | [Basescan](https://basescan.org) |
| Arbitrum | TBD | [Arbiscan](https://arbiscan.io) |

## Environment Variables

### Frontend (.env.local)
```
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_project_id
```

### Contracts (.env)
```
PRIVATE_KEY=your_private_key
MAINNET_RPC_URL=https://...
SEPOLIA_RPC_URL=https://...
BASE_RPC_URL=https://...
ARBITRUM_RPC_URL=https://...
ETHERSCAN_API_KEY=your_key
BASESCAN_API_KEY=your_key
ARBISCAN_API_KEY=your_key
```

## Testing

### Smart Contract Tests
```bash
cd contracts
forge test -vvv
```

### Frontend Tests
```bash
cd frontend
npm test
```

## Security Considerations

- VRF ensures provably fair randomness
- UMA Oracle provides decentralized score verification
- Dispute period allows challenges to incorrect scores
- Operator privileges limited to pool management
- ERC-20 and ETH payment support
- Reentrancy guards on all payouts

## License

MIT
