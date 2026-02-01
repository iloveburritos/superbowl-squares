# Super Bowl Squares DApp

A decentralized Super Bowl Squares betting game where users can create pools, buy squares with crypto, and automatically receive payouts based on game scores. Pool funds earn yield through Aave V3 while waiting for the game.

## Architecture

```
superbowl/
├── contracts/          # Solidity smart contracts (Foundry)
└── frontend/           # Next.js 14 web application
```

## Tech Stack

- **Smart Contracts:** Solidity 0.8.24, Foundry
- **Frontend:** Next.js 14, TypeScript, Tailwind CSS
- **Wallet:** RainbowKit, wagmi v2
- **Randomness:** Chainlink VRF v2.5
- **Yield:** Aave V3 (funds earn interest while in pool)
- **Chains:** Ethereum, Base, Arbitrum

## Deployed Addresses

| Chain | Factory | Block Explorer |
|-------|---------|----------------|
| Ethereum | `0x4e670Ce734c08e352b2C7aD8678fCDa63047D248` | [Etherscan](https://etherscan.io/address/0x4e670Ce734c08e352b2C7aD8678fCDa63047D248) |
| Arbitrum | `0xd573508f1D6B8751F72e3642a32c4Cc2EeFb5eA3` | [Arbiscan](https://arbiscan.io/address/0xd573508f1D6B8751F72e3642a32c4Cc2EeFb5eA3) |
| Base | `0xd573508f1D6B8751F72e3642a32c4Cc2EeFb5eA3` | [Basescan](https://basescan.org/address/0xd573508f1D6B8751F72e3642a32c4Cc2EeFb5eA3) |

## How It Works

1. **Create Pool:** Anyone creates a pool with team names, square price, and payout percentages (e.g., 15% Q1, 30% Halftime, 15% Q3, 40% Final)
2. **Buy Squares:** Users purchase squares (0-99) on the 10x10 grid using ETH or USDC
3. **Yield Generation:** Pool funds are deposited to Aave V3 to earn interest while waiting for the game
4. **Random Numbers:** Admin triggers Chainlink VRF to randomly assign digits 0-9 to rows and columns
5. **Score Submission:** Admin submits scores after each quarter - winners are paid automatically
6. **Win Condition:** Your square wins if the last digit of each team's score matches your row/column numbers
7. **Yield Withdrawal:** After the game, admin can withdraw accrued Aave yield

### Example
- Patriots score: 24, Seahawks score: 17
- Winning square: Row 4 (Patriots last digit), Column 7 (Seahawks last digit)
- Position 47 wins!

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) >= 18
- [Foundry](https://book.getfoundry.sh/getting-started/installation) for smart contracts

### Install Foundry

```bash
curl -L https://foundry.paradigm.xyz | bash
foundryup
```

### Smart Contracts

```bash
cd contracts

# Install dependencies
forge install

# Build
forge build

# Test
forge test

# Deploy (update .env with PRIVATE_KEY and RPC URLs)
forge script script/DeployMainnet.s.sol --rpc-url $MAINNET_RPC_URL --broadcast --verify
forge script script/DeployArbitrum.s.sol --rpc-url $ARBITRUM_RPC_URL --broadcast --verify
forge script script/DeployBase.s.sol --rpc-url $BASE_RPC_URL --broadcast --verify
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

## Contract Architecture

### SquaresFactory.sol
Factory contract for deploying pool instances and managing global settings.

**Key Functions:**
- `createPool(params)` - Deploy new pool with custom settings
- `getAllPools(offset, limit)` - Paginated pool list
- `getPoolsByCreator(address)` - Pools by creator
- `triggerVRFForAllPools()` - Batch trigger VRF for ready pools
- `submitScoreToAllPools(quarter, scoreA, scoreB)` - Submit scores to all pools
- `withdrawYieldFromAllPools()` - Batch withdraw yield from finished pools

### SquaresPool.sol
Individual pool contract managing one game.

**State Machine:**
```
OPEN → CLOSED → NUMBERS_ASSIGNED → Q1_SCORED → Q2_SCORED → Q3_SCORED → FINAL_SCORED
```

**Key Functions:**
- `buySquares(positions, password)` - Purchase squares (password for private pools)
- `closePoolAndRequestVRFFromFactory()` - Close and request random numbers
- `submitScoreFromFactory(quarter, scoreA, scoreB)` - Submit score (admin only)
- `claimPayout(quarter)` - Claim winnings (auto-paid on score submission)
- `withdrawYield()` - Withdraw Aave yield (admin only, after game ends)

## Features

- **Multi-chain:** Deployed on Ethereum, Arbitrum, and Base
- **Flexible Payments:** ETH or USDC
- **Private Pools:** Password-protected pools for friends/groups
- **Yield Generation:** Funds earn Aave V3 interest while in pool
- **Fair Randomness:** Chainlink VRF ensures provably fair number assignment
- **Auto Payouts:** Winners paid automatically when scores are submitted
- **Unclaimed Rollovers:** If no winner for a quarter, funds roll to next quarter

## Environment Variables

### Frontend (.env.local)
```
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_project_id
```

### Contracts (.env)
```
PRIVATE_KEY=your_private_key
MAINNET_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/...
BASE_RPC_URL=https://base-mainnet.g.alchemy.com/v2/...
ARBITRUM_RPC_URL=https://arb-mainnet.g.alchemy.com/v2/...
ETHERSCAN_API_KEY=your_key
BASESCAN_API_KEY=your_key
ARBISCAN_API_KEY=your_key
```

## Testing

```bash
cd contracts
forge test -vvv
```

## Security Considerations

- **Chainlink VRF** ensures provably fair randomness - no one can predict or manipulate number assignment
- **Aave V3** integration for secure yield generation on pool funds
- **Admin controls** limited to score submission and yield withdrawal
- **Automatic payouts** on score submission - winners can't be denied
- **Solidity 0.8.24** with built-in overflow protection
- **Reentrancy safe** - state changes before external calls
- **ERC-20 and ETH** payment support with proper handling

## License

MIT
